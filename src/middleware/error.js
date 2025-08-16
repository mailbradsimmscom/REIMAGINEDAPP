// src/middleware/error.js (ESM)
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const payload = {
    ok: false,
    error: err.message || 'Internal Server Error',
  };

  // include stack in non-production for easier debugging
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    payload.stack = err.stack;
  }

  // echo request id if present
  if (req && req.id) {
    payload.requestId = req.id;
  }

  res.status(status).json(payload);
}
