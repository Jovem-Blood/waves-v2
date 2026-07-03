# Docker Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optimized Docker image and Docker Compose setup for running the Nuxt web app and Discord bot as separate containers.

**Architecture:** Build one reusable production image with multi-stage Dockerfile, then run separate `web` and `bot` services with different commands. Persist SQLite in a named volume and keep Compose extensible through standard `-f` override files.

**Tech Stack:** Docker BuildKit, Docker Compose, Node.js 25.5.0, pnpm 11.5.2, Nuxt 4/Nitro, discord.js, SQLite/better-sqlite3, FFmpeg.

---

### Task 1: Container Build Files

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create multi-stage Dockerfile**

Use `node:25.5.0-bookworm-slim`, enable Corepack, install pnpm from `packageManager`, build all workspaces, prune dev dependencies, install `ffmpeg` in the final image, and expose port `3000`.

- [ ] **Step 2: Create `.dockerignore`**

Exclude local dependencies, build outputs, test caches, logs, env files, SQLite files, git metadata, and local worktrees.

- [ ] **Step 3: Build image**

Run: `docker build -t waves:local .`
Expected: image builds successfully.

### Task 2: Compose Runtime

**Files:**

- Create: `docker-compose.yml`

- [ ] **Step 1: Add `web` service**

Build from local Dockerfile, load `.env`, set production defaults, persist `/data`, expose `3000:3000`, and run migrations before Nuxt server startup.

- [ ] **Step 2: Add `bot` service**

Use the same image, load `.env`, depend on `web`, set `BOT_API_BASE_URL=http://web:3000/api` and `INTERNAL_WEB_URL=http://web:3000`, then run compiled bot.

- [ ] **Step 3: Validate Compose config**

Run: `docker compose config`
Expected: config renders without errors.

### Task 3: Documentation

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add Docker section**

Document `docker compose up --build`, `docker compose logs -f web bot`, `docker compose down`, named volume behavior, and adding future override files such as `docker-compose.logs.yml` or `docker-compose.cloudflared.yml`.

- [ ] **Step 2: Run formatting check**

Run: `mise x node@25.5.0 -- pnpm format:check`
Expected: passes or reports only files to format.

### Task 4: Verification

**Files:**

- No new files.

- [ ] **Step 1: Verify Docker image build**

Run: `docker build -t waves:local .`
Expected: build succeeds.

- [ ] **Step 2: Verify Compose model**

Run: `docker compose config`
Expected: config succeeds and includes `web`, `bot`, and `waves-data`.

- [ ] **Step 3: Check worktree**

Run: `git status --short`
Expected: only Docker-related files and this plan are changed.
