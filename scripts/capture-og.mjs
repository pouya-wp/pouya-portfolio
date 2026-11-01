import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PORT = 9876;
const ROOT = process.cwd();

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/work/render-og-card.html';

  const fullPath = path.join(ROOT, reqPath.replace(/^\//, ''));

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404);
    res.end('Not Found: ' + reqPath);
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const stat = fs.statSync(fullPath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
  });

  fs.createReadStream(fullPath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`[OG Capture] Local server listening on http://localhost:${PORT}`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const outPath = path.join(ROOT, 'public', 'og.jpg');

  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--enable-webgl',
    '--use-gl=angle',
    '--window-size=1200,630',
    '--hide-scrollbars',
    '--virtual-time-budget=8000',
    `--screenshot=${outPath}`,
    `http://localhost:${PORT}/work/render-og-card.html`,
  ];

  try {
    console.log('[OG Capture] Capturing 3D sculpture render with Chrome headless...');
    await execFileAsync(chromePath, args);
    console.log('[OG Capture] Screenshot saved successfully to:', outPath);

    if (fs.existsSync(outPath)) {
      const stats = fs.statSync(outPath);
      console.log(`[OG Capture] Final image size: ${stats.size} bytes`);
    }
  } catch (err) {
    console.error('[OG Capture] Error during capture:', err);
  } finally {
    server.close(() => {
      console.log('[OG Capture] Server closed.');
      process.exit(0);
    });
  }
});
