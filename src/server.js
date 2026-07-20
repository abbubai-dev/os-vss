import { handleAppointments } from './routes/appointments.js';
import { handleFiles } from './routes/files.js';
import { handleAuth } from './routes/auth.js';
import { verifyToken } from './middleware/jwtAuth.js';
import { handlePatients } from './routes/patients.js';

const PORT = process.env.PORT || 3000;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const headers = { 'Content-Type': 'application/json' };

    // 1. Serve Uploaded Files Statically
    if (url.pathname.startsWith('/uploads/')) {
      const physicalPath = url.pathname.substring(1); 
      const file = Bun.file(physicalPath);
      if (await file.exists()) return new Response(file);
      return new Response('File not found', { status: 404 });
    }

    // 2. Public Route: Login
    if (url.pathname === '/api/login') {
      return handleAuth(req);
    }

    // 3. SECURE ZONE: All other /api/ routes require a valid JWT
    if (url.pathname.startsWith('/api/')) {
      const authCheck = verifyToken(req);
      
      // If token is invalid, reject the request immediately
      if (!authCheck.valid) {
        return new Response(JSON.stringify({ error: authCheck.error }), { 
          status: 401, 
          headers 
        });
      }

      // If valid, pass the request to the correct handler
      if (url.pathname.startsWith('/api/appointments')) {
        return handleAppointments(req);
      }
      
      if (url.pathname.startsWith('/api/attachments')) {
        return handleFiles(req);
      }

      if (url.pathname.startsWith('/api/patients')) {
        return handlePatients(req);
      }
    }

    return new Response(JSON.stringify({ status: "OS-CSS Engine Running Securely" }), { status: 200, headers });
  },
  
  error(error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

console.log(`🚀 Secure OS Server running on http://localhost:${PORT}`);