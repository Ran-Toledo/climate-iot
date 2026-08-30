# Climate IoT Frontend — Implementation Status

Tracks progress against `frontend-plan.md`. Update this file at the end of
each stage.

| Stage | Status | Date | Notes |
|---|---|---|---|
| 1 — Scaffold and data layer | **Done** | 2026-08-29 | Confirmed working end-to-end against the live backend. See notes below. |
| 2 — Device list | **Done** | 2026-08-29 | Confirmed working end-to-end, incl. offline/online/no-target states. See notes below. |
| 3 — Device detail | **Done** | 2026-08-30 | Confirmed working end-to-end, incl. a real pending→completed command round trip and delete. See notes below. |
| 4 — Graph | **Done** | 2026-08-30 | Confirmed against a real multi-hour telemetry gap; also fixed a backend truncation bug it depends on. See notes below. |
| 5 — Polish | **Done** | 2026-08-30 | Skeletons, shared error banner, responsive check at 1280px — no breakage found. See notes below. |
| 6 — Docker packaging | **Done** | 2026-08-30 | Full 4-service stack confirmed via `docker compose up --build -d`. See notes below. |

## Stage 1 — notes

- Scaffolded `frontend/` via `npm create vite@latest -- --template react-ts`;
  added Tailwind CSS v4 (`@tailwindcss/vite` plugin — no separate
  `postcss.config`/`tailwind.config` needed for this version), React Router,
  and TanStack Query. Removed the template's demo content/assets
  (`App.css`, `hero.png`, `react.svg`, `vite.svg`, `public/icons.svg`).
- Typed data layer in `frontend/src/api/`:
  - `types.ts` — hand-mirrors `backend/app/schemas/*.py` exactly
    (`Device`, `DeviceState`, `ClimateState`, `Telemetry`, `Command`,
    `CommandStatus`). No shared schema generation between the two projects —
    keep these in sync by hand when the backend schemas change.
  - `client.ts` — thin `fetch` wrapper (`apiGet`/`apiPost`/`apiDelete`),
    base URL from `VITE_API_BASE_URL`, throws `ApiError` with the response
    status on any non-2xx.
  - `devices.ts` — one function per Management API endpoint, including the
    new `listTelemetry(deviceId, {since, until, limit})`.
- App shell: `main.tsx` wraps the app in `QueryClientProvider` +
  `BrowserRouter`; `App.tsx` defines a single `/` route rendering
  `pages/DeviceListPage.tsx`, a temporary scaffold page (real device-list UI
  is Stage 2) that fetches `listDevices()` via `useQuery` and dumps the raw
  JSON — proves the data layer reaches the real backend before any UI is
  built on top of it.
- `frontend/.env` (gitignored, local) / `.env.example` (committed):
  `VITE_API_BASE_URL`, pointed at `http://localhost:8080` locally to match
  this machine's `API_HOST_PORT`.
- **Unplanned backend fix discovered in this stage**: the backend had no
  CORS handling, so every browser request from the Vite dev server's origin
  (`http://localhost:5173`) was blocked by the browser before the frontend
  code ever saw a response — not visible from `curl`, only from an actual
  browser, which is why Stage 1 checks in a browser rather than trusting a
  curl smoke test. Fixed by adding `CORSMiddleware` in `backend/app/main.py`,
  gated on a new `CORS_ALLOWED_ORIGINS` env var (comma-separated; empty —
  the previous implicit behavior — disables CORS entirely, so the device
  simulator/ESP32 firmware, which aren't browsers, are unaffected). Wired
  through `docker-compose.yml`, `.env`/`.env.example`, and the root
  `README.md`'s env var table.
- Verified: `npm run build` (`tsc -b && vite build`) and `npm run lint`
  (`oxlint`) both clean. Rebuilt and restarted the `api` container
  (`docker compose up --build -d api`) to pick up the CORS change, confirmed
  the preflight response now carries `access-control-allow-origin` via
  `curl -X OPTIONS`. Then started the Vite dev server and drove a real
  headless Chromium against it (Playwright, installed in a scratch
  directory — not added to `frontend/package.json`, since it's a one-off
  verification tool, not an app dependency): the page rendered "Devices (1)"
  with the real registered device's full JSON (`device_state`,
  `latest_telemetry` included) and zero console errors. Dev server stopped
  afterward.

## Stage 2 — notes

- `pages/DeviceListPage.tsx` is now the real list UI (replacing the Stage 1
  JSON-dump scaffold): header with a live count, a card per device
  (`refetchInterval: 5000`), empty state (0 devices), and an API-unreachable
  error banner. Visual design follows the mobile mockup's tokens exactly —
  card surface `#fcfcfb` on page `#f9f9f7`, `rgba(11,11,11,0.10)` borders,
  `#0ca30c`/`#898781` online/offline dot, `#2a78d6` accent, `#d03b3b` error
  red — via Tailwind arbitrary-value classes rather than a token file (no
  design-system package exists yet to hang one off).
- Each card shows: online/offline dot, name, `hardware_id`/`device_type`
  (monospace), and — when online — power + target temperature from
  `device_state.desired_state` alongside the latest telemetry reading ("now"
  temp); when offline, "Offline · last seen Xh ago" via a small hand-rolled
  `lib/format.ts#formatRelativeTime` (no date library added for one
  formatting need). A device with a `device_state` but no command ever sent
  (`power`/`target_temperature` both `null`) shows "No target set" rather
  than "Off · null°C target". A "Syncing to new setpoint" indicator appears
  when `desired_state` and `reported_state` disagree while online — logic
  verified by inspection (compares the two flat objects field-by-field); the
  live timing window to catch it mid-sync in a screenshot is only a couple
  of seconds (the simulator's default `COMMAND_POLL_INTERVAL_SECONDS=3`), so
  it wasn't caught on camera, but the same command-issue round trip that
  proved everything else (see below) exercised the code path.
- Added `components/icons.tsx` (`ChevronRightIcon`, `PowerIcon` so far —
  `stroke="currentColor"` so color comes from the wrapping element, unlike
  the mockup's static per-instance hex) and `lib/format.ts`. Added the
  `/devices/:deviceId` route + a minimal `DeviceDetailPage` stub (fetches
  and JSON-dumps the single device, same pattern Stage 1 used for the list)
  so the list's chevron-per-row affordance actually goes somewhere instead
  of being a dead end — Stage 3 replaces its body with the real screen.
- Verified: `npm run build` and `npm run lint` both clean. Started the
  `device-simulator` container (not running before this stage; stopped again
  afterward) to get a second, *online* device alongside the existing stale
  offline one — gave one screen both states plus a "no target set" case for
  free. Issued a real command
  (`POST .../devices/4/commands {"power":true,"target_temperature":23}`) to
  confirm the online card's "On · 23°C target" / "now" reading update
  end-to-end. Headless Chromium (Playwright, scratch dir, same as Stage 1)
  screenshotted the list at the mockup's 390px width and the click-through
  into the detail stub — both screens rendered correctly, zero console
  errors. Dev server and `device-simulator` both stopped afterward.

## Stage 3 — notes

- `pages/DeviceDetailPage.tsx` is now the real detail UI (replacing the
  Stage 2 JSON-dump stub): header (back chevron, name, hardware_id, online
  pill), a Desired/Reported panel (`StateCard` — two cards side by side,
  "Both in agreement" vs. "Syncing" computed by comparing the two
  `ClimateState` objects field-by-field, same logic already used for the
  list's syncing badge), a controls card (power toggle as a real
  `role="switch"` button, target-temperature stepper clamped to 10–32°C —
  a frontend-only sanity guard, not a backend constraint), a command-status
  strip, the temperature/humidity preview card (linking to a new
  `/devices/:id/graph` stub, same "don't leave a dead link" pattern as
  Stage 2's detail stub), and a low-emphasis "Delete device" action behind
  `window.confirm` (no modal library — proportional to this MVP's scope).
- Commands: `POST .../commands` fires on toggle/step, then the returned
  command id is polled via `GET .../commands/{id}` (`refetchInterval: 1000`
  while `status === "pending"`, stopping itself once terminal). **Only the
  command issued in the current session is ever shown** — the backend has
  no "list commands for this device" endpoint, so there's no way to recover
  "what was the last command" on a fresh page load. Not fixed here since it
  wasn't blocking (the desired/reported panel doesn't need it), but worth a
  backend endpoint if a persistent command history becomes a real ask.
- **Bug found and fixed by actually watching the pending→completed
  transition in a browser, not just by reading the code**: the Desired
  panel updated the instant a command was created (`sendCommand`'s
  `onSuccess` already invalidated the device query), but the Reported panel
  only caught up on the next background 5s poll — for a moment after a
  command completed, the status strip said "Completed" while "Reported"
  still showed the stale value and the panel still said "Syncing". Fixed
  with a `useEffect` that invalidates the device query the instant the
  polled command leaves `"pending"`, instead of waiting for the timer.
  Re-verified with a screenshot taken the moment "Completed" appears (no
  extra wait) — Reported now matches Desired immediately.
- Added icons: `ChevronLeftIcon`, `MinusIcon`, `PlusIcon`, `CheckCircleIcon`,
  `XCircleIcon` (alongside Stage 2's `ChevronRightIcon`/`PowerIcon`).
- Added `pages/DeviceGraphPage.tsx` stub (fetches and JSON-dumps
  `listTelemetry`) and the `/devices/:id/graph` route — Stage 4 replaces its
  body with the real time-range chips + stacked charts.
- Verified: `npm run build` and `npm run lint` clean (one
  `react-hooks/exhaustive-deps` warning surfaced and was fixed by widening
  the new effect's dependency to the full `activeCommand` object). Started
  `device-simulator` again (stopped after) for a live online device, and
  registered a throwaway `test-delete-me` device via the device API
  specifically so the delete flow could be exercised for real without
  touching the two devices used for ongoing testing. Headless Chromium
  (Playwright, same scratch setup as prior stages) drove the full loop:
  opened the online device, toggled power (screenshotted mid-sync — desired
  flipped, reported hadn't yet, status strip said "Sending…"), watched it
  reach "Completed" with Reported caught up, stepped the target temperature
  and watched that settle too, followed "View graph" into the telemetry
  stub (confirming the endpoint returns real data — 26 readings, including
  an actual multi-hour gap between two simulator runs, useful fixture for
  Stage 4), then deleted the throwaway device via the confirm-dialog flow
  and confirmed it disappeared from the list. Zero console errors across
  the whole run. Dev server and `device-simulator` both stopped afterward.

## Stage 4 — notes

- **Backend fix, found before writing any chart code**: reviewing
  `telemetry_service.list_telemetry` (added in the earlier backend pass)
  ahead of relying on it for real showed it ordered ascending then applied
  `LIMIT` — meaning a truncated window silently kept the *oldest* rows and
  dropped everything more recent, backwards for a graph. Fixed by ordering
  descending, taking `LIMIT`, then reversing back to ascending for the
  response (`backend/app/services/telemetry_service.py`). Verified with
  `curl ...&limit=3` against a window with more rows than that, confirming
  the 3 *most recent* readings come back, still oldest-first. Updated the
  README's endpoint description to state this explicitly.
- `pages/DeviceGraphPage.tsx` is now the real graph (replacing the Stage 3
  JSON-dump stub): a 1H/24H/7D/30D chip row (`Custom` intentionally
  deferred — plan already flagged it as a stretch goal needing a
  date-picker beyond the mockup's chip row) and two `TelemetryChart`
  instances (temperature, humidity) — never one dual-axis chart, per the
  dataviz skill's hard rule (different units, different scales).
- `lib/telemetry.ts`: `detectGaps` has no fixed "expected interval" to
  compare against — the simulator and real ESP32 hardware can run at
  different cadences, and there's no config for it — so it derives one from
  the series' own median inter-reading interval and flags anything
  `> max(4 × median, 60s)` as a gap. `splitIntoRuns` breaks the reading list
  at each flagged gap. `computeStats` gives client-side min/avg/max (the
  backend deliberately doesn't aggregate — see README's Out of scope).
- `components/TelemetryChart.tsx`: real, responsive, interactive chart, not
  a redraw of the static mockup. Each contiguous run renders as a solid
  line + ~10%-opacity area fill; gaps render as a dashed connector between
  hollow-ring boundary markers, matching the mockup's visual language but
  now data-driven. X is time-proportional (not index-evenly-spaced like the
  static mockup) — a real device that's only online in two brief bursts
  compresses each burst into what looks like a near-vertical stroke at real
  24h/7D scale, which is correct, not a bug (confirmed by checking the 1H
  view, where the same burst spreads out and shows its actual shape).
  Pointer-move over either chart drives one shared `hoveredIndex` in the
  parent, so the crosshair/tooltip on both charts track together — the
  small-multiples-share-an-axis idea from the mockup, now literally true.
  Y/X are scaled independently (viewBox `preserveAspectRatio="none"`), so
  markers are plain absolutely-positioned CSS circles rather than SVG
  `<circle>` — an SVG circle under non-uniform scaling renders as an
  ellipse; lines/polylines use `vector-effect="non-scaling-stroke"` instead
  so their stroke width stays a crisp constant pixel width either way.
- Verified: `npm run build` clean. `npm run lint` caught two real issues,
  both fixed before moving on: a `react-hooks/exhaustive-deps` warning
  (widened the Stage 3 completion-sync effect's dependency, see Stage 3
  notes) was pre-existing and unrelated; new to this stage, a
  `react(purity)` warning on computing `Date.now()` inside a render-phase
  `useMemo` for the query's `since` value — fixed by moving that
  computation into the query function itself, which is also more correct
  behavior (each poll's window now slides forward to the actual fetch time
  rather than staying anchored to whenever the range chip was last picked).
  Then drove it in a real browser: opened the graph for the device with the
  real ~17h-old gap in its telemetry (from Stage 3's testing) on the
  default 24H view and confirmed the dashed segment renders exactly where
  that gap is; hovered a chart and confirmed the crosshair, tooltip
  ("09:01 AM · 24.5°C" style), and sync across both charts all work
  (`locator.hover()` — a raw `mouse.move()` didn't reliably dispatch
  pointer events on the invisible hit-rect in this headless setup, which
  cost some debugging time but was a test-script issue, not an app bug);
  switched to 1H (gapless, shows real fine-grained variation) and 7D
  (date-only tick labels, e.g. "Aug 29", correctly dropping time-of-day).
  Zero console errors throughout. Dev server stopped afterward;
  `device-simulator` was not needed this stage since the existing data
  already had everything needed (including the gap), so it was left
  stopped rather than started and stopped again for no reason.

## Stage 5 — notes

- Added two shared components used by all three pages, replacing duplicated
  ad-hoc markup: `components/Skeleton.tsx` (a single pulsing-block
  primitive) and `components/ErrorBanner.tsx` (the red inline banner every
  page already had its own copy of). A shared toast/notification system was
  considered and deliberately not built — the plan only calls for a
  consistent banner, and every error here is already scoped to "this page's
  data didn't load," which an inline banner communicates correctly; a
  global toast would be solving a problem this app doesn't have.
- Replaced every page's plain "Loading…" text with a skeleton shaped like
  the real content: `DeviceCardSkeleton` (list), a header+state-cards+
  controls-card skeleton (detail), and two chart-shaped blocks (graph).
- Verified: `npm run build` and `npm run lint` clean. Then, in a real
  browser — Playwright's `page.route()` to delay or abort the relevant API
  call, since there's no other way to hold a real app in a loading/error
  state long enough to screenshot it:
  - Delayed `/devices` → skeleton cards render in the right shape.
  - Aborted `/devices` → the error banner renders (took longer than
    expected to appear — TanStack Query's default retry/backoff means a
    failed request can take several seconds before `isError` flips; that's
    existing query-client behavior, not something this stage changed, and
    the eventual banner is correct either way).
  - Delayed `/devices/{id}` and `/telemetry` → detail and graph skeletons
    both render correctly.
  - Loaded all three pages at 1280px (vs. the mockups' 390px): content
    stays in a centered `max-w-md` column, no horizontal overflow
    (confirmed via `document.documentElement.scrollWidth` vs.
    `clientWidth`, not just by eye), and the graph's lines/circles stayed
    crisp and properly circular at the wider width — a real confirmation
    that Stage 4's `vector-effect="non-scaling-stroke"` + HTML-overlay-
    marker choices (made specifically to avoid distortion under non-uniform
    scaling) hold up outside the narrow container they were built in.
  No responsive fixes were needed — this was a "confirm nothing breaks"
  pass, not a redesign, matching the plan's scope for this stage. Dev
  server stopped afterward.

## Stage 6 — notes

- `frontend/Dockerfile`: two-stage build (`node:20-alpine`) — build stage
  runs `npm install` + `npm run build`; runtime stage copies the built
  `dist/`, `vite.config.ts`, `package.json`, and the *full* `node_modules`
  from the build stage (not a separate minimal `vite`-only install) and
  serves with `npx vite preview --host 0.0.0.0 --port $FRONTEND_PORT`.
  Chose `vite preview` over adding nginx — no new tool, no config file,
  same toolchain already in `package.json`, consistent with this MVP's
  "simple over optimized" posture (documented as a Known simplification in
  the root README). Added `frontend/.dockerignore`
  (`node_modules`/`dist`/`.env`/`.env.local`) mainly to keep the build
  context small; double-checked it isn't load-bearing for correctness,
  since Vite's `loadEnv` never lets a `.env` *file* override a real
  `process.env` value, and the build-time `ARG`/`ENV` already sets one.
- **The one genuine gotcha, called out clearly in three places** (root
  README's new "Frontend" section, `frontend/Dockerfile`'s comment, and the
  `docker-compose.yml` service): `VITE_API_BASE_URL` is inlined into the
  static JS bundle at **image build time** (`vite build` reads
  `import.meta.env.VITE_*` from `process.env` and hardcodes it into the
  output), unlike every other setting in this project, which every other
  Dockerfile reads from the environment at container *start*. It also has
  to be a browser-reachable URL (`http://localhost:${API_HOST_PORT}`), not
  the `http://api:8000` Docker-network hostname the device-simulator uses
  — the SPA runs in the user's browser, outside the compose network, a
  different situation from every other service in this stack. Changing
  `API_HOST_PORT` therefore requires `docker compose up --build -d
  frontend`, not just a restart; documented rather than silently footgunned.
- `docker-compose.yml`: new `frontend` service, `depends_on: api` (matches
  `device-simulator`'s pattern — no healthcheck-gated wait since a browser
  hitting it before the API's ready just shows the existing loading/error
  states, not a crash). New `FRONTEND_PORT` (container-internal, default
  `4173`, matching `vite preview`'s own default) and `FRONTEND_HOST_PORT`
  (host-exposed, default `5173`) in `.env.example` and the local `.env`,
  following `APP_PORT`/`API_HOST_PORT`'s existing naming pattern. `5173`
  was chosen deliberately to match `CORS_ALLOWED_ORIGINS`'s existing
  default and the `npm run dev` convention — one CORS origin covers
  whichever way the frontend happens to be running, though not both at once
  (a real but minor conflict if someone runs both simultaneously, noted in
  `.env.example`).
- README updates: Quick Start now says "four services"; new "Frontend"
  section explaining the build-time gotcha and how to rebuild; env var
  table gained `FRONTEND_HOST_PORT`; Known simplifications gained the
  `vite preview`-over-nginx note. `frontend/README.md` now points at the
  Docker path for just-run-the-stack use vs. `npm run dev` for active
  frontend development.
- Verified for real, not just read back: `docker compose up --build -d
  frontend` — image built clean, container came up, `curl` confirmed it
  serves (`200`, real `index.html` referencing hashed assets). Fetched the
  built JS bundle directly and grepped it for `http://localhost:` to
  confirm `8080` (this machine's actual `API_HOST_PORT`) was really baked
  in, not just assumed. Headless Chromium against `http://localhost:5173`
  showed real device data with zero console errors — the Dockerized
  frontend talking to the Dockerized backend, exactly like a real user
  would get it. Then ran the exact command the README's Quick Start tells
  a new user to run, `docker compose up --build -d` with no service named,
  and confirmed all **four** services (`db`, `api`, `device-simulator`,
  `frontend`) came up together; with the simulator live, the same browser
  check showed the device online with real telemetry end-to-end. Left the
  full stack running afterward — unlike the ad-hoc dev-server sessions in
  earlier stages, a working `docker compose up` stack is this stage's
  actual deliverable, not a temporary test fixture to tear back down.

All six stages of `frontend-plan.md` are now done.
