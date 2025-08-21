// src/services/debug/traceStore.js
// Lightweight in-memory trace store for retrieval meta (non-persistent).
// Safe to use in Replit/dev. In production behind multiple instances,
// you'd forward to a real log sink.

import { config } from '../../config/index.js';

const MAX_TRACES = config.TRACE_MAX;

const traces = new Map(); // requestId -> { time, question, meta }
const order = [];         // ring buffer of requestIds

export function setTrace(requestId, { question, meta }) {
  if (!requestId || !meta) return;
  const rec = { time: new Date().toISOString(), question: question || '', meta };
  traces.set(requestId, rec);
  order.push(requestId);
  while (order.length > MAX_TRACES) {
    const old = order.shift();
    traces.delete(old);
  }
}

export function getTrace(requestId) {
  if (!requestId) return null;
  return traces.get(requestId) || null;
}

export function listTraces({ limit = 50 } = {}) {
  const n = Math.min(limit, order.length);
  const ids = order.slice(-n).reverse();
  return ids.map(id => ({ requestId: id, ...traces.get(id) }));
}

export function clearTraces() {
  traces.clear();
  order.length = 0;
  return { ok: true };
}
