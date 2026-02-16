#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8000;
const PROJECT_ROOT = path.join(__dirname, '..');

// MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

// Get MIME type for a file
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Format timestamp for logging
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

// Handle request
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Remove trailing slash and redirect to index.html for root
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  // Resolve file path
  let filePath = path.join(PROJECT_ROOT, pathname);

  // Security: prevent directory traversal
  const realPath = fs.realpathSync(PROJECT_ROOT);
  const resolvedPath = path.resolve(filePath);
  
  if (!resolvedPath.startsWith(realPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    console.log(`[${getTimestamp()}] ${req.method} ${req.url} - 403 Forbidden`);
    res.end('403 Forbidden');
    return;
  }

  // Try to serve the file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // File not found
      if (err.code === 'ENOENT') {
        const notFoundPath = path.join(PROJECT_ROOT, '404.html');
        
        // Try to serve 404.html if it exists
        fs.readFile(notFoundPath, (notFoundErr, notFoundContent) => {
          if (!notFoundErr) {
            res.writeHead(404, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Dev-Mode': 'true',
              'X-Environment': 'development',
              'Service-Worker-Allowed': 'false',
            });
            res.end(notFoundContent);
          } else {
            res.writeHead(404, {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-store',
              'X-Dev-Mode': 'true',
              'X-Environment': 'development',
              'Service-Worker-Allowed': 'false',
            });
            res.end('404 Not Found');
          }
        });
        console.log(`[${getTimestamp()}] ${req.method} ${req.url} - 404 Not Found`);
      } else {
        // Server error
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        console.log(`[${getTimestamp()}] ${req.method} ${req.url} - 500 Server Error`);
        res.end('500 Server Error');
      }
      return;
    }

    // File found - serve it
    const mimeType = getMimeType(filePath);
    const headers = {
      'Content-Type': mimeType,
      'Cache-Control': 'no-store',
      'X-Dev-Mode': 'true',
      'X-Environment': 'development',
      'Service-Worker-Allowed': 'false',
    };

    // Add CORS headers for development
    headers['Access-Control-Allow-Origin'] = '*';

    res.writeHead(200, headers);
    res.end(content);
    console.log(`[${getTimestamp()}] ${req.method} ${req.url} - 200 OK`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          Development Server Starting                       ║
╠════════════════════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}
║  Root:   ${PROJECT_ROOT}
║  Mode:   Development (Cache disabled, Service Worker off)  ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log(`Press Ctrl+C to stop the server\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nError: Port ${PORT} is already in use.`);
    console.error(`Try setting a different port: PORT=3000 npm run dev\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('\n\nDevelopment server stopped.');
  process.exit(0);
});
