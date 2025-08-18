export function adminAuth(req, res, next) {
  const required = process.env.ADMIN_TOKEN;
  if (!required) return next();
  const got = req.headers['x-admin-token'] || req.headers['x-admin'] || '';
  if (got === required) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

export default { adminAuth };
