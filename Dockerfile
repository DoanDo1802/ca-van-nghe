FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_VOICE_TURN_CREDENTIAL_URL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_VOICE_TURN_CREDENTIAL_URL=$VITE_VOICE_TURN_CREDENTIAL_URL

RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "scripts/productionServer.js"]
