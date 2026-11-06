FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Runtime: nginx serves the static build and proxies /api, /docs etc. to the
# backend. A few MiB of RAM, against ~70 MiB for `vite preview`, which ran
# two Node processes (the npx wrapper plus Vite) just to serve static files.
FROM nginx:1.27-alpine

# The image's entrypoint renders /etc/nginx/templates/*.template into
# /etc/nginx/conf.d/ with envsubst at start. The filter limits substitution
# to our own variables so nginx's $host, $uri etc. survive.
ENV NGINX_ENVSUBST_FILTER="^(FRONTEND_PORT|API_PROXY_TARGET)$"
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# nginx listens on FRONTEND_PORT on all of the container's interfaces;
# whether the host exposes it beyond 127.0.0.1 is decided by
# docker-compose.yml, not here. CMD comes from the base image.
