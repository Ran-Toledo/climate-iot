FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Full node_modules (not just `vite`) to match this project's existing
# Dockerfiles, which don't separate build-only from runtime dependencies
# either -- simplicity over image-size optimization.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/vite.config.ts .
COPY package.json .

# --host 0.0.0.0: inside the container the server must listen on all
# interfaces, or Docker's port forwarding can't reach it. Whether the host
# exposes it beyond 127.0.0.1 is decided by docker-compose.yml, not here.
CMD npx vite preview --host 0.0.0.0 --port $FRONTEND_PORT
