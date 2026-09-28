# VPS: screenshot fix (run once)
```bash
apt-get update && apt-get install -y chromium fonts-liberation fonts-noto-color-emoji
# if "chromium" is a snap stub on Ubuntu, use instead:
#   npx puppeteer browsers install chrome   (and install libs: apt-get install -y libnss3 libatk-bridge2.0-0 libgbm1 libasound2t64 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2)
which chromium chromium-browser google-chrome-stable
pm2 restart hostinger-shield-backend
```
Add to `.env` (only if the path differs):
```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

# Auto-delete (optional .env, defaults shown, days)
```
RETAIN_HEALTH_DAYS=14
RETAIN_THREAT_RESOLVED_DAYS=30
RETAIN_THREAT_OPEN_DAYS=90
RETAIN_SSL_DAYS=30
RETAIN_DNS_DAYS=60
RETAIN_INCIDENT_DAYS=60
RETAIN_NOTIF_READ_DAYS=7
RETAIN_NOTIF_DAYS=15
RETAIN_SCREENSHOT_LOG_DAYS=7
SCREENSHOT_KEEP_LATEST=2
DB_MAX_MB=0        # e.g. 400 → emergency cleanup (half retention) when DB exceeds 400MB
```
