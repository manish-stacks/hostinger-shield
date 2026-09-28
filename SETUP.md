# VPS (once)
apt-get update && apt-get install -y chromium fonts-liberation fonts-noto-color-emoji
# path differs? add to backend .env: PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
pm2 restart hostinger-shield-backend
cd frontend && npm run build && pm2 restart <frontend-name>

# Frontend .env (live alerts socket; same as API host, no /api)
NEXT_PUBLIC_SOCKET_URL=https://your-api-domain

# Backend .env (all optional, defaults shown)
HEALTH_CHECK_MINUTES=5        # up/down check
FAST_SCAN_MINUTES=10          # homepage hack scan
ESCALATE_MINUTES=10           # reminder if incident not acknowledged
ESCALATE_MAX=4                # max reminders
GOOGLE_SAFE_BROWSING_KEY=     # free key: Google Cloud > Safe Browsing API
HEALTH_SAVE_MINUTES=30        # DB saving: health rows stored at most this often when healthy
RETAIN_HEALTH_DAYS=14
RETAIN_THREAT_RESOLVED_DAYS=30
RETAIN_THREAT_OPEN_DAYS=90
RETAIN_SSL_DAYS=30
RETAIN_DNS_DAYS=60
RETAIN_INCIDENT_DAYS=60
RETAIN_NOTIF_READ_DAYS=7
RETAIN_NOTIF_DAYS=15
RETAIN_SCREENSHOT_LOG_DAYS=7
RETAIN_EVIDENCE_DAYS=30
SCREENSHOT_KEEP_LATEST=2
DB_MAX_MB=0                   # e.g. 400 -> emergency cleanup when DB exceeds it
