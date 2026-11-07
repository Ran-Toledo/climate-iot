# Climate IoT — Frontend

React + TypeScript SPA against the backend's Management API. See
`../docs/frontend-plan.md` for the implementation plan and
`../docs/frontend-status.md` for progress.

## Setup

```
npm install
npm run dev
```

The dev server proxies `/api` (plus `/health`, `/docs`, `/redoc`,
`/openapi.json`) to a backend you run yourself at `http://localhost:8000`
(the full API's default `API_PORT`). To use the Docker stack's API instead,
point `API_PROXY_TARGET` at its `API_HOST_PORT` (from the root `.env`):

```
API_PROXY_TARGET=http://localhost:<API_HOST_PORT> npm run dev
```

The dev server listens on localhost only.

This is the path for active frontend development (instant reload on save).
For just running the whole stack, `docker compose up --build -d` from the
repo root already brings this up as the `frontend` service — see the root
`README.md`'s "Frontend" and "Network access" sections.

## Stack

Vite, React, TypeScript, Tailwind CSS, TanStack Query, React Router.
