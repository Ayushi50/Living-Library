# Living Library

A private reading and watching tracker with an interactive hardcover bookshelf.

**Live app: https://livin-library.vercel.app/**

## Features

- **Bookshelf** – browse your books as hardcover spines on customizable shelves
- **Books, movies and shows** – track what you're reading and watching, with ratings and status
- **Journal** – write notes and reflections alongside your entries
- **Stats and goals** – charts of your habits and reading/watching goals
- **Search** – quick palette to find anything in your library
- **Import / export** – back up or restore your library as JSON
- **Sync or local** – works offline with browser storage; sign in (email or Google) to sync via Supabase

## Tech stack

React 19 · TypeScript · esbuild · Supabase (auth + storage) · Vercel (hosting + serverless TMDB proxy)

## Getting started

```sh
npm install
cp .env.example .env   # optional: add Supabase credentials
npm run dev
```

Without Supabase credentials the app stores data in browser local storage.

| Script | Description |
| --- | --- |
| `npm run dev` | Build in watch mode |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | Type-check with `tsc` |
| `npm test` | Run unit tests |

## Configuration

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon key (never use a service-role key) |

Set the same variables in Vercel for deployments.

## Project structure

```
api/        Vercel serverless function (TMDB proxy)
scripts/    Build and dev-server scripts
src/        App source (components, views, lib)
tests/      Unit and e2e tests
```

## Deployment

Deployed on Vercel at https://livin-library.vercel.app/. `vercel.json` sets the build command, output directory and the `/api/tmdb` rewrite.
