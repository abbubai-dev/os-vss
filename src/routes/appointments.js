import pool from '../config/db.js';
import { sendTriageAlert } from '../utils/mailer.js';

export async function handleAppointments(req) {
  const url = new URL(req.url);
  const method = req.method;

  // 1. GET /api/appointments/counts
  if (method === 'GET' && url.pathname === '/api/appointments/counts') {
    try {
      const result = await pool.query(`
        SELECT 
          appt_date as date, 
          COUNT(*) as total_count,
          SUM(CASE WHEN assigned_to = 'Specialist' THEN 1 ELSE 0 END) as specialist_count,
          SUM(CASE WHEN assigned_to = 'PIC' THEN 1 ELSE 0 END) as pic_count
        FROM appointments 
        WHERE status != 'Deleted'
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

  // 4. POST /api/appointments (Create new appointment OR referral)
  if (method === 'POST' && url.pathname === '/api/appointments') {
    try {
      // Notice we are ignoring patient_type from the frontend, we will calculate it ourselves!
      const { 
        name, ic_number, phone_number, gender, 
        appt_date, appt_time, assigned_to, 
        treatment, source, notes, htpg_consult 
      } = await req.json();

      let final_patient_id;
      let calculatedPatientType = 'Baru'; // Default to Baru

      // 1. Check if the IC already exists in the database
      const existingPatient = await pool.query('SELECT id FROM patients WHERE ic_number = $1', [ic_number]);
      
      if (existingPatient.rowCount > 0) {
        // Patient exists! Grab their ID.
        final_patient_id = existingPatient.rows[0].id;
        
        // 2. Check if they already have an appointment THIS YEAR
        // (Use the requested appt_date's year, or the current year if going to Triage)
        const targetYear = appt_date ? new Date(appt_date).getFullYear() : new Date().getFullYear();
        
        const yearlyCheck = await pool.query(`
          SELECT id FROM appointments 
          WHERE patient_id = $1 
            AND EXTRACT(YEAR FROM COALESCE(appt_date, created_at)) = $2
            AND status != 'Deleted'
          LIMIT 1
        `, [final_patient_id, targetYear]);
        
        // If they already have an appointment this year, they are 'Ulangan'
        if (yearlyCheck.rowCount > 0) {
          calculatedPatientType = 'Ulangan';
        }

      } else {
        // New patient! Create them in the database.
        const newPatient = await pool.query(
          'INSERT INTO patients (name, ic_number, phone_number, gender) VALUES ($1, $2, $3, $4) RETURNING id',
          [name, ic_number, phone_number, gender]
        );
        final_patient_id = newPatient.rows[0].id;
      }

      // 3. Handle Routing Status
      const triageStatus = (appt_date && appt_time) ? 'Scheduled' : 'Pending Triage';
      const finalAssignee = (appt_date && appt_time) ? (assigned_to || 'Specialist') : 'Unassigned';

      // 4. Save the Appointment
      const result = await pool.query(
        `INSERT INTO appointments 
         (patient_id, appt_date, appt_time, assigned_to, treatment, source, patient_type, notes, status, htpg_consult, triage_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Scheduled', $9, $10) RETURNING *`,
        [final_patient_id, appt_date || null, appt_time || null, finalAssignee, treatment, source, calculatedPatientType, notes, htpg_consult || 'None', triageStatus]
      );

      // 5. Fire Email Alert if sent to Triage
      if (triageStatus === 'Pending Triage') {
        sendTriageAlert({
          name: name || 'Unknown Patient', source: source, treatment: treatment,
          htpg_consult: htpg_consult || 'None', notes: notes
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
          const targetClinic = body.assigned_to || 'Specialist';

          const newAppt = await client.query(
            `INSERT INTO appointments 
             (patient_id, appt_date, appt_time, source, treatment, patient_type, status, notes, htpg_consult, triage_status, assigned_to)
             VALUES ($1, $2, $3, $4, $5, 'Ulangan', 'Scheduled', $6, $7, 'Scheduled', $8) RETURNING id`,
            [appt.patient_id, body.next_appt_date, body.next_appt_time || '08:00:00', appt.source, body.treatment || 'REVIEW', body.notes, appt.htpg_consult || 'None', targetClinic]
          );
          nextVisitId = newAppt.rows[0].id;

          // ---> NEW: SECOND FOLLOW-UP APPOINTMENT <---
          if (body.next_appt_date_2) {
            const targetClinic2 = body.assigned_to_2 || 'Specialist';
            await client.query(
              `INSERT INTO appointments 
               (patient_id, appt_date, appt_time, source, treatment, patient_type, status, notes, htpg_consult, triage_status, assigned_to)
               VALUES ($1, $2, $3, $4, $5, 'Ulangan', 'Scheduled', $6, $7, 'Scheduled', $8)`,
              [appt.patient_id, body.next_appt_date_2, body.next_appt_time_2 || '08:00:00', appt.source, body.treatment_2 || 'REVIEW', body.notes, appt.htpg_consult || 'None', targetClinic2]
            );
          }
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

  // 9. PATCH /api/appointments/:id/notes (Update Notes & Treatment)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/notes$/)) {
    try {
      const id = url.pathname.split('/')[3];
      const { notes, treatment } = await req.json(); // <--- NEW: Capture treatment
      
      const result = await pool.query(
        `UPDATE appointments 
         SET notes = COALESCE($1, notes), 
             treatment = COALESCE($2, treatment) 
         WHERE id = $3 RETURNING *`,
        [notes, treatment, id]
      );
      
      if (result.rowCount === 0) return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
      return new Response(JSON.stringify({ success: true, data: result.rows[0] }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 10. PATCH /api/appointments/:id/triage-route (PIC assigning date/time and specialist/PIC role)
  if (method === 'PATCH' && url.pathname.match(/^\/api\/appointments\/[^\/]+\/triage-route$/)) {
    try {
      const id = url.pathname.split('/')[3];
      // ---> NEW: Destructure treatment and htpg_consult
      const { appt_date, appt_time, assigned_to, treatment, htpg_consult } = await req.json();
      
      const result = await pool.query(
        `UPDATE appointments 
         SET appt_date = $1, 
             appt_time = $2, 
             assigned_to = $3, 
             treatment = $4, 
             htpg_consult = $5, 
             triage_status = 'Scheduled',
             status = 'Scheduled'
         WHERE id = $6 RETURNING *`,
        [appt_date, appt_time, assigned_to, treatment, htpg_consult, id] // ---> NEW: Passed to query
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

  // 12. GET /api/appointments/available-slots (Calculates free time slots for a specific date)
  if (method === 'GET' && url.pathname === '/api/appointments/available-slots') {
    const dateParam = url.searchParams.get('date');
    const excludeId = url.searchParams.get('exclude_id');
    
    if (!dateParam) return new Response(JSON.stringify({ error: 'Date is required' }), { status: 400 });
    
    try {
      // Get all booked times for this date
      let query = `SELECT appt_time FROM appointments WHERE appt_date = $1 AND status != 'Deleted' AND appt_time IS NOT NULL`;
      let params = [dateParam];
      
      // Ignore the current appointment's time if we are rescheduling
      if (excludeId && excludeId !== 'undefined' && excludeId !== 'null') {
        query += ` AND id != $2`;
        params.push(excludeId);
      }
      
      const bookedResult = await pool.query(query, params);
      
      // Extract just the "HH:MM" part from the database time string (e.g., "09:00:00" -> "09:00")
      const bookedTimes = bookedResult.rows.map(row => String(row.appt_time).substring(0, 5)); 
      
      // Define your clinic's standard working hours
      const allSlots = [
        "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
        "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"
      ];
      
      // Filter out the booked times
      const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
      
      return new Response(JSON.stringify(availableSlots), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 13. GET /api/appointments/holidays
  if (method === 'GET' && url.pathname === '/api/appointments/holidays') {
    try {
      const res = await pool.query('SELECT * FROM holidays ORDER BY holiday_date ASC');
      return new Response(JSON.stringify(res.rows), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 14. POST /api/appointments/holidays
  if (method === 'POST' && url.pathname === '/api/appointments/holidays') {
    try {
      const { holiday_date, description } = await req.json();
      await pool.query(
        'INSERT INTO holidays (holiday_date, description) VALUES ($1, $2) ON CONFLICT (holiday_date) DO NOTHING',
        [holiday_date, description]
      );
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
  
  // 15. DELETE /api/appointments/holidays/:id
  if (method === 'DELETE' && url.pathname.match(/^\/api\/appointments\/holidays\/[^\/]+$/)) {
    try {
      const id = url.pathname.split('/')[4]; // Changed to 4 because the path is longer now!
      await pool.query('DELETE FROM holidays WHERE id = $1', [id]);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // Route fallback handling
  return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
}