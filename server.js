const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 8080;

const ORIGIN = 'https://www.moltyroyale.com';
const CDN    = 'https://cdn.moltyroyale.com';

// ── helper: rewrite URLs in text ─────────────────────────────────────────────
function rewriteBody(text, proxyBase) {
  return text
    .replace(/https:\/\/cdn\.moltyroyale\.com\/api\/geo\/check/g, `${proxyBase}/cdn-proxy/api/geo/check`)
    .replace(/https:\/\/cdn\.moltyroyale\.com/g, `${proxyBase}/cdn-proxy`)
    .replace(/https:\/\/www\.moltyroyale\.com/g, proxyBase);
}

// ── CORS preflight ────────────────────────────────────────────────────────────
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.sendStatus(204);
});

// ── GEO CHECK INTERCEPT ───────────────────────────────────────────────────────
app.get('/cdn-proxy/api/geo/check', (req, res) => {
  console.log('[geo/check] intercepted → unrestricted');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.json({ success: true, data: { isRestricted: false, isAdmin: false } });
});

// ── CDN PROXY (/cdn-proxy/*) ──────────────────────────────────────────────────
app.use('/cdn-proxy', createProxyMiddleware({
  target: CDN,
  changeOrigin: true,
  pathRewrite: { '^/cdn-proxy': '' },
  on: {
    proxyRes(proxyRes) {
      proxyRes.headers['access-control-allow-origin'] = '*';
      delete proxyRes.headers['x-frame-options'];
      delete proxyRes.headers['content-security-policy'];
    },
    error(err, req, res) {
      console.error('[cdn-proxy error]', err.message);
      res.status(502).end();
    }
  }
}));

// ── MAIN SITE PROXY ───────────────────────────────────────────────────────────
app.use('/', createProxyMiddleware({
  target: ORIGIN,
  changeOrigin: true,
  selfHandleResponse: true,
  on: {
    proxyRes(proxyRes, req, res) {
      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const encoding    = (proxyRes.headers['content-encoding'] || '').toLowerCase();
      const isHTML = contentType.includes('text/html');
      const isJS   = contentType.includes('javascript');
      const needsRewrite = isHTML || isJS;

      // Forward headers (strip security blockers)
      const skipHeaders = new Set([
        'x-frame-options', 'content-security-policy',
        'strict-transport-security', 'content-encoding', 'content-length'
      ]);
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!skipHeaders.has(k.toLowerCase())) res.setHeader(k, v);
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.statusCode = proxyRes.statusCode;

      // Non-text assets: pipe directly (keep original encoding)
      if (!needsRewrite) {
        if (encoding) res.setHeader('content-encoding', encoding);
        proxyRes.pipe(res);
        return;
      }

      // Collect all chunks for text rewriting
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        const raw = Buffer.concat(chunks);

        // Build proxy base URL for rewrites
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host  = req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost';
        const proxyBase = `${proto}://${host}`;

        const finish = (text) => {
          const rewritten = rewriteBody(text, proxyBase);
          const out = Buffer.from(rewritten, 'utf-8');
          res.setHeader('content-length', out.length);
          res.end(out);
        };

        if (encoding === 'gzip') {
          zlib.gunzip(raw, (err, decoded) => {
            if (err) { console.error('gunzip error', err); res.end(raw); return; }
            finish(decoded.toString('utf-8'));
          });
        } else if (encoding === 'br') {
          zlib.brotliDecompress(raw, (err, decoded) => {
            if (err) { console.error('brotli error', err); res.end(raw); return; }
            finish(decoded.toString('utf-8'));
          });
        } else if (encoding === 'deflate') {
          zlib.inflate(raw, (err, decoded) => {
            if (err) { console.error('inflate error', err); res.end(raw); return; }
            finish(decoded.toString('utf-8'));
          });
        } else {
          finish(raw.toString('utf-8'));
        }
      });

      proxyRes.on('error', (err) => {
        console.error('[proxyRes error]', err.message);
        res.status(502).end();
      });
    },
    error(err, req, res) {
      console.error('[proxy error]', err.message);
      res.status(502).send('Proxy error: ' + err.message);
    }
  }
}));

app.listen(PORT, () => {
  console.log(`✅ Molty Proxy running on port ${PORT}`);
  console.log(`   /mypage       → ${ORIGIN}/mypage`);
  console.log(`   /agent-wallet → ${ORIGIN}/agent-wallet`);
  console.log(`   geo/check intercepted → always unrestricted`);
});
