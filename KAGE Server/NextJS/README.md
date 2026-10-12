# KAGE backend

> **Status: proposal.** This is an alternative server (Next.js on Vercel + Postgres + an MQTT broker with a
> webhook rule) added next to the SvelteKit one. It does **not** yet speak the KAGE Client's wire format:
> topics, command and state payloads and the `/api/setup` and `/api/client` endpoints differ. The goal of this
> PR is to agree on a direction, after which it would be adapted to the existing client and firmware contract.

Next.js (API + admin portal) on Vercel, Postgres, MQTT broker. The server is the authority; PCs enforce the deadline locally.

```
Chair node --MQTT--> Broker --webhook--> POST /api/ingest --> Postgres
PC service <--MQTT cmd-- Broker <-- publish -- API
PC service --HTTPS--> GET /api/state (resync), POST /api/extend
```

## Setup
1. `cp .env.example .env.local` and fill it in.
2. Apply the schema: `npx drizzle-kit migrate` (SQL is in `drizzle/`).
3. `npm run dev`, then use the admin endpoints to register a PC (returns its token once) and a chair.
4. Broker rule: forward every message on `kage/+/chair/+/state` and `kage/+/chair/+/status` to
   `POST /api/ingest` with header `x-ingest-key: $INGEST_KEY` and body `{ "topic": "...", "payload": ... }`.
5. Simulate a chair: `INGEST_KEY=... npx tsx scripts/simulate.ts chair1 leave`.

Checks: `npm run verify` runs lint, the architecture boundary check, the typecheck and the tests
(state machine and service flows on an in-process Postgres).

## Code structure (modular monolith)
```
src/
  app/api/**        controllers: parse, call a service, return a response
  http/             request plumbing: route() error handling, auth guards, body parsing
  container.ts      composition root: builds every module once (manual constructor injection)
  modules/<name>/
    index.ts          the module's ONLY public surface (interface + factory)
    domain/           pure business rules, no I/O
    application/      services and ports (interfaces)
    infrastructure/   Postgres, MQTT, JWT implementations of those ports
  shared/           config, clock, database helpers (leaf: imports no module)
  testing/          in-memory test harness
```

| Module | Owns | Used by |
|---|---|---|
| devices | PCs, chairs, assignments, per-PC policy, chair readings | actions, identity, admin |
| actions | the state machine, pending actions, extensions, forced actions | admin, routes |
| messaging | publishing commands to the broker | actions |
| audit | the activity log | actions, admin |
| identity | ingest key, PC tokens, admin sessions | admin, routes |
| admin | console use cases (read model over the others) | routes |

Dependencies point one way: `devices`, `audit` and `messaging` depend on no other module,
`identity` uses `devices`, `actions` uses `devices`, `audit` and `messaging`, and `admin` uses the rest.
Services receive their dependencies as interfaces, so tests swap in a fake clock and publisher.

These rules are enforced by `npm run check:boundaries` (dependency-cruiser, config in
`.dependency-cruiser.cjs`): no importing another module's internals, no database or broker
packages outside `infrastructure/`, no domain code importing outer layers, routes only through
the container, no circular imports, and UI code never importing server code.

Adding a feature: put the rule in a module's `domain/`, orchestration in its `application/`,
storage behind a port in `infrastructure/`, expose it from `index.ts`, wire it in `container.ts`,
then add a thin route that calls it.

## Contract
**Topics**
- `kage/{site}/chair/{id}/state`: `{ "occupied": bool, "boot": "<random per boot>", "seq": n }`
- `kage/{site}/chair/{id}/status`: `online` | `offline` (retained + last will). Offline is not treated as absent.
- `kage/{site}/pc/{id}/cmd`: command JSON below, QoS 1.

**Command**
```json
{ "type": "auto_lock", "actionId": 103, "version": 2, "warnAt": "...", "deadline": "...",
  "serverNow": "...", "message": "...", "allowedExtensions": [1, 2, 5] }
```
Types: `auto_lock|auto_logout|cancel_auto_*|force_lock|force_logout|cancel_force_*`.

**Client rules**
- Apply a command only if its `version` is higher than the one held for that `actionId`.
- Compute `offset = serverNow - localNow` and count down on a monotonic timer, not the wall clock.
- Overlay from `warnAt`, run the Windows action at `deadline`. Keep counting if the connection drops.
- On start, every reconnect and every ~30-60 s: `GET /api/state?pc=<id>` (Bearer token). No pending action means cancel the local timer.
- Extensions: `POST /api/extend { pcId, actionId, minutes, requestId }`. Selecting an option adds no time until the returned command arrives. Retrying with the same `requestId` is safe.

## API
| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/ingest` | `x-ingest-key` | chair events from the broker |
| `GET /api/state?pc=` | PC bearer token | resync |
| `POST /api/extend` | PC bearer token | request an extension |
| `POST /api/admin/login` | password | sets the admin cookie |
| `GET /api/admin/overview` | admin | PCs, chairs, pending actions, audit log |
| `POST /api/admin/force` | admin | `{op:"force",pcId,type}` / `{op:"cancel",pcId}` |
| `POST /api/admin/devices` | admin | `register_pc`, `upsert_chair`, `policy` |

