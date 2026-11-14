'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'runs.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ runs: [] }, null, 2));
const rate = new Map();
function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
function readData() { try { const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); return d && Array.isArray(d.runs) ? d : { runs: [] }; } catch { return { runs: [] }; } }
function writeData(data) { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, DATA_FILE); }
function send(res, status, body, type='application/json; charset=utf-8') { res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self' https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'" }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body); }
function cleanName(value) { return String(value || 'Jogador').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) || 'Jogador'; }
function limited(req) { const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); const now = Date.now(); const entry = rate.get(ip) || { start: now, count: 0 }; if (now - entry.start > 60000) { entry.start = now; entry.count = 0; } entry.count++; rate.set(ip, entry); return entry.count > 30; }
const rooms = new Map(), roomRate = new Map();
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ROOM_MAPS = ['ny', 'vegas', 'paris', 'tokyo', 'rio', 'cairo'];
function roomLimited(req) { const ip = req.socket.remoteAddress || 'x', now = Date.now(), e = roomRate.get(ip) || { s: now, c: 0 }; if (now - e.s > 60000) { e.s = now; e.c = 0; } e.c++; roomRate.set(ip, e); return e.c > 600; }
function pubRoom(r, you) { const o = r.p[you === 'a' ? 'b' : 'a']; return { code: r.code, status: r.status, now: Date.now(), startAt: r.startAt, map: r.map, seed: r.seed, you, opp: o ? { name: o.name, t: o.t, alive: o.alive, reason: o.reason } : null, result: r.result }; }
function resolveRoom(r) {
  if (r.status !== 'playing' || Date.now() < r.startAt || !r.p.b) return;
  const a = r.p.a, b = r.p.b; let w;
  if (!a.alive && !b.alive) w = a.t > b.t ? 'a' : b.t > a.t ? 'b' : null;
  else if (!a.alive && b.t > a.t) w = 'b'; else if (!b.alive && a.t > b.t) w = 'a'; else return;
  r.status = 'done'; r.result = { winner: w, reason: w ? (a.alive || b.alive ? 'sobreviveu por mais tempo' : 'durou mais tempo') : 'empate', aT: a.t, bT: b.t, aReason: a.reason, bReason: b.reason };
}
setInterval(() => { const old = Date.now() - 3600000; for (const [k, r] of rooms) if (r.created < old) rooms.delete(k); roomRate.clear(); }, 60000).unref();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'Trilhos Insanos leaderboard', week: weekKey() });
  if (req.method === 'GET' && url.pathname === '/api/leaderboards') {
    const wk = weekKey(); const runs = readData().runs.filter(r => r.week === wk);
    const bestScore = new Map(), bestNoCoin = new Map();
    for (const r of runs) { const key = r.name.toLowerCase(); const a = bestScore.get(key); if (!a || r.score > a.value) bestScore.set(key, { name: r.name, value: r.score }); const b = bestNoCoin.get(key); if (!b || r.noCoinSeconds > b.value) bestNoCoin.set(key, { name: r.name, value: r.noCoinSeconds }); }
    const score = [...bestScore.values()].sort((a,b)=>b.value-a.value).slice(0,10);
    const noCoin = [...bestNoCoin.values()].sort((a,b)=>b.value-a.value).slice(0,10);
    return send(res, 200, { week: wk, score, noCoin });
  }
  if (req.method === 'POST' && url.pathname === '/api/runs') {
    if (limited(req)) return send(res, 429, { error: 'Muitas tentativas. Aguarde um minuto.' });
    let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 8192) req.destroy(); });
    req.on('end', () => {
      let body; try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'JSON inválido.' }); }
      const score = Number(body.score), noCoinSeconds = Number(body.noCoinSeconds);
      if (!Number.isFinite(score) || !Number.isFinite(noCoinSeconds) || score < 0 || noCoinSeconds < 0 || score > 100000000 || noCoinSeconds > 86400) return send(res, 400, { error: 'Resultado inválido.' });
      const name = cleanName(body.name); const week = weekKey(); const data = readData();
      const existing = data.runs.find(r => r.week === week && r.name.toLowerCase() === name.toLowerCase());
      if (existing) { existing.score = Math.max(existing.score, Math.floor(score)); existing.noCoinSeconds = Math.max(existing.noCoinSeconds, Math.floor(noCoinSeconds)); existing.updatedAt = new Date().toISOString(); }
      else data.runs.push({ id: crypto.randomUUID(), week, name, score: Math.floor(score), noCoinSeconds: Math.floor(noCoinSeconds), createdAt: new Date().toISOString() });
      // Keep storage bounded while retaining current and recent weeks.
      const keepWeeks = new Set([week]);
      for (let i=1;i<=8;i++) { const d=new Date(); d.setUTCDate(d.getUTCDate()-7*i); keepWeeks.add(weekKey(d)); }
      data.runs = data.runs.filter(r => keepWeeks.has(r.week)).slice(-20000); writeData(data);
      return send(res, 201, { ok: true, week });
    });
    return;
  }
  // ===== Salas X1 online (em memória) =====
  if (req.method === 'POST' && url.pathname.startsWith('/api/rooms')) {
    if (roomLimited(req)) return send(res, 429, { error: 'Muitas requisições.' });
    let raw = ''; req.on('data', c => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      let b; try { b = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'JSON inválido.' }); }
      const parts = url.pathname.split('/').filter(Boolean), you = b.you === 'b' ? 'b' : 'a';
      if (parts.length === 2) {
        if (rooms.size >= 500) return send(res, 503, { error: 'Servidor cheio.' });
        let c; do { c = Array.from({ length: 4 }, () => ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)]).join(''); } while (rooms.has(c));
        const r = { code: c, status: 'waiting', map: ROOM_MAPS.includes(b.map) ? b.map : 'ny', seed: crypto.randomInt(1, 2 ** 31 - 1), startAt: 0, result: null, created: Date.now(), p: { a: { name: cleanName(b.name), t: 0, alive: true } } };
        rooms.set(c, r); return send(res, 201, pubRoom(r, 'a'));
      }
      if (parts[2] === 'join') {
        const r = rooms.get(String(b.code || '').toUpperCase());
        if (!r) return send(res, 404, { error: 'Sala não encontrada.' });
        if (r.p.b || r.status !== 'waiting') return send(res, 409, { error: 'Sala cheia ou já iniciada.' });
        r.p.b = { name: cleanName(b.name), t: 0, alive: true }; r.status = 'ready'; return send(res, 200, pubRoom(r, 'b'));
      }
      const r = rooms.get(parts[2]);
      if (!r || !r.p[you]) return send(res, 404, { error: 'Sala não encontrada.' });
      const other = you === 'a' ? 'b' : 'a', act = parts[3];
      if (act === 'start') {
        if (you !== 'a' || r.status !== 'ready') return send(res, 409, { error: 'Não é possível começar agora.' });
        r.status = 'playing'; r.startAt = Date.now() + 4000;
        for (const k of ['a', 'b']) Object.assign(r.p[k], { t: 0, alive: true, reason: null });
        return send(res, 200, pubRoom(r, you));
      }
      if (act === 'sync') {
        const p = r.p[you]; p.name = cleanName(b.name || p.name);
        if (r.status === 'playing' && Date.now() >= r.startAt) {
          p.t = Math.max(p.t, Math.min(3600, Math.max(0, Number(b.t) || 0)));
          if (b.alive === false && p.alive) { p.alive = false; p.reason = String(b.reason || 'eliminado').replace(/[<>]/g, '').slice(0, 12); }
          resolveRoom(r);
        }
        return send(res, 200, pubRoom(r, you));
      }
      if (act === 'leave') {
        if (r.status === 'playing' && r.p[other]) { r.status = 'done'; r.result = { winner: other, reason: 'adversário saiu', aT: r.p.a.t, bT: (r.p.b || {}).t || 0 }; }
        else if (you === 'b') { delete r.p.b; r.status = 'waiting'; }
        else rooms.delete(r.code);
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Não encontrado.' });
    });
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const file = fs.readFileSync(path.join(ROOT, 'index.html')); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self' https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'" }); return res.end(file);
  }
  return send(res, 404, { error: 'Não encontrado.' });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Trilhos Insanos server rodando em http://localhost:${PORT}`));
