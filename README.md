# 🏛️ Arcane — Hint-Chain Coding Challenge Platform

> An algorithmic competition platform featuring an innovative **Hint-Chain Finite State Machine (FSM)**. Built for coding clubs, hackathons, and high-stakes programming tournaments.

---

## 📖 Table of Contents
- [What is Arcane?](#-what-is-arcane)
- [How It Works: The Hint-Chain Architecture](#-how-it-works-the-hint-chain-architecture)
- [System Architecture](#-system-architecture)
- [Finite State Machine (FSM) Lifecycle](#-finite-state-machine-fsm-lifecycle)
- [Key Architectural Design Decisions](#-key-architectural-design-decisions)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Setup & Installation Guide](#-setup--installation-guide)
- [API Reference](#-api-reference)
- [Environment Variables](#-environment-variables)

---

## 🌟 What is Arcane?

Traditional competitive programming platforms (like LeetCode or Codeforces) evaluate only raw code correctness: you either pass or fail.

**Arcane** introduces a psychological and strategic dimension: **Algorithmic Discernment**.

In Arcane, participants progress through sequential algorithmic stages (e.g., *Arrays & Two Pointers* $\to$ *Hash Maps & Strings* $\to$ *Dynamic Programming & Recursion*). At each stage, the platform presents a coding challenge alongside a set of **Hint Cards**:
- **One Genuine Hint**: Represents the optimal asymptotic approach or key insight for that problem.
- **One or More Decoy Hints**: Plausible-sounding but suboptimal or misleading algorithmic strategies.

Participants select a hint card to commit their strategic intent before submitting their solution. The platform rewards true understanding and punishes blind guessing.

---

## ⚙️ How It Works: The Hint-Chain Architecture

The core of Arcane is a **progressive hint ladder** where solving a problem unlocks $+1$ hint for the next challenge:

```
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Arrays & Two Pointers                                        │
│  Problem 1 (Cold Solve — 0 Hints Available)                            │
│  Contestant must solve with raw algorithmic intuition.                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         SOLVED (All Tests Pass)
                         Awards +1 Hint for Stage 2
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 2: Hash Maps & Strings                                          │
│  Problem 2 (Receives 1 Hint: 1 Genuine)                                │
│  Contestant uses Hint 1 to guide their solution.                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         SOLVED (All Tests Pass)
                         Awards +1 Hint for Stage 3 (Total = 2 Hints)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 3: Dynamic Programming & Recursion                              │
│  Problem 3 (Receives 2 Hints: 1 Genuine + 1 Decoy)                     │
│  Contestant must discern which hint is real before submitting!          │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
    Contestant Selects                               Contestant Selects
       GENUINE HINT                                      DECOY HINT
    & Code Fails Test Cases                          & Code Fails Test Cases
               │                                          │
               ▼                                          ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│      WRONG RETRY BRANCH      │        │       DECOY LOOP BRANCH        │
│  • Genuine hint protects user│        │  • Decoy hint is ELIMINATED!   │
│  • Stays on the SAME problem │        │  • Loops to an ALTERNATE       │
│  • Debug syntax/logic & retry│        │    problem of the SAME stage   │
│  • No stage rollback         │        │  • Remaining hints available   │
└──────────────┬───────────────┘        └────────────────┬───────────────┘
               │                                         │
               └────────────────────┬────────────────────┘
                                    │
                         SOLVED (All Tests Pass)
                         Awards +1 Hint for Stage 4 (Total = 3 Hints)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 4: Advanced Graph Algorithms (Receives 3 Hints: 1 Real + 2 Decoys)
│  ... Continues scaling: Stage K receives (K - 1) Hints                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 📈 The +1 Hint Growth Formula

| Stage / Problem | Trigger Condition | Total Hints | Hint Composition | Result on Wrong Attempt |
| :--- | :--- | :---: | :--- | :--- |
| **Stage 1 (Problem 1)** | Contest start | **0 Hints** | Cold solve — baseline test | Retry same problem |
| **Stage 2 (Problem 2)** | Solved Problem 1 | **1 Hint** | **1 Genuine Hint** (0 Decoys) | Retry same problem |
| **Stage 3 (Problem 3)** | Solved Problem 2 | **2 Hints** | **1 Genuine Hint + 1 Decoy Hint** | • Decoy: Loop to alternate Stage 3 problem<br>• Genuine: Retry same problem |
| **Stage 4 (Problem 4)** | Solved Problem 3 | **3 Hints** | **1 Genuine Hint + 2 Decoy Hints** | • Decoy: Loop to alternate Stage 4 problem<br>• Genuine: Retry same problem |
| **Stage $K$ (Problem $K$)** | Solved Problem $K-1$ | **$K - 1$ Hints** | **1 Genuine Hint + $(K - 2)$ Decoy Hints** | • Decoy: Loop to alternate Stage $K$ problem<br>• Genuine: Retry same problem |

> **The Golden Architectural Invariants**:
> 1. **+1 Hint Progression**: Each completed stage awards **$+1$ hint** for the subsequent stage ($0 \to 1 \to 2 \to 3 \dots$).
> 2. **Single True Insight**: In every stage with hints, **exactly 1 hint is genuinely optimal**, and all other $N-1$ options are deceptive decoys.
> 3. **The Decoy Loop**: Choosing a decoy and submitting failing code permanently eliminates that decoy and forces a **loop to an alternate problem of the same problem type**.
> 4. **Genuine Hint Shield**: Choosing the genuine hint shields the contestant from looping on failure; they stay on the same problem to fix bugs.

---

### 🎯 The 4-Way Decision Matrix

| Hint Selected | Code Verdict | FSM State | Outcome & Next Action |
| :--- | :---: | :---: | :--- |
| **Genuine Hint** | **Accepted** ✅ | **`correct`** | **Advances to Next Stage!** Clears current stage, marks hint event `resolved`, and unlocks **$+1$ hint** for the subsequent problem. |
| **Genuine Hint** | **Failed** ❌ | **`wrong_retry`** | **Protected from Looping.** Contestant keeps the **same problem** to debug syntax and edge cases. No penalty or stage reset. |
| **Decoy Hint** | **Failed** ❌ | **`wrong_looped`** | **Decoy Trap Closes.** The chosen decoy is **permanently eliminated**, and the contestant is **looped to an alternate problem of the same problem type**. |
| **None (Stage 1)** | **Accepted** ✅ | **`correct`** | **Advances to Stage 2.** Stage 1 is a cold solve (0 hints). Solving it unlocks **Hint 1** (1 Genuine Hint) for Problem 2. |

> 🔒 **Pre-Submission Rule**: From Stage 2 onwards, contestants **must select a hint card** in the UI before submitting code. Submitting without a hint choice is blocked by the client to enforce strategic algorithmic commitment.

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph Client ["Contestant Interface"]
        SPA["Browser Single-Page App\n(Vanilla JS + CSS3 + HTML5)"]
        WSClient["Socket.io Client\n(Live Leaderboard Broadcast)"]
    end

    subgraph Gateway ["API Gateway & Middleware"]
        AuthMid["JWT Auth Guard\n(/api/session/*)"]
        RateLimiter["Submit Rate Limiter\n(1 submit / 3s per contestant)"]
        DTOLayer["DTO Sanitization Layer\n(Strips is_correct from hints)"]
    end

    subgraph CoreEngine ["Progression Engine (FSM)"]
        Phase1["Phase 1: State Transition\n(Lock < 10ms → outcome: 'judging')"]
        Phase2["Phase 2: Parallel Code Judging\n(Non-blocking, 0 DB locks)"]
        Phase3["Phase 3: Outcome & Hint Chain FSM\n• Correct → +1 Hint & Advance\n• Wrong + Decoy → Eliminate & Loop Same Type\n• Wrong + Genuine → Retry Same Problem"]
    end

    subgraph Sandbox ["Execution Sandbox"]
        Piston["Piston Docker Engine (Port 2000)\nParallel Test Execution (Promise.all)"]
    end

    subgraph Database ["Data & Persistence Layer"]
        Postgres[("PostgreSQL 16\n• problem_types (hints_per_stage)\n• problems & test_cases\n• decoy_hints\n• hint_events & hint_options\n• served_problems & submissions")]
        Redis[("Redis 7 (AOF)\n• Session state & queue persistence")]
        Cron["Stale Recovery Cron (30s)\nResets 'judging' >60s to 'pending'"]
    end

    SPA -->|HTTP POST /submit| RateLimiter
    RateLimiter --> AuthMid
    AuthMid --> DTOLayer
    DTOLayer --> Phase1

    Phase1 -->|Atomic UPDATE| Postgres
    Phase1 --> Phase2
    Phase2 -->|HTTP POST /execute| Piston
    Phase2 --> Phase3

    Phase3 -->|Atomic Verdict Write| Postgres
    Phase3 -.->|On Stage Clear| WSClient

    Cron -->|Sweep stuck states| Postgres
    WSClient <-->|WebSockets| Gateway
```

---

## 🔄 Finite State Machine (FSM) Lifecycle

Arcane models attempt progression strictly through `served_problems.outcome`:

```mermaid
stateDiagram-v2
    [*] --> pending: Problem Served (Stage 1: 0 Hints)

    pending --> judging: Contestant Submits Code (Phase 1 Lock)

    judging --> pending: Stale Recovery (>60s stuck)
    judging --> judging: Duplicate Request (Idempotency Cache)

    judging --> accepted: All Test Cases Pass
    accepted --> pending: Next Stage Served (+1 Hint Awarded)
    accepted --> finished: All Problem Types Completed

    judging --> wrong_retry: Failed + Genuine Hint Selected
    wrong_retry --> pending: Retry Same Problem (Shielded from Loop)

    judging --> wrong_looped: Failed + Decoy Hint Selected
    wrong_looped --> pending: Decoy Eliminated + Alternate Problem of Same Type Served
```

---

## 🛡️ Key Architectural Design Decisions

### 1. Two-Phase Transaction Split (Preventing DB Starvation)
- **Problem**: Traditional platforms execute code *inside* an open database transaction. If code takes 3 seconds to execute, the database row is locked for 3,000ms. With 30 concurrent users, the database connection pool is instantly exhausted.
- **Arcane Solution**:
  - **Phase 1 (Lock < 10ms)**: Atomically transitions attempt from `pending` $\to$ `judging`. Commit and release lock.
  - **Phase 2 (0 DB Locks)**: Sends all test cases in parallel (`Promise.all`) to the sandboxed code runner.
  - **Phase 3 (Lock < 10ms)**: Atomically transitions attempt from `judging` $\to$ `correct` or `pending` (retry) or `looped`.

### 2. DTO Layer: Zero Data Leaks
- Decoy and Genuine hints reside in the same `hint_options` table.
- The `src/dto/index.js` layer strictly sanitizes all outgoing payloads. `is_correct` is **never** transmitted to the browser, making it impossible to inspect network traffic to find the genuine hint.

### 3. Idempotency via `client_request_id`
- Network retries and duplicate form clicks send a UUID `client_request_id`.
- The database enforces a unique constraint on `submissions.client_request_id`.
- Duplicate submissions return cached verdicts immediately without re-running code on Piston.

### 4. Stale Judging Recovery Cron
- If the backend process crashes or Piston times out while an attempt is in the `judging` state, the problem would otherwise be locked forever.
- A background worker (`src/services/staleRecovery.js`) runs every 30 seconds to automatically reset any attempt stuck in `judging` for $> 60$ seconds back to `pending`.

### 5. Pool Exhaustion Fallback
- If a participant loops through all available problems in a stage without solving, the engine gracefully falls back to recycled problems rather than throwing an unhandled exception.

---

## 💻 Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v18+) | Backend execution environment |
| **Framework** | Express.js 4 | REST API and static file serving |
| **Database** | PostgreSQL 16 | Relational data, foreign keys, JSONB test cases |
| **ORM / Query Builder** | Knex.js | Migrations, seeders, connection pooling |
| **Realtime** | Socket.io | Live leaderboard broadcasting |
| **Code Runner** | Piston (Docker) | High-speed multi-language sandboxed evaluation |
| **Caching / Sessions** | Redis 7 (Alpine) | In-memory session store & task broker |
| **Security** | bcryptjs + jsonwebtoken | Password hashing & stateless authentication |
| **Frontend** | Vanilla JS / CSS3 / HTML5 | Ultra-responsive, zero-build cyber-arcane UI |

---

## 📂 Project Structure

```
arcane/
├── docker-compose.yml             # Postgres, Redis, and Piston container definitions
├── package.json                   # Dependencies and npm scripts
├── .env.example                   # Environment configuration template
├── public/
│   └── index.html                 # Single-page frontend (Arena, Editor, Leaderboard)
└── src/
    ├── config.js                  # Central configuration loader
    ├── server.js                  # Express entry point & Socket.io server
    ├── errors.js                  # Custom operational HTTP errors
    ├── db/
    │   ├── index.js               # Knex client instance
    │   ├── knexfile.js            # Migration and seed paths
    │   ├── initDb.js              # Database creation bootstrap script
    │   ├── migrations/            # Schema definitions
    │   │   └── 001_initial_schema.js
    │   └── seeds/                 # Initial problem sets, decoys, and stages
    │       └── 001_initial_seed.js
    ├── dto/
    │   └── index.js               # Data Transfer Objects (strips is_correct)
    ├── middleware/
    │   └── auth.js                # JWT verification & role authorization
    ├── routes/
    │   ├── auth.js                # Register & Login
    │   ├── session.js             # Current problem, hint select, submit solution
    │   ├── leaderboard.js         # Realtime rankings
    │   └── admin.js               # Problem management & live monitoring
    └── services/
        ├── judgeService.js        # Parallel Piston execution client
        ├── progressionEngine.js   # FSM core, hint chain logic, transitions
        ├── leaderboardService.js  # Ranking algorithms
        └── staleRecovery.js       # Background cron for orphaned judging states
```

---

## 🚀 Setup & Installation Guide

Follow these steps to set up and run Arcane locally on your machine or competition server.

---

### Step 1: Prerequisites
Ensure you have the following installed:
- **Node.js** (v18.0.0 or higher) — [Download Node.js](https://nodejs.org/)
- **Git** — [Download Git](https://git-scm.com/)
- **Docker & Docker Compose** (Recommended) — [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)
  *(Alternatively: Local installations of PostgreSQL 16 and Redis 7)*

---

### Step 2: Clone the Repository & Install Dependencies
```bash
# Clone repository
git clone https://github.com/danishjk2156/Arcane.git

# Enter project directory
cd Arcane

# Install Node.js dependencies
npm install
```

---

### Step 3: Configure Environment Variables
Copy the sample environment file to create your active `.env`:
```bash
cp .env.example .env
```

Ensure your `.env` matches your setup (default values work out-of-the-box with Docker):
```env
# Server Port & Environment
PORT=3000
NODE_ENV=development

# PostgreSQL Database Connection
DATABASE_URL=postgresql://postgres:danish%402005@localhost:5432/arcane_db

# Redis Connection
REDIS_URL=redis://localhost:6379

# Sandboxed Code Execution Engine (Local Piston)
PISTON_URL=http://localhost:2000

# Authentication & Rate Limiting
JWT_SECRET=arcane-jwt-super-secret-key-2026
JWT_EXPIRY=24h
SUBMIT_RATE_LIMIT_WINDOW_MS=3000
SUBMIT_RATE_LIMIT_MAX=1

# Stale Judging Recovery (seconds)
STALE_JUDGING_TIMEOUT_S=60
```

---

### Step 4: Launch Infrastructure Services

#### Option A: Using Docker Compose (Recommended)
Start PostgreSQL, Redis, and the Piston Code Runner simultaneously with a single command:
```bash
docker compose up -d
```

Verify that all three containers are healthy and running:
```bash
docker compose ps
```
You should see:
- `arcane-postgres` on port `5432`
- `arcane-redis` on port `6379`
- `arcane-piston` on port `2000`

#### Option B: Standalone / Local Installation
If running PostgreSQL and Redis natively on your host machine:
1. Ensure the PostgreSQL service is active on port `5432`.
2. Ensure Redis is active on port `6379`.
3. Start local Piston runner:
   ```bash
   docker run -d -p 2000:2000 --name arcane-piston ghcr.io/engineer-man/piston
   ```

---

### Step 5: Initialize Database Schema & Seed Problems

Run the database setup lifecycle in order:

```bash
# 1. Create the 'arcane_db' database in PostgreSQL
npm run init-db

# 2. Run Knex schema migrations (creates all relational tables & indexes)
npm run migrate

# 3. Seed stages, problems, genuine hints, decoys, and test cases
npm run seed
```

> **Database Reset (Pro Tip)**: If you ever need to reset contest state and wipe all submissions/stages:
> ```bash
> npm run migrate:rollback
> npm run migrate
> npm run seed
> ```

---

### Step 6: Start the Arcane Application

- **Development Mode** (auto-restarts on code changes via Nodemon):
  ```bash
  npm run dev
  ```

- **Production Mode**:
  ```bash
  npm start
  ```

When started, your terminal will confirm:
```
🏛️  Arcane server running on port 3000
   Environment: development
   Judge:       http://localhost:2000
[StaleRecovery] Cron started — recovering entries stuck >60s in 'judging' state
```

---

### Step 7: Access the Frontend Arena

Open your web browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

1. **Sign In**: On the login modal, click **"Auto-fill Guest"** to instantly spawn a test contestant, then click **Continue**.
2. **Solve Problem 1**: Problem 1 (Arrays & Two Pointers) is a **Cold Solve** (0 hints). Write your solution and click **Submit Solution**.
3. **Earn Hint 1**: Passing Problem 1 unlocks Stage 2 and gives you **Hint 1** to solve Problem 2!
4. **Earn Hint 2**: Passing Problem 2 unlocks Stage 3 and gives you **2 Hints** (1 genuine + 1 decoy).
5. **Experience the Decoy Loop**: Select a decoy hint and submit failing code to see the decoy eliminated and an alternate problem served!
6. **Live Leaderboard**: Click the **Leaderboard** button in the navbar to see live rankings updating over WebSockets!

---

### Step 8: Verification & Health Diagnostics

You can verify the backend is running correctly using curl or your browser:

- **System Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)
  ```json
  {"status":"ok","timestamp":"2026-09-05T02:00:00.000Z"}
  ```

- **Supported Languages**: [http://localhost:3000/api/languages](http://localhost:3000/api/languages)
  ```json
  {"languages":[{"key":"c","label":"C (GCC 10.2.0)"},{"key":"cpp","label":"C++ (GCC 10.2.0)"},{"key":"java","label":"Java (OpenJDK 15.0.2)"},{"key":"python","label":"Python (3.10.0)"}]}
  ```

---

## 📡 API Reference

### Participant Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Create a participant handle with email and password |
| `POST` | `/api/auth/login` | Authenticate and receive JWT bearer token |

### Session & Challenge Progression (Requires Auth)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/session/current` | Returns active problem and visible hint options |
| `POST` | `/api/session/select-hint` | Sets contestant's active hint choice |
| `POST` | `/api/session/submit` | Submits code for execution (Rate-limited: 1 per 3s) |
| `GET` | `/api/session/history` | Retrieves participant's past submission records |

### Live Competition & Meta
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/leaderboard` | Ranked contestants by `(levels_completed DESC, total_time ASC)` |
| `GET` | `/api/languages` | Supported execution compilers and runtimes |
| `GET` | `/api/health` | System health check and server timestamp |

---

## ⚙️ Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the Express server |
| `NODE_ENV` | `development` | Environment mode (`development` / `production`) |
| `DATABASE_URL` | `postgresql://...` | Connection URI for PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Connection URI for Redis |
| `PISTON_URL` | `https://emkc.org/api/v2/piston` | URL of the Piston code execution runner |
| `JWT_SECRET` | `change-this...` | Secret key for signing JWT tokens |
| `SUBMIT_RATE_LIMIT_WINDOW_MS` | `3000` | Cooldown period between submissions (ms) |
| `SUBMIT_RATE_LIMIT_MAX` | `1` | Max submissions allowed per cooldown window |
| `STALE_JUDGING_TIMEOUT_S` | `60` | Threshold to reset orphaned `judging` records |

---

## 📄 License
MIT License. Created for competitive coding clubs and hackathons.
