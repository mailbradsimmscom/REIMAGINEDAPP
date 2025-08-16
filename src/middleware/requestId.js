// src/middleware/requestId.js (ESM)
import { randomUUID } from 'crypto';

export function requestId(req, res, next) {
  const idFromHeader = req.headers['x-request-id'];
  const id = (typeof idFromHeader === 'string' && idFromHeader.trim()) ? idFromHeader : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
