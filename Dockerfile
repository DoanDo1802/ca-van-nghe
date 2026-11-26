FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_VOICE_TURN_CREDENTIAL_URL
ARG VITE_ENABLE_SERVER_KARAOKE_DOWNLOAD=true

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_VOICE_TURN_CREDENTIAL_URL=$VITE_VOICE_TURN_CREDENTIAL_URL
ENV VITE_ENABLE_SERVER_KARAOKE_DOWNLOAD=$VITE_ENABLE_SERVER_KARAOKE_DOWNLOAD

RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "scripts/productionServer.js"]
