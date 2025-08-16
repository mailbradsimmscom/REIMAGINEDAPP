// index.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import routes from './src/routes/index.js';
import { requestId } from './src/middleware/requestId.js';
import { errorHandler } from './src/middleware/error.js';

const app = express();

// --- middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(requestId);

// --- welcome, health, ready
app.get('/', (_req, res) =>
  res.json({
    ok: true,
    name: 'REIMAGINEDSV API',
    docs: ['/api', '/bff', '/debug', '/admin', '/health', '/ready']
  })
);
app.get('/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);
app.get('/ready', (_req, res) =>
  res.json({ ok: true, ready: true, time: new Date().toISOString() })
);

// --- main router (handles /qa, /topics, /documents, /admin, etc.)
app.use('/', routes);

// --- 404
app.use((req, res) => res.status(404).json({ error: 'Not Found', path: req.path }));

// --- error handler
app.use(errorHandler);

// --- resilient listen (auto-bumps port if busy)
const PORT = process.env.PORT || 3000;
(function start(p) {
  const srv = app.listen(p, () => {
    console.log(`[server] listening on http://localhost:${p}`);
  });
  srv.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const next = (Number(p) || 3000) + 1;
      console.warn(`[server] port ${p} in use, retrying on ${next}…`);
      start(next);
    } else {
      throw err;
    }
  });
})(PORT);
