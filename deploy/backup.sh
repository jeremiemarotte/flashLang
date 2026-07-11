#!/bin/sh
set -e

while true; do
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  pg_dump -Fc -f "/backups/flashlang_${timestamp}.dump"
  find /backups -name 'flashlang_*.dump' -mtime +30 -delete
  sleep 86400
done
