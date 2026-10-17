const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const API_URL = 'https://24data.ptfs.app/acft-data';
let latest = { aircraft: [], updatedAt: null, error: 'Waiting for first API update', controllers: [] };
let lastSuccess = null;

// Basic per-IP request limiting for the public JSON endpoints.
const requestWindows = new Map();
function rateLimited(req) {
  const now = Date.now();
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  let entry = requestWindows.get(ip);
  if (!entry || now - entry.start >= 60_000) entry = { start: now, count: 0 };
  entry.count += 1;
  requestWindows.set(ip, entry);
  // Keep the in-memory table bounded on a public instance.
  if (requestWindows.size > 2000) {
    for (const [key, value] of requestWindows) if (now - value.start >= 60_000) requestWindows.delete(key);
    if (requestWindows.size > 2000) requestWindows.delete(requestWindows.keys().next().value);
  }
  return entry.count > 90;
}

async function updateCache() {
  try {
    const response = await fetch(API_URL, { headers: { 'accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`24data returned HTTP ${response.status}`);
    const json = await response.json();

    // The documented 24data response is { aircraft: { data: { callsign: aircraft } } }.
    // Check a few harmless wrappers too, and report upstream null/error states clearly.
    const aircraftBlock = json?.aircraft;
    const aircraftMap = aircraftBlock?.data
      ?? json?.data?.aircraft?.data
      ?? json?.aircraftData?.data
      ?? json?.data
      // Some live responses put callsigns directly at the top level, e.g. { "Americano-8194": { position: ... } }.
      ?? (json && typeof json === 'object' && Object.values(json).some(value => value && typeof value === 'object' && value.position && typeof value.position === 'object') ? json : undefined);

    if (aircraftMap == null) {
      const upstreamError = aircraftBlock?.error ?? json?.error ?? json?.message;
      const topKeys = json && typeof json === 'object' ? Object.keys(json).join(', ') : typeof json;
      const blockKeys = aircraftBlock && typeof aircraftBlock === 'object' ? Object.keys(aircraftBlock).join(', ') : String(aircraftBlock);
      if (upstreamError) throw new Error(`24data has no aircraft data right now: ${String(upstreamError)} (response keys: ${topKeys}; aircraft: ${blockKeys})`);
      throw new Error(`24data response has no aircraft map (response keys: ${topKeys}; aircraft keys/value: ${blockKeys}). Open https://24data.ptfs.app/acft-data in Chrome and compare its current response.`);
    }
    if (typeof aircraftMap !== 'object' || Array.isArray(aircraftMap)) {
      throw new Error(`24data aircraft data has an unexpected type: ${Array.isArray(aircraftMap) ? 'array' : typeof aircraftMap}`);
    }
    const aircraft = Object.entries(aircraftMap).map(([callsign, a]) => ({
      callsign,
      playerName: a.playerName ?? 'Unknown',
      aircraftType: a.aircraftType ?? 'Unknown aircraft',
      heading: Number(a.heading ?? 0),
      altitude: Number(a.altitude ?? 0),
      speed: Number(a.speed ?? 0),
      groundSpeed: Number(a.groundSpeed ?? 0),
      isOnGround: Boolean(a.isOnGround),
      isEmergencyOccuring: Boolean(a.isEmergencyOccuring),
      x: Number(a.position?.x),
      y: Number(a.position?.y)
    })).filter(a => Number.isFinite(a.x) && Number.isFinite(a.y));
    latest = {
      aircraft,
      updatedAt: json?.aircraft?.updatedAt ?? json?.data?.aircraft?.updatedAt ?? new Date().toISOString(),
      error: json?.aircraft?.error ?? null,
      controllers: Array.isArray(json?.controllers?.data) ? json.controllers.data : []
    };
    lastSuccess = Date.now();
    console.log(`[24data] cached ${aircraft.length} aircraft at ${latest.updatedAt}`);
  } catch (err) {
    latest = { ...latest, error: err.message };
    console.error('[24data]', err.message);
  }
}

function send(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/state') {
    if (rateLimited(req)) return send(res, 429, 'application/json; charset=utf-8', JSON.stringify({ error: 'Too many requests; wait a minute and try again.' }));
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ...latest, lastSuccess }));
  }
  if (url.pathname === '/api/health') {
    if (rateLimited(req)) return send(res, 429, 'application/json; charset=utf-8', JSON.stringify({ error: 'Too many requests; wait a minute and try again.' }));
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, lastSuccess, aircraftCount: latest.aircraft.length, error: latest.error }));
  }
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) return send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
    send(res, 200, types[ext] || 'application/octet-stream', data);
  });
});

updateCache();
setInterval(updateCache, 3000).unref();
server.listen(PORT, () => console.log(`24RADAR running at http://localhost:${PORT}`));
