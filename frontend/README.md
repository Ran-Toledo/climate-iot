# Climate IoT — Frontend

React + TypeScript SPA against the backend's Management API. See
`../docs/frontend-plan.md` for the implementation plan and
`../docs/frontend-status.md` for progress.

## Setup

```
cp .env.example .env   # point VITE_API_BASE_URL at your running backend
npm install
npm run dev
```

Requires the backend (`../backend`) running and reachable at the URL in
`.env` — see the root `README.md`'s Quick start.

This is the path for active frontend development (instant reload on save).
For just running the whole stack, `docker compose up --build -d` from the
repo root already brings this up as the `frontend` service — see the root
`README.md`'s "Frontend" section, including the note that its API URL is
baked in at image build time, unlike everything else in this project.

## Stack

Vite, React, TypeScript, Tailwind CSS, TanStack Query, React Router.
