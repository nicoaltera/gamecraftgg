#!/bin/sh
# Boot glue for the Fly volume: /vol is the ONE persistent disk. The app reads
# and writes $CWD/games and $CWD/data, so both become symlinks onto the volume.
# Seed games copy no-clobber: a redeploy refreshes nothing that players already
# have state on, and never overwrites a runtime-generated game.
set -e
# Worker machines pass an explicit command (node pipeline/run.mjs --job …) —
# exec it directly and skip the web-server/volume setup below entirely.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
VOL="${VOLUME_DIR:-/vol}"

mkdir -p "$VOL/data" "$VOL/games"
if [ -d /app/games-seed ]; then
  cp -rn /app/games-seed/. "$VOL/games/" 2>/dev/null || true
fi
# CRITICAL: `next build` touches db() during prerender, baking a real /app/data
# dir (with a throwaway SQLite file) into the image. `ln -sfn` against an
# EXISTING directory silently creates the link INSIDE it — leaving the app
# writing to the ephemeral container disk and losing every user on restart.
# Remove the container-local dirs first; these are image artifacts, never data
# (the volume is only ever touched via $VOL).
rm -rf /app/games /app/data
ln -sfn "$VOL/games" /app/games
ln -sfn "$VOL/data" /app/data

exec npm start
