# 🏛️ Arcane — Hint-Chain Coding Challenge Platform

> An algorithmic competition platform featuring an innovative **Hint-Chain Finite State Machine (FSM)**. Built for coding clubs, hackathons, and high-stakes programming tournaments.

---

## 📖 Table of Contents
- [What is Arcane?](#-what-is-arcane)
- [How It Works: The Hint-Chain Mechanic](#-how-it-works-the-hint-chain-mechanic)
- [System Architecture](#-system-architecture)
- [Finite State Machine (FSM) Lifecycle](#-finite-state-machine-fsm-lifecycle)
- [Key Architectural Design Decisions](#-key-architectural-design-decisions)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
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

## ⚙️ How It Works: The Hint-Chain Mechanic

```
                           Participant Submits Code
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   All Test Cases Pass?    │
                        └─────────────┬─────────────┘
                                      │
                       Yes ───────────┴─────────── No
                        │                          │
                        ▼                          ▼
            ┌──────────────────────┐    ┌──────────────────────┐
            │       ACCEPTED       │    │  Which Hint Chosen?  │
            │ Advance to Next Stage│    └──────────┬───────────┘
            └──────────────────────┘               │
                                   Genuine ────────┴──────── Decoy
                                      │                        │
                                      ▼                        ▼
                          ┌──────────────────────┐ ┌──────────────────────┐
                          │     WRONG RETRY      │ │     DECOY LOOP       │
                          │ • Keep same problem  │ │ • Eliminate decoy    │
                          │ • Fix code & retry   │ │ • Loop to alternate  │
                          │ • No stage reset     │ │   problem in stage   │
                          └──────────────────────┘ └──────────────────────┘
```

1. **If Code Passes (`accepted`)**:
   - The participant clears the stage.
   - The stage's hint event is marked `resolved`.
   - The platform serves the first challenge of the next stage.

2. **If Code Fails + Genuine Hint Selected (`wrong_retry`)**:
   - The platform recognizes that the participant selected the correct architectural approach.
   - **Protection Granted**: The participant is NOT looped back or penalized with a new problem.
   - They remain on the same problem to debug syntax, edge cases, or implementation mistakes.

3. **If Code Fails + Decoy Hint Selected (`wrong_looped`)**:
   - The participant fell for algorithmic misdirection.
   - **The Trap Closes**: The chosen decoy hint is permanently flagged as `eliminated = true`.
   - The current problem attempt is closed as a loop failure.
   - The participant is **looped** to an *alternate problem* belonging to the same stage, but now with one fewer decoy to mislead them!

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph Client ["Client Layer"]
        SPA["Browser Single-Page App\n(Vanilla JS + CSS + HTML5)"]
        WSClient["Socket.io Client\n(Live Leaderboard)"]
    end

    subgraph Server ["Express.js API Layer"]
        AuthMid["JWT Auth Middleware"]
        RateLimiter["Submit Rate Limiter\n(1 submit / 3s per contestant)"]
        DTOLayer["DTO Serialization Layer\n(Strips is_correct)"]
        
        subgraph Services ["Core Services"]
            ProgEngine["Progression Engine (FSM)"]
            JudgeSvc["Judge Service (Piston Client)"]
            LeaderboardSvc["Leaderboard Service"]
            StaleCron["Stale Recovery Cron (30s)"]
        end
    end

    subgraph Execution ["Sandboxed Code Runner"]
        Piston["Piston Execution Engine\n(C, C++, Python, Java)\nParallel Test Execution"]
    end

    subgraph Persistence ["Persistence Layer"]
        Postgres[("PostgreSQL 16\n• Participants\n• Served Problems\n• Hint Events\n• Submissions")]
        Redis[("Redis 7 (AOF)\n• Caching & State")]
    end

    SPA -->|HTTP REST| RateLimiter
    RateLimiter --> AuthMid
    AuthMid --> DTOLayer
    DTOLayer --> ProgEngine
    WSClient <-->|WebSockets| Server

    ProgEngine -->|Phase 1 & 3: Atomic Lock <10ms| Postgres
    ProgEngine -->|Phase 2: Non-blocking Execution| JudgeSvc
    JudgeSvc -->|HTTP POST /execute (Parallel)| Piston

    LeaderboardSvc --> Postgres
    LeaderboardSvc -.->|Emit leaderboard:update| WSClient
    StaleCron -->|Reset 'judging' >60s| Postgres
```

---

## 🔄 Finite State Machine (FSM) Lifecycle

Arcane models problem attempts using an explicit state machine on `served_problems.outcome`:

```mermaid
stateDiagram-v2
    [*] --> pending: Problem Served
    
    pending --> judging: Submit Attempt (Phase 1 Lock)
    
    judging --> pending: Stale Recovery (>60s stuck)
    judging --> judging: Duplicate Request (Idempotency Cache)

    judging --> accepted: All Tests Pass
    judging --> pending: Wrong + Genuine Hint (Retry Allowed)
    judging --> looped: Wrong + Decoy Hint (Trap Triggered)

    accepted --> [*]: Next Stage Served
    looped --> pending: Alternate Problem Served (Decoy Eliminated)
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

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL, Redis, and Piston)

---

### 2. Start Services via Docker
Start PostgreSQL and Redis:
```bash
docker compose up -d
```

*(Optional for offline/high-concurrency competitions)* Start local Piston:
```bash
docker run -d -p 2000:2000 --name arcane-piston ghcr.io/engineer-man/piston
```

---

### 3. Configure Environment Variables
Copy [.env.example](file:///.env.example) to `.env`:
```bash
cp .env.example .env
```
Ensure your database credentials match your environment:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/arcane_db
REDIS_URL=redis://localhost:6379
PISTON_URL=http://localhost:2000
JWT_SECRET=your-super-secret-key
```

---

### 4. Install Dependencies & Seed Database
```bash
# Install node packages
npm install

# Create the arcane_db database
npm run init-db

# Run Knex schema migrations
npm run migrate

# Seed initial problem sets, stages, and decoy hints
npm run seed
```

---

### 5. Start the Application
- **Development Mode** (auto-restart with Nodemon):
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

---

### 6. Open the Arena
Navigate to [http://localhost:3000](http://localhost:3000) in your browser.
- Click **"Auto-fill Guest"** on the login modal to create an instant contestant.
- Select a hint option from the **Arcane Hint Chain**.
- Write your solution in Python, C++, C, or Java, and hit **Submit Solution**!

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
