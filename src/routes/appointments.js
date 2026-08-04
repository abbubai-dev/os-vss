import pool from '../config/db.js';
import { sendTriageAlert } from '../utils/mailer.js';

// Business Validation Rule: Every 2 weeks on Tuesday
function verifyOperationalDate(targetDateStr) {
  const baselineDate = new Date('2026-01-06'); // Reference operational Tuesday
  const targetDate = new Date(targetDateStr);
  
  // 2 represents Tuesday in JavaScript's getDay()
  if (targetDate.getDay() !== 2) return false;
  
  const timeDiff = targetDate.getTime() - baselineDate.getTime();
  const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  
  return dayDiff % 14 === 0;
}

export async function handleAppointments(req) {
  const url = new URL(req.url);
  const method = req.method;

  // 1. GET /api/appointments/counts (Fetch patient density per day)
  if (method === 'GET' && url.pathname === '/api/appointments/counts') {
    try {
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
      const result = await pool.query(queryText);
      return new Response(JSON.stringify(result.rows), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 2. GET /api/appointments?date=YYYY-MM-DD
  if (method === 'GET' && url.pathname.startsWith('/api/appointments') && !url.pathname.includes('/counts')) {
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
        patient_id, appt_date, appt_time, treatment, source, patient_type, notes,
        htpg_consult // <-- NEW DATA
      } = await req.json();

      // If no date/time is provided, it goes to the Triage Inbox
      const triageStatus = (appt_date && appt_time) ? 'Scheduled' : 'Pending Triage';

      const result = await pool.query(
        `INSERT INTO appointments 
         (patient_id, appt_date, appt_time, treatment, source, patient_type, notes, status, htpg_consult, triage_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Scheduled', $8, $9) RETURNING *`,
        [patient_id, appt_date || null, appt_time || null, treatment, source, patient_type, notes, htpg_consult || 'None', triageStatus]
      );

      // ---> NEW: FIRE AUTOMATED EMAIL IF ROUTED TO TRIAGE <---
      if (triageStatus === 'Pending Triage') {
        // Fetch the patient's name for the email
        const patientRes = await pool.query(`SELECT name FROM patients WHERE id = $1`, [patient_id]);
        const patientName = patientRes.rows[0]?.name || 'Unknown Patient';
        
        // Fire the email asynchronously (don't use 'await' so it doesn't slow down the UI)
        sendTriageAlert({
          name: patientName,
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
      
      // We wrap this in a transaction because we might need to create a future appointment
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        let nextVisitId = null;
        
        // If they want to schedule a follow-up (Ulangan)
        if (body.next_appt_date) {
          if (!verifyOperationalDate(body.next_appt_date)) {
             throw new Error('Follow-up date is not a valid bi-weekly clinic day.');
          }
          
          // Get current appointment details to duplicate for the follow-up
          const currentAppt = await client.query(`SELECT * FROM appointments WHERE id = $1`, [id]);
          const appt = currentAppt.rows[0];
          
          const newAppt = await client.query(
            `INSERT INTO appointments (patient_id, appt_date, appt_time, source, treatment, patient_type, status, notes)
             VALUES ($1, $2, $3, $4, $5, 'Ulangan', 'Scheduled', $6) RETURNING id`,
            [appt.patient_id, body.next_appt_date, body.next_appt_time || '08:00:00', appt.source, 'Review', body.notes]
          );
          nextVisitId = newAppt.rows[0].id;
        }

        // Mark the current appointment as Discharged
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
  
  // 7. PATCH /api/appointments/:id/reschedule (Change Date/Time)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/reschedule$/)) {
    try {
      const id = url.pathname.split('/')[3];
      const { new_date, new_time } = await req.json();
      
      const result = await pool.query(
        `UPDATE appointments SET appt_date = $1, appt_time = $2 WHERE id = $3 RETURNING *`,
        [new_date, new_time, id]
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