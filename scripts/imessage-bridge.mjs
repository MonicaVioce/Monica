// iMessage bridge — run on a Mac signed into Messages with Monica's Apple ID.
// Exposes POST /imessage {to, body} on localhost only; lib/notify.js calls it
// (IMESSAGE_BRIDGE_URL) and falls back to SMS when unreachable.
// First run triggers the macOS "control Messages" prompt — click Allow.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'send-imessage.applescript');
const port = Number(process.env.IMESSAGE_BRIDGE_PORT || 8787);

createServer((req, res) => {
  if (req.method !== 'POST' || new URL(req.url, 'http://x').pathname !== '/imessage') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'POST /imessage only' }));
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(raw); } catch { /* handled below */ }
    const to = String(payload.to || '');
    const body = String(payload.body || '');
    if (!to || !body) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'to and body are required' }));
    }
    execFile('osascript', [script, to, body], { timeout: 15000 }, (error, _stdout, stderr) => {
      res.writeHead(error ? 500 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(error ? { sent: false, error: stderr.trim() || error.message } : { sent: true, via: 'imessage', to }));
      console.log(error ? `FAILED -> ${to}: ${stderr.trim() || error.message}` : `sent -> ${to}`);
    });
  });
}).listen(port, '127.0.0.1', () => console.log(`iMessage bridge on http://127.0.0.1:${port} (localhost only)`));
