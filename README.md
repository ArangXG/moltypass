# Molty Royale Geo Proxy

Reverse proxy untuk mengakses `moltyroyale.com` dari region yang diblokir.  
Intercept `geo/check` → selalu return `isRestricted: false`.

## Cara Deploy ke Railway

### 1. Push ke GitHub

```bash
git init
git add .
git commit -m "init proxy"
git branch -M main
git remote add origin https://github.com/USERNAME/molty-proxy.git
git push -u origin main
```

### 2. Deploy di Railway

1. Buka [railway.app](https://railway.app) → **New Project**
2. Pilih **Deploy from GitHub repo**
3. Pilih repo `molty-proxy`
4. Railway auto-detect Node.js & deploy otomatis
5. Setelah deploy, klik **Generate Domain** di Settings

### 3. Akses Pages

Setelah dapat URL Railway (misal `https://molty-proxy-production.up.railway.app`):

- **My Page** → `https://molty-proxy-production.up.railway.app/mypage`
- **Agent Wallet** → `https://molty-proxy-production.up.railway.app/agent-wallet`

## Cara Kerja

```
Browser (ID) → Railway Proxy (US/EU) → moltyroyale.com
                     ↓
          geo/check → { isRestricted: false }  ✅
          cdn.moltyroyale.com → /cdn-proxy/*   ✅
```

Karena Railway servernya di US/EU, geo-check asli dari `cdn.moltyroyale.com` 
juga akan lolos. Tapi untuk keamanan, proxy ini langsung intercept endpoint 
tersebut dan return unrestricted tanpa perlu koneksi ke CDN.
