import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import telemetryHandler from '../api/v1/telemetry.ts';

const root = path.resolve('work/preview');
const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.html': 'text/html'
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    
    // API endpoint handler
    if (url.pathname.startsWith('/api/')) {
      // Mock Express/Vercel status & json helpers if missing
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return res;
      };
      await telemetryHandler(req, res);
      return;
    }

    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(5173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:5173'));
