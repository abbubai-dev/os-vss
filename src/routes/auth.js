import jwt from 'jsonwebtoken';

// Helper function to extract credentials from .env
function getValidUsers() {
  const users = [];
  const envRoles = ['ADMIN_CREDS', 'ASSISTANT_CREDS', 'SPECIALIST_CREDS'];
  
  envRoles.forEach(envKey => {
    if (process.env[envKey]) {
      const [username, password] = process.env[envKey].split(':');
      users.push({ 
        username, 
        password, 
        role: envKey.split('_')[0].toLowerCase() // e.g., 'admin', 'assistant'
      });
    }
  });
  return users;
}

export async function handleAuth(req) {
  const url = new URL(req.url);

  // POST /api/login
  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const body = await req.json();
      const { username, password } = body;

      const users = getValidUsers();
      const validUser = users.find(u => u.username === username && u.password === password);

      if (!validUser) {
        return new Response(JSON.stringify({ error: 'Invalid username or password' }), { 
          status: 401, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }

      // Generate a token valid for 12 hours (covers a full clinic shift)
      const token = jwt.sign(
        { username: validUser.username, role: validUser.role },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
      );

      return new Response(JSON.stringify({ success: true, token, role: validUser.role }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Login processing failed' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Auth route not found' }), { 
    status: 404, 
    headers: { 'Content-Type': 'application/json' } 
  });
}