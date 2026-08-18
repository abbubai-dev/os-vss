import pool from '../config/db.js';
import { sendTriageAlert } from '../utils/mailer.js';

export async function handleAppointments(req) {
  const url = new URL(req.url);
  const method = req.method;

  // 1. GET /api/appointments/counts (Fetch patient density per day)
  if (method === 'GET' && url.pathname === '/api/appointments/counts') {
    try {
      const result = await pool.query(`
        SELECT appt_date as date, COUNT(*) as count 
        FROM appointments 
        WHERE status != 'Deleted' 
          AND triage_status != 'Pending Triage' 
          AND appt_date IS NOT NULL
        GROUP BY appt_date
      `);
      return new Response(JSON.stringify(result.rows), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 2. GET /api/appointments?date=YYYY-MM-DD
  if (method === 'GET' && url.pathname === '/api/appointments') {
    const dateParam = url.searchParams.get('date');
    if (!dateParam) return new Response(JSON.stringify({ error: 'Date is required' }), { status: 400 });

    try {
      // AUTO-FTA LOGIC: Before fetching, instantly update any past 'Scheduled' visits to 'FTA'
      await pool.query(`
        UPDATE appointments 
        SET status = 'FTA' 
        WHERE status = 'Scheduled' AND appt_date < CURRENT_DATE
      `);

      // Fetch the queue, hiding 'Deleted' patients, and check for attachments
      const queryText = `
        SELECT a.*, p.name, p.ic_number, p.phone_number, p.gender,
               EXISTS(SELECT 1 FROM attachments att WHERE att.patient_id = p.id) as has_attachments
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.appt_date = $1 
          AND a.status != 'Deleted' 
          AND a.triage_status != 'Pending Triage'
        ORDER BY a.appt_time ASC
      `;
      const result = await pool.query(queryText, [dateParam]);
      return new Response(JSON.stringify(result.rows), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  //3. GET /api/appointments/triage (Fetch all unscheduled referrals for the PIC)
  if (method === 'GET' && url.pathname === '/api/appointments/triage') {
    try {
      const result = await pool.query(`
        SELECT a.*, p.name, p.ic_number, p.phone_number, p.gender,
               EXISTS(SELECT 1 FROM attachments att WHERE att.patient_id = p.id) as has_attachments
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.triage_status = 'Pending Triage' AND a.status != 'Deleted'
        ORDER BY a.id DESC
      `);
      return new Response(JSON.stringify(result.rows), { status: 200 });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  //4. POST /api/appointments (Create new appointment OR referral)
  if (method === 'POST' && url.pathname === '/api/appointments') {
    try {
      const { 
        name, ic_number, phone_number, gender, // <-- NEW: Now capturing the patient's biodata!
        appt_date, appt_time, treatment, source, patient_type, notes,
        htpg_consult 
      } = await req.json();

      // ---> NEW: FIND OR CREATE PATIENT FIRST <---
      let final_patient_id;
      const existingPatient = await pool.query('SELECT id FROM patients WHERE ic_number = $1', [ic_number]);
      
      if (existingPatient.rowCount > 0) {
        // Patient exists, use their ID
        final_patient_id = existingPatient.rows[0].id;
      } else {
        // New patient! Create them in the database and grab their new ID
        const newPatient = await pool.query(
          'INSERT INTO patients (name, ic_number, phone_number, gender) VALUES ($1, $2, $3, $4) RETURNING id',
          [name, ic_number, phone_number, gender]
        );
        final_patient_id = newPatient.rows[0].id;
      }

      // If no date/time is provided, it goes to the Triage Inbox
      const triageStatus = (appt_date && appt_time) ? 'Scheduled' : 'Pending Triage';

      // ---> NEW: Automatically assign to Specialist if scheduled directly <---
      const defaultAssignee = (appt_date && appt_time) ? 'Specialist' : null;

      const result = await pool.query(
        `INSERT INTO appointments 
         (patient_id, appt_date, appt_time, treatment, source, patient_type, notes, status, htpg_consult, triage_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Scheduled', $8, $9) RETURNING *`,
        [final_patient_id, appt_date || null, appt_time || null, treatment, source, patient_type, notes, htpg_consult || 'None', triageStatus]
      );

      // ---> UPDATED: FIRE AUTOMATED EMAIL IF ROUTED TO TRIAGE <---
      if (triageStatus === 'Pending Triage') {
        // We can now just use the 'name' variable directly from the frontend payload!
        sendTriageAlert({
          name: name || 'Unknown Patient',
          source: source,
          treatment: treatment,
          htpg_consult: htpg_consult || 'None',
          notes: notes
        });
      }
      
      return new Response(JSON.stringify({ success: true, data: result.rows[0] }), { status: 201 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 5. PATCH /api/appointments/:id/checkin (Update status to Checked-In)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/checkin$/)) {
    try {
      const id = url.pathname.split('/')[3];
      const result = await pool.query(
        `UPDATE appointments SET status = 'Checked-In' WHERE id = $1 RETURNING *`,
        [id]
      );
      if (result.rowCount === 0) return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
      return new Response(JSON.stringify({ success: true, data: result.rows[0] }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 6. PATCH /api/appointments/:id/checkout (Discharge or set Next Visit)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/checkout$/)) {
    try {
      const id = url.pathname.split('/')[3];
      const body = await req.json();
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        let nextVisitId = null;
        
        // If they want to schedule a follow-up (Ulangan)
        if (body.next_appt_date) {
          const currentAppt = await client.query(`SELECT * FROM appointments WHERE id = $1`, [id]);
          const appt = currentAppt.rows[0];
          
          // NEW: We now accept assigned_to from the frontend, defaulting to 'Specialist' if missing
          const targetClinic = body.assigned_to || 'Specialist';

          const newAppt = await client.query(
            `INSERT INTO appointments 
             (patient_id, appt_date, appt_time, source, treatment, patient_type, status, notes, htpg_consult, triage_status, assigned_to)
             VALUES ($1, $2, $3, $4, $5, 'Ulangan', 'Scheduled', $6, $7, 'Scheduled', $8) RETURNING id`,
            [appt.patient_id, body.next_appt_date, body.next_appt_time || '08:00:00', appt.source, 'Review', body.notes, appt.htpg_consult || 'None', targetClinic]
          );
          nextVisitId = newAppt.rows[0].id;
        }

        const updatedAppt = await client.query(
          `UPDATE appointments SET status = 'Discharged', next_visit_id = $1 WHERE id = $2 RETURNING *`,
          [nextVisitId, id]
        );

        await client.query('COMMIT');
        return new Response(JSON.stringify({ success: true, data: updatedAppt.rows[0] }), { status: 200 });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
  
  // 7. PATCH /api/appointments/:id/reschedule (Change Date/Time/Clinic)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/reschedule$/)) {
    try {
      const id = url.pathname.split('/')[3];
      // NEW: Capture assigned_to from the request
      const { new_date, new_time, assigned_to } = await req.json(); 
      
      const result = await pool.query(
        `UPDATE appointments SET appt_date = $1, appt_time = $2, assigned_to = $3 WHERE id = $4 RETURNING *`,
        [new_date, new_time, assigned_to || 'Specialist', id]
      );
      
      if (result.rowCount === 0) return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
      return new Response(JSON.stringify({ success: true, data: result.rows[0] }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 8. PATCH /api/appointments/:id/delete (Soft Delete)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/delete$/)) {
    try {
      const id = url.pathname.split('/')[3];
      const result = await pool.query(
        `UPDATE appointments SET status = 'Deleted' WHERE id = $1 RETURNING *`,
        [id]
      );
      if (result.rowCount === 0) return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 9. PATCH /api/appointments/:id/notes (Update Initial Notes)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/notes$/)) {
    try {
      const id = url.pathname.split('/')[3];
      const { notes } = await req.json();
      
      const result = await pool.query(
        `UPDATE appointments SET notes = $1 WHERE id = $2 RETURNING *`,
        [notes, id]
      );
      
      if (result.rowCount === 0) return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
      return new Response(JSON.stringify({ success: true, data: result.rows[0] }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  //10. PATCH /api/appointments/:id/triage-route (PIC assigning date/time and specialist/PIC role)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/triage-route$/)) {
    try {
      const id = url.pathname.split('/')[3];
      const { appt_date, appt_time, assigned_to } = await req.json();
      
      const result = await pool.query(
        `UPDATE appointments 
         SET appt_date = $1, appt_time = $2, assigned_to = $3, triage_status = 'Scheduled'
         WHERE id = $4 RETURNING *`,
        [appt_date, appt_time, assigned_to, id]
      );
      
      if (result.rowCount === 0) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      return new Response(JSON.stringify({ success: true, data: result.rows[0] }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 11. GET /api/appointments/kpi-report (Generate State KPI Data)
  if (method === 'GET' && url.pathname === '/api/appointments/kpi-report') {
    const month = url.searchParams.get('month'); // e.g., '08'
    const year = url.searchParams.get('year');   // e.g., '2026'
    
    try {
      const result = await pool.query(`
        SELECT htpg_consult as kpi, COUNT(*) as total 
        FROM appointments 
        WHERE htpg_consult != 'None'
          AND (
            (EXTRACT(MONTH FROM appt_date) = $1 AND EXTRACT(YEAR FROM appt_date) = $2)
            OR (appt_date IS NULL AND triage_status = 'Pending Triage') 
          )
        GROUP BY htpg_consult
        ORDER BY htpg_consult
      `, [month, year]);
      
      return new Response(JSON.stringify(result.rows), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // Route fallback handling
  return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
}