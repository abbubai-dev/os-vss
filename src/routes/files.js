import pool from '../config/db.js';

export async function handleFiles(req) {
  const url = new URL(req.url);
  const method = req.method;

  // POST /api/attachments/upload
  if (method === 'POST' && url.pathname === '/api/attachments/upload') {
    try {
      // Bun natively parses multipart/form-data
      const formdata = await req.formData();
      const patient_id = formdata.get('patient_id');
      const file_type = formdata.get('file_type'); // Referral, X-Ray, Bloodtest, Others
      const file = formdata.get('file'); 

      if (!patient_id || !file_type || !file) {
        return new Response(JSON.stringify({ error: 'Missing patient_id, file_type, or file payload' }), { status: 400 });
      }

      // Create a unique filename to prevent accidental overwrites
      const fileExtension = file.name.split('.').pop();
      const uniqueFileName = `patient-${patient_id}-${Date.now()}.${fileExtension}`;
      const filePath = `uploads/${uniqueFileName}`;

      // Write the file directly to the disk using Bun's ultra-fast I/O
      await Bun.write(filePath, file);

      // Save the reference in the database
      const result = await pool.query(
        `INSERT INTO attachments (patient_id, file_type, file_name, file_url) VALUES ($1, $2, $3, $4) RETURNING *`,
        [patient_id, file_type, file.name, `/${filePath}`] // Notice we prepend '/' so the frontend can fetch it easily
      );

      return new Response(JSON.stringify({ success: true, data: result.rows[0] }), { status: 201 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // GET /api/attachments/:patient_id (Fetch all files for a specific patient)
  if (method === 'GET' && url.pathname.match(/^\/api\/attachments\/[^\/]+$/)) {
    try {
      const patient_id = url.pathname.split('/')[3];
      const result = await pool.query(
        `SELECT * FROM attachments WHERE patient_id = $1 ORDER BY uploaded_at DESC`,
        [patient_id]
      );
      return new Response(JSON.stringify({ success: true, data: result.rows }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
  
  return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
}