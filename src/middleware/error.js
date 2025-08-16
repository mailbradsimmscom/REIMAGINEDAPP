const notFound = (req, res, _next) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
};

const errorHandler = (err, req, res, _next) => {
  console.error('[error]', { id: req.id, msg: err.message, stack: err.stack });
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || 'Internal Server Error',
    requestId: req.id,
  });
};

module.exports = { notFound, errorHandler };
