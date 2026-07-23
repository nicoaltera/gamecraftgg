# GameSight production image: Next.js app + generation pipeline on one box.
# Playwright base = Chromium + system deps preinstalled (the verify harness);
# the tag MUST match the playwright version in package.json.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

# The pipeline shells out to the `claude` CLI (agents run as this binary).
RUN npm install -g @anthropic-ai/claude-code

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* are inlined at build time — pass real origins as build args
# once domains exist (fly.toml [build.args]); empty = same-origin dev fallback.
ARG NEXT_PUBLIC_APP_ORIGIN=""
ARG NEXT_PUBLIC_GAME_ORIGIN=""
ENV NEXT_PUBLIC_APP_ORIGIN=$NEXT_PUBLIC_APP_ORIGIN \
    NEXT_PUBLIC_GAME_ORIGIN=$NEXT_PUBLIC_GAME_ORIGIN \
    NODE_ENV=production
RUN npm run build

# Seed games ship in the image; at boot the entrypoint copies them (no-clobber)
# onto the volume and symlinks games/ + data/ there, so runtime-generated games
# and the SQLite db survive deploys.
RUN mv /app/games /app/games-seed
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
