# Cerberus

Access management for the Easley-Dunn lab. Cerberus is one place to invite people, assign them to teams, and grant or revoke their access to third-party services, with every change recorded in an audit log.

## What it does

- **Accounts by invite.** An admin adds a person and Cerberus emails them a link to set their password. Sign-in uses email and password, with server-side sessions.
- **Three roles.** `ADMIN` (full control), `LEAD` (grants access to their own team's members), `USER` (sees their own access).
- **Teams.** People are grouped into teams, each with a lead.
- **Service access.** Grant and revoke access to third-party services from the console. A person cannot be deactivated while they still hold access to any service.
- **Audit log.** Every grant and revoke is recorded and viewable in the console.

### Services

Enabled for the beta:

- Google Play Console
- Google Drive
- Apple App Store Connect
- Google Cloud
- Discord

Connector code exists but is not enabled: BigQuery, Google Analytics, Firebase, Kanboard.

## Tech stack

- **Frontend:** React, Tailwind CSS
- **Backend:** Node.js, Express
- **Database:** PostgreSQL, schema managed with migrations (`backend/migrations/`)
- **Deployment:** Docker Compose behind Caddy (`deploy/`)

## Running it locally

You need Node.js 18 or newer and a PostgreSQL database.

1. **Install dependencies** from the repo root:

   ```bash
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   ```

2. **Create the two `.env` files.** Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill them in. Every setting is explained in those files.

3. **Create the database tables** (from `backend/`):

   ```bash
   npm run migrate -- up --create-schema
   ```

4. **Create local test accounts**, one per role (from `backend/`):

   ```bash
   npm run seed:dev
   ```

5. **Start a local mail inbox** so invite and reset emails can be read (from `backend/`, in its own terminal). The inbox opens at `http://localhost:1080`.

   ```bash
   npm run maildev
   ```

6. **Start the app** from the repo root:

   ```bash
   npm run dev
   ```

   The frontend runs at `http://localhost:3000` and the backend at `http://localhost:5000`. API docs are at `http://localhost:5000/docs`.

## Tests

```bash
npm test --prefix backend
```

## Repository layout

```text
backend/    Express API, migrations, scripts, tests
frontend/   React console
deploy/     Docker Compose, Caddy config, server runbook
docs/       Integration guides
```

## More documentation

- [Server runbook](deploy/RUNBOOK.md): deploying and operating Cerberus on the server
- [Documentation index](docs/README.md): per-service integration guides
