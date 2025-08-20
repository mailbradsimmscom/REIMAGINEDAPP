// index.js (ESM)
// index.js (very top line)
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import routes from './src/routes/index.js';
import { requestId } from './src/middleware/requestId.js';
import { errorHandler } from './src/middleware/error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(requestId);

// --- serve static UI first (so it wins at "/")
app.use(express.static(path.join(__dirname, 'public')));

// --- health & readiness
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/ready', (_req, res) => res.json({ ok: true, ready: true, time: new Date().toISOString() }));

// --- keep the JSON “welcome” but move it off root
app.get('/status', (_req, res) =>
  res.json({ ok: true, name: 'REIMAGINEDSV API', docs: ['/api', '/bff', '/debug', '/admin', '/health', '/ready'] })
);

// --- main routes (api, bff, debug, legacy + admin)
app.use('/', routes);

// --- 404 (let frontend handle its own paths; only 404 API-ish ones)
app.use((req, res, next) => {
  // If it's a GET to a path that looks like a file we don't have, let it fall through to frontend
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/bff') && !req.path.startsWith('/debug') && !req.path.startsWith('/admin') && !req.path.startsWith('/legacy')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  return res.status(404).json({ error: 'Not Found', path: req.path });
});

// --- error handler
app.use(errorHandler);

// --- listen on dynamic port for Replit/Render/etc.
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
