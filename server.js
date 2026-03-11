const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

const TARGET = 'https://www.moltyroyale.com';
const CDN_TARGET = 'https://cdn.moltyroyale.com';

// ─── Intercept geo/check → always return NOT restricted ───────────────────────
app.get('/cdn-proxy/api/geo/check', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ success: true, data: { isRestricted: false, isAdmin: false } });
});

// ─── Proxy CDN calls (/cdn-proxy/*) ──────────────────────────────────────────
app.use(
  '/cdn-proxy',
  createProxyMiddleware({
    target: CDN_TARGET,
    changeOrigin: true,
    pathRewrite: { '^/cdn-proxy': '' },
    on: {
      proxyRes(proxyRes) {
        proxyRes.headers['access-control-allow-origin'] = '*';
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
      },
    },
  })
);

// ─── Main site proxy ──────────────────────────────────────────────────────────
app.use(
  '/',
  createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    selfHandleResponse: true,
    on: {
      proxyRes(proxyRes, req, res) {
        const contentType = proxyRes.headers['content-type'] || '';
        const isHTML = contentType.includes('text/html');
        const isJS   = contentType.includes('javascript');

        // Pass through headers (strip blockers)
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (['x-frame-options','content-security-policy','strict-transport-security'].includes(key.toLowerCase())) continue;
          res.setHeader(key, val);
        }
        res.setHeader('access-control-allow-origin', '*');
        res.statusCode = proxyRes.statusCode;

        if (!isHTML && !isJS) {
          proxyRes.pipe(res);
          return;
        }

        // Buffer + rewrite HTML/JS
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf-8');

          // Point the geo-check call to our proxy endpoint
          body = body.replace(
            /https:\/\/cdn\.moltyroyale\.com\/api\/geo\/check/g,
            '/cdn-proxy/api/geo/check'
          );
          // Rewrite all other cdn.moltyroyale.com calls
          body = body.replace(
            /https:\/\/cdn\.moltyroyale\.com/g,
            '/cdn-proxy'
          );

          res.setHeader('content-length', Buffer.byteLength(body));
          res.end(body);
        });
      },
      error(err, req, res) {
        console.error('Proxy error:', err.message);
        res.status(502).send('Proxy error: ' + err.message);
      },
    },
  })
);

app.listen(PORT, () => {
  console.log(`✅ Molty Proxy running on port ${PORT}`);
  console.log(`   /mypage      → ${TARGET}/mypage`);
  console.log(`   /agent-wallet → ${TARGET}/agent-wallet`);
  console.log(`   geo/check intercepted → always unrestricted`);
});
