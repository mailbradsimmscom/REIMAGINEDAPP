// src/middleware/requestId.js (ESM, Node 18+)
import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  // Accept a caller-provided X-Request-Id if present, otherwise generate one
  const hdr = req.headers['x-request-id'];
  const id =
    typeof hdr === 'string' && hdr.trim().length > 0
      ? hdr.trim()
      : randomUUID();

  // Attach where other code might look
  req.id = id;
  req.requestId = id;
  res.locals.requestId = id;

  // Echo back in a canonical header
  res.setHeader('X-Request-Id', id);

  next();
}
