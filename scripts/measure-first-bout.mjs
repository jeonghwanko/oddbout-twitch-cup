import { createServer } from 'node:http';
import { readFile, appendFile } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { gzipSync } from 'node:zlib';

// Local-only static server. Fresh ports isolate each sample from existing browser caches.
// Usage: node scripts/measure-first-bout.mjs --ports=5180,5181,5182 --label=before --out=/absolute/report.jsonl
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const ports = (args.ports ?? '5180').split(',').map(Number);
if (ports.some(p => !Number.isInteger(p) || p < 1024 || p > 65535)) throw new Error('Use ports between 1024 and 65535');
const root = resolve(args.dir ?? 'dist'), out = resolve(args.out ?? 'first-bout-report.jsonl');
const probe = await readFile(new URL('./first-bout-probe.js', import.meta.url), 'utf8');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const files = new Map();
async function file(path) {
  if (files.has(path)) return files.get(path);
  const ext = extname(path);
  let body = await readFile(path);
  if (ext === '.html') body = Buffer.from(body.toString('utf8').replace('<head>', `<head><script>${probe}</script>`));
  const compressed = ['.html', '.js', '.css', '.json', '.svg'].includes(ext) ? gzipSync(body) : null;
  const entry = { body, compressed, type: types[ext] ?? 'application/octet-stream' };
  files.set(path, entry); return entry;
}
for (const port of ports) {
  createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/__profile' && req.method === 'POST') {
      if (req.headers.origin !== `http://127.0.0.1:${port}`) { res.writeHead(403).end(); return; }
      let body = '', bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 2_000_000) { res.writeHead(413).end(); return; }
        body += chunk;
      }
      try {
        const report = { ...JSON.parse(body), label: args.label ?? 'sample', port, recordedAt: new Date().toISOString() };
        await appendFile(out, JSON.stringify(report) + '\n');
        console.log(JSON.stringify({ label: report.label, port, kind: report.kind, readyMs: report.readyMs,
          bytes: report.frameEncodedBytes, cacheHits: report.cacheHits?.length }));
        res.writeHead(204).end();
      } catch { res.writeHead(400).end(); }
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    try {
      const path = resolve(root, '.' + decodeURIComponent(url.pathname));
      const rel = relative(root, path);
      if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403).end(); return; }
      const entry = await file(path);
      const useGzip = entry.compressed && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      const body = useGzip ? entry.compressed : entry.body;
      res.setHeader('Content-Type', entry.type); res.setHeader('Content-Length', body.length);
      res.setHeader('Vary', 'Accept-Encoding');
      if (useGzip) res.setHeader('Content-Encoding', 'gzip');
      res.writeHead(200).end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end('Not found'); }
  }).listen(port, '127.0.0.1', () => console.log(`Sample ${args.label ?? ''}: http://127.0.0.1:${port}/twitch.html?lang=en`));
}
