# InstaBOT — Render / any container host.
# Node 22+ is required by lib/instagram-chatkit (JSON.parse source access, JSON.rawJSON).
# canvas 2.x has no prebuilt binary for Node 22, so npm compiles it: build tools + -dev libs below.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080

# Runtime libs for the prebuilt `canvas` binary + fonts + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 \
      fontconfig fonts-dejavu-core ffmpeg ca-certificates \
      python3 make g++ pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY . .
RUN mkdir -p data && chown -R node:node /app
USER node

EXPOSE 8080
CMD ["node", "index.js"]
