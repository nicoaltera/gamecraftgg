#!/bin/sh
# Boot glue for the Fly volume: /vol is the ONE persistent disk. The app reads
# and writes $CWD/games and $CWD/data, so both become symlinks onto the volume.
# Seed games copy no-clobber: a redeploy refreshes nothing that players already
# have state on, and never overwrites a runtime-generated game.
set -e
VOL="${VOLUME_DIR:-/vol}"

mkdir -p "$VOL/data" "$VOL/games"
if [ -d /app/games-seed ]; then
  cp -rn /app/games-seed/. "$VOL/games/" 2>/dev/null || true
fi
ln -sfn "$VOL/games" /app/games
ln -sfn "$VOL/data" /app/data

exec npm start
