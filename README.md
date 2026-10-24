# Runway

A minimalist, real-time dashboard for CSE students. It connects GitHub, Codeforces, a resume and a timetable, and includes an AI agent that plans, sorts and updates things (with a no-key fallback for everything).

> Work in progress. Full setup, environment variables and a demo script land in milestone M10.

## Quick start

```bash
npm install
npm run dev        # web on http://127.0.0.1:5173, API on http://127.0.0.1:8787
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts server and web together |
| `npm test` | Vitest across all workspaces |
| `npm run typecheck` | TypeScript in shared, server and web |
| `npm run lint` | ESLint |
| `npm run build` | Production build of all workspaces |

## Layout

- `shared/` – TypeScript types, zod schemas and pure logic (planner, sorter, radar, streak)
- `server/` – Hono API, SQLite store, source adapters, scheduler, SSE, AI agent
- `web/` – Vite + React + Tailwind dashboard
