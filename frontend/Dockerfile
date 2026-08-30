FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# VITE_API_BASE_URL is baked into the static bundle at build time (Vite
# inlines import.meta.env.VITE_* during `vite build`) -- it cannot be
# changed by an `environment:` var at container start like the backend's
# APP_HOST/APP_PORT. Changing it means rebuilding this image.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
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

CMD npx vite preview --host 0.0.0.0 --port $FRONTEND_PORT
