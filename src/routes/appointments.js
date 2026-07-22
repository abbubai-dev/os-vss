import pool from '../config/db.js';

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
        SELECT TO_CHAR(appt_date, 'YYYY-MM-DD') as appt_date, COUNT(*) as total_patients 
        FROM appointments 
        WHERE status != 'Deleted' 
        GROUP BY appt_date 
        ORDER BY appt_date ASC
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

      // Fetch the queue, hiding 'Deleted' patients
      const queryText = `
        SELECT a.*, p.name, p.ic_number, p.phone_number, p.gender
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.appt_date = $1 AND a.status != 'Deleted'
        ORDER BY a.appt_time ASC
      `;
      const result = await pool.query(queryText, [dateParam]);
      return new Response(JSON.stringify(result.rows), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 2. POST /api/appointments (Book slot + handle auto-registration of patients)
  if (method === 'POST' && url.pathname === '/api/appointments') {
    try {
      const body = await req.json();
      const { name, ic_number, phone_number, gender, appt_date, appt_time, source, treatment, notes } = body;

      // Validate operational constraints
     // if (!verifyOperationalDate(appt_date)) {
     //   return new Response(JSON.stringify({ error: 'Selected date is not a valid bi-weekly Oral Surgery clinic day.' }), { status: 400 });
     // }

      // Step A: Upsert Patient (Find existing by IC, or create a new profile)
      let patientRes = await pool.query('SELECT id FROM patients WHERE ic_number = $1', [ic_number]);
      let patientId;
      let patientType = 'Baru';

      if (patientRes.rows.length > 0) {
        patientId = patientRes.rows[0].id;
        patientType = 'Ulangan'; // Patient already exists in database system
      } else {
        const newPatient = await pool.query(
          'INSERT INTO patients (name, ic_number, phone_number, gender) VALUES ($1, $2, $3, $4) RETURNING id',
          [name, ic_number, phone_number, gender]
        );
        patientId = newPatient.rows[0].id;
      }

      // Step B: Insert the operational appointment slot
      const newAppt = await pool.query(
        `INSERT INTO appointments (patient_id, appt_date, appt_time, source, treatment, patient_type, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, 'Scheduled', $7) RETURNING *`,
        [patientId, appt_date, appt_time, source, treatment, patientType, notes]
      );

      return new Response(JSON.stringify({ success: true, data: newAppt.rows[0] }), { status: 201 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 3. PATCH /api/appointments/:id/checkin (Update status to Checked-In)
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

  // 4. PATCH /api/appointments/:id/checkout (Discharge or set Next Visit)
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
  
  // 5. PATCH /api/appointments/:id/reschedule (Change Date/Time)
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

  // 6. PATCH /api/appointments/:id/delete (Soft Delete)
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

  // Route fallback handling
  return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
}