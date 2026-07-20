import jwt from 'jsonwebtoken';

export function verifyToken(req) {
  // Check if the Authorization header exists
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Access Denied: Missing or invalid token format.' };
  }

  // Extract the token (Remove "Bearer ")
  const token = authHeader.split(' ')[1];

  try {
    // Verify the token using your secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { valid: true, user: decoded }; // Contains { username, role }
  } catch (err) {
    return { valid: false, error: 'Access Denied: Invalid or expired token.' };
  }
}