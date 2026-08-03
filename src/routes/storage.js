import { generateUploadUrl, generateViewUrl } from '../r2.js';

export async function handleStorage(req) {
  const url = new URL(req.url);
  const method = req.method;

  // 1. POST /api/storage/upload-url (Generate presigned upload URL for React)
  if (method === 'POST' && url.pathname === '/api/storage/upload-url') {
    try {
      const body = await req.json();
      const { patientId, filename, contentType } = body;

      // Create a unique file path inside the R2 bucket
      const uniqueFilename = `${crypto.randomUUID()}-${filename}`;
      const fileKey = `scans/${patientId}/${uniqueFilename}`;

      const uploadUrl = await generateUploadUrl(fileKey, contentType);

      return new Response(JSON.stringify({ uploadUrl, fileKey }), { status: 200 });
    } catch (err) {
      console.error('R2 Upload Error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  // 2. GET /api/storage/view-url (Generate presigned view/stream URL for React/Viewer)
  if (method === 'GET' && url.pathname === '/api/storage/view-url') {
    try {
      const fileKey = url.searchParams.get('fileKey');

      if (!fileKey) {
        return new Response(JSON.stringify({ error: 'fileKey is required' }), { status: 400 });
      }

      const viewUrl = await generateViewUrl(fileKey);

      return new Response(JSON.stringify({ viewUrl }), { status: 200 });
    } catch (err) {
      console.error('R2 View Error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ error: 'Route not found' }), { status: 404 });
}