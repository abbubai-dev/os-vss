import pool from '../config/db.js';

export async function handlePatients(req) {
  const url = new URL(req.url);
  const method = req.method;

  // GET /api/patients/lookup?ic={ic_number} (For Auto-fill)
  if (method === 'GET' && url.pathname === '/api/patients/lookup') {
    const ic = url.searchParams.get('ic');
    if (!ic) return new Response(JSON.stringify({ error: 'IC required' }), { status: 400 });

    try {
      const result = await pool.query(
        `SELECT name, phone_number, gender FROM patients WHERE ic_number = $1`,
        [ic]
      );
      if (result.rowCount > 0) {
        return new Response(JSON.stringify({ found: true, patient: result.rows[0] }), { status: 200 });
      }
      return new Response(JSON.stringify({ found: false }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // EXISTING: GET /api/patients?search={query} (For Search Modal)
  if (method === 'GET' && url.pathname === '/api/patients') {
    const searchQuery = url.searchParams.get('search');
    if (!searchQuery) return new Response(JSON.stringify({ error: 'Search term is required' }), { status: 400 });

    try {
      const queryText = `
        SELECT p.name, p.ic_number, p.phone_number, 
               a.id as appt_id, a.appt_date, a.appt_time, a.treatment, a.status, a.patient_type
        FROM patients p
        JOIN appointments a ON p.id = a.patient_id
        WHERE p.name ILIKE $1 OR p.ic_number ILIKE $1
        ORDER BY a.appt_date DESC
      `;
      const result = await pool.query(queryText, [`%${searchQuery}%`]);
      return new Response(JSON.stringify(result.rows), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
}