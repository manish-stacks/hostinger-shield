# VPS setup (once)
apt-get update && apt-get install -y chromium fonts-liberation fonts-noto-color-emoji
which chromium chromium-browser        # note the path
# if path is not /usr/bin/chromium(-browser), add to backend .env:
# PUPPETEER_EXECUTABLE_PATH=/path/from/above
pm2 restart hostinger-shield-backend
cd frontend && npm run build && pm2 restart <frontend-name>

# Optional .env (days; defaults shown)
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
DB_MAX_MB=0   # e.g. 400 -> emergency cleanup when DB exceeds 400MB
