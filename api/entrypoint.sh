#!/bin/sh
set -e

alembic upgrade head

# Bakes PWA_TOKEN into a static file so the PWA doesn't need a manual token-entry screen —
# Tailscale is already the trust boundary for this mono-user app, so this isn't a new exposure.
cat > app/static/config.js <<CONFIGEOF
window.PWA_TOKEN = "${PWA_TOKEN}";
CONFIGEOF

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
