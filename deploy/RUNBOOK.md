# Cerberus server runbook

For the server admin. Everything here runs on the server, from `/home/seezle/cerberus` (the folder that holds
`docker-compose.yml`), as the Linux user that runs `docker-compose`. Every command uses `docker-compose` (hyphen).

> **Status: not yet run end to end on the server.** Steps marked *(not yet tested)* or *(not yet run)* have not
> been tried anywhere yet.

> **Before production**
>
> While the setup is being tested, the images come from `ghcr.io/pratyushsinha139/cerberus_api` and
> `ghcr.io/pratyushsinha139/cerberus_web`, and the server's ghcr.io login uses a token from that account.
> Before production:
> 1. Both `image:` lines in `docker-compose.yml` must read `ghcr.io/professoreasley/cerberus_api` and
>    `ghcr.io/professoreasley/cerberus_web` (the lines marked `TODO(prod)`).
>    Check: `grep 'image: ghcr.io' docker-compose.yml` → both lines show `professoreasley`.
> 2. The ghcr.io login uses a `read:packages` token from the **professor's** account (section 5). Revoke the
>    testing token afterwards.
> 3. `IMAGE_TAG` in `.env` names a release built from `ProfessorEasley/Cerberus_Gating`.

Contents:
1. Prerequisites
2. Folder layout
3. Server `.env`
4. `secrets/` key folders
5. ghcr.io login
6. `cerberus_edge` network and Caddy
7. First install
8. Deploy a new release
9. Rollback
10. Backup and restore
11. Health checks
12. Logs
13. Common failures
14. Open items

---

## 1. Prerequisites

| Item | Check |
|------|-------|
| Docker and `docker-compose` (Compose v2; the compose file is written for v2) | `docker-compose version` → `v2.x` *(not yet checked on this server)* |
| x86_64 CPU (images are built for `linux/amd64` only) | `uname -m` → `x86_64` *(not yet checked on this server)* |
| The existing Caddy container (shared with DocMost) is running | `docker ps` lists it |
| DNS: `cerberus.easleydunnproductions.com` points at this server | `dig +short cerberus.easleydunnproductions.com` → this server's IP |
| `openssl` installed | `openssl version` |
| A release tag to run, e.g. `v0.1.0` | Listed on the repo's Packages page for both images |
| Key files and settings for the 5 live services | See section 4 |

The beta runs 5 services: Google Play Console, Apple Store Connect, Google Cloud, Google Drive, Discord.

---

## 2. Folder layout

```
/home/seezle/cerberus/
  docker-compose.yml   <- copy of deploy/docker-compose.yml from the repo
  .env                 <- server .env (section 3); never in git
  secrets/<folder>/    <- integration keys, mounted read-only into cerberus_api (section 4)
  backups/             <- database dumps taken before each migration (section 10)
```

`env_file: .env` and `./secrets/...` in the compose file are relative to the compose file, so all of these must
sit next to it.

One-time:

```sh
mkdir -p /home/seezle/cerberus/secrets
mkdir -m 700 /home/seezle/cerberus/backups
```

`backups/` is `700` because dumps contain user data and password hashes.

---

## 3. Server `.env`

Template: `deploy/.env.example` in the repo. Each setting is explained there.

The `.env` is used twice: `docker-compose` reads it to fill in the `${...}` values in `docker-compose.yml`, and
passes it into `cerberus_api` as environment variables.

1. Copy `deploy/.env.example` to `/home/seezle/cerberus/.env`.
2. Fill in:
   - `IMAGE_TAG`: the release to run, e.g. `v0.1.0`. No default: every `docker-compose` command stops without it.
   - `POSTGRES_PASSWORD`: `openssl rand -hex 32`. **Hex, not base64**: the compose file puts the password inside
     `DATABASE_URL`, and characters such as `/` or `#` make it an invalid URL. *(Reproduced with the Postgres URL
     parser only, not in a running container.)*
   - `SESSION_SECRET`: `openssl rand -base64 48`. Changing it later signs everyone out.
   - `PASSWORD_PEPPER`: follow "Create the pepper" below. Do not type a value by hand.
   - Mail settings (`MAIL_SMTP_*`, `MAIL_FROM`).
   - Settings for the 5 live services (Google Play developer ID, Apple key and issuer IDs, Google Drive folder ID,
     Discord bot token, guild ID and invite channel ID).
3. Leave as set in the template: `NODE_ENV=production`, `DB_SCHEMA=cerberus`, `DB_SSL=false`,
   `API_URL=https://cerberus.easleydunnproductions.com/api`,
   `CORS_ORIGINS=https://cerberus.easleydunnproductions.com`, `SESSION_SAMESITE=lax`.
   Optional settings are commented out; their defaults apply.
4. `DATABASE_URL` and `PORT` are **not** in the `.env`: the compose file sets them (`PORT=5000`) and would override
   a value there.

### `PASSWORD_PEPPER`

A secret mixed into every password before it is hashed. **Required**: `cerberus_api` and the first-admin script
refuse to start if it is missing or shorter than 32 characters. Migrations do not need it.

Rules:
- Created **once**, **by hand**, before the first account exists. Nothing in the deploy steps creates or changes it.
- **Never changed** once accounts exist: every stored password stops working, admin included. The only fix is
  to put the original value back.
- It belongs with the **database**: a database backup is only usable for sign-in together with the same pepper.

#### Create the pepper (one time, before First install)

1. Check `.env` has no pepper yet: `grep -c '^PASSWORD_PEPPER=.' .env` → must print `0`.
   If it prints `1`, **stop**: a pepper is already set. Do not replace it.
   The template has an empty `PASSWORD_PEPPER=` line; delete that line first.
2. Append a new one without showing it on screen:
   `printf 'PASSWORD_PEPPER=%s\n' "$(openssl rand -base64 32)" >> .env`
3. Check its length without printing it:
   `awk '/^PASSWORD_PEPPER=/{print length(substr($0,17))}' .env` → exactly one line, `44`.
4. Back it up (next) **before** creating the first admin.

#### Pepper backup

- Keep a copy **outside the server**. Never in git, chat or email. Where, and who holds it: not decided yet
  (section 14).
- Write down (not the value): created date, who holds the copy, which server and database it belongs to.
- Restoring a dump on a new or rebuilt server needs this same value in that server's `.env`.

### Check the compose file *(checked on a developer machine with dummy values and Compose v5.7.0; not yet run on the server)*

After `.env` is filled in:

`docker-compose config --quiet` → prints nothing and exits 0.

With `IMAGE_TAG` empty it fails with `Set IMAGE_TAG in .env to a release tag, e.g. v0.1.0`.
Use `--quiet`: without it the command prints the full file with the database password filled in.
`config` only reads the file; it starts and pulls nothing.

---

## 4. `secrets/` key folders

The compose file mounts each folder read-only into `cerberus_api`. Only the 5 live services get keys.

| Folder in `secrets/` | Service | Contents |
|----------------------|---------|----------|
| `googleplay_json/`   | Google Play Console | service account key, `.json` |
| `apple_key/`         | Apple Store Connect | API key, `.p8` |
| `googlecloud_json/`  | Google Cloud | service account key, `.json` |
| `googledrive_json/`  | Google Drive | service account key, `.json` |
| (none)               | Discord | settings in `.env` only |
| `bigquery_json/`, `firebase_json/`, `googleanalytics_json/` | not live | **must stay empty** |

Why the last three stay empty: those services are not set up in the beta, but some of their API routes still
exist. With a key file in `bigquery_json/` or `firebase_json/`, a direct API call could grant access in the real
tool. With the folders empty, the call fails and nothing is written.

### Check: unused key folders are empty

Before First install and after any change to `secrets/`:

`find secrets/bigquery_json secrets/firebase_json secrets/googleanalytics_json -type f`
→ prints **nothing**. A "No such file or directory" line is also fine: that folder does not exist yet, and Docker
creates it empty when `cerberus_api` starts.

If it prints a file name, move that file off the server, then `docker-compose up -d --force-recreate cerberus_api`.

### Turning on another service

A service is turned on by a new release that adds it to the database (a new migration). Do not add service rows
by hand. Once that release exists: put its key in `secrets/<folder>/` (or its settings in `.env`), then follow
Deploy a new release (section 8).

---

## 5. ghcr.io login

Only needed if the image packages are **private**. Public packages can be pulled without logging in.

Which account (see "Before production" at the top):
- While testing: the `pratyushsinha139` account.
- Production: the professor's account.

Token type: ghcr.io accepts only a **personal access token (classic)**; fine-grained tokens are not supported.
Scope: `read:packages` only.
Sources:
- https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry

1. On the account's GitHub settings: Developer settings → Personal access tokens → Tokens (classic) →
   Generate new token (classic).
2. Tick **only** `read:packages`. Set an expiration date.
3. Write down (not the token itself):

   | Token name | Owner account | Created | Expires | Used on |
   |------------|---------------|---------|---------|---------|
   | `<name>`   | `<account>`   | `<date>`| `<date>`| `/home/seezle/cerberus` server |

4. On the server, as the **same Linux user that runs `docker-compose`** (the login is saved per user):
   `docker login ghcr.io -u <GitHub username>`
   Paste the token at the `Password:` prompt. It is not shown and not saved in shell history.
   Expected: `Login Succeeded`.
5. Check: `docker-compose pull` pulls `cerberus_api` and `cerberus_web` without an error.

Notes:
- Docker keeps the token in that user's `~/.docker/config.json`, not encrypted unless a credential helper is set up.
- A classic `read:packages` token can read **every** package the account can read, not only Cerberus.
- Before it expires: create a new token, run step 4 again, then revoke the old token on GitHub.
  If it does expire, running containers keep running; only `docker-compose pull` fails.

---

## 6. `cerberus_edge` network and Caddy

Caddy notes: `deploy/caddy/README.md`. Site block: `deploy/caddy/Caddyfile.cerberus`.

Routes:
- `https://cerberus.easleydunnproductions.com/api/*` → `cerberus_api:5000`, with `/api` removed (`handle_path`).
  API routes have no `/api` prefix inside the container.
- everything else → `cerberus_web:80`

1. Create the network once: `docker network create cerberus_edge`.
   The compose file declares it `external`, so `docker-compose up` / `run` fail until it exists.
2. Attach the existing Caddy container to it: `docker network connect cerberus_edge <caddy container>`.
   If Caddy is itself started by a compose file, add `cerberus_edge` there instead; a `docker network connect`
   is lost when that container is re-created.
3. Merge `deploy/caddy/Caddyfile.cerberus` into `/home/seezle/Caddyfile`, then validate and reload Caddy the way
   it is done for DocMost.
4. Caddy gets the HTTPS certificate by itself once DNS points at the server.
5. Cerberus must **not** be on `seezle_default` (DocMost's database is on it).

Ports in the Caddyfile must match the compose file: API `5000`, web `80`.

---

## 7. First install

Before starting:
- Sections 2–6 done.
- `PASSWORD_PEPPER` and `SESSION_SECRET` set in `.env`, and the pepper backed up (section 3).
  `cerberus_api` does not start without either, and the admin's password hash uses the pepper.
- Unused key folders are empty (section 4).

Steps:

1. `docker-compose pull`
2. `docker-compose up -d cerberus_db`, then wait until `docker-compose ps` shows it `healthy`.
3. Create the schema and tables:
   `docker-compose run --rm cerberus_api npm run migrate -- up --create-schema`
   (`--create-schema` creates the `cerberus` schema; only needed this first time). Nothing to back up yet.
4. Create the first admin (below).
5. `docker-compose up -d`
6. Health checks (section 11), including the services check.
7. The professor signs in over HTTPS and changes the temporary password.

### Create the first admin

Creates the **one** initial ADMIN account. There is no default password. The account must change its password
at first sign-in.

Do not put `INITIAL_ADMIN_PASSWORD` in `.env`: it would stay on disk after this one-time run.

1. Read the password without echoing it (type it, press Enter; nothing is shown). 12+ characters:
   `read -rs INITIAL_ADMIN_PASSWORD && export INITIAL_ADMIN_PASSWORD`
2. Run:
   ```sh
   docker-compose run --rm \
     -e INITIAL_ADMIN_EMAIL=<professor's email> \
     -e INITIAL_ADMIN_PASSWORD \
     cerberus_api npm run seed:admin
   ```
   `-e INITIAL_ADMIN_PASSWORD` with no `=value` copies it from the shell, so the password is not on the command
   line or in shell history. The rest (`DATABASE_URL`, `DB_SCHEMA`, `PASSWORD_PEPPER`) comes from `.env`.
   Optional: `-e INITIAL_ADMIN_FIRST=…` / `-e INITIAL_ADMIN_LAST=…` (defaults `System` / `Admin`).
3. `unset INITIAL_ADMIN_PASSWORD`
4. Expected output ends with:
   `Provisioned initial ADMIN user (user_id: …, email: …, name: System Admin).`
5. Check:
   ```sh
   docker-compose exec cerberus_db psql -U cerberus_app -d cerberus \
     -c "SELECT email, \"Role\", requires_password_change FROM cerberus.users WHERE \"Role\" = 'ADMIN';"
   ```
   → exactly one row, `requires_password_change = t`.
6. Give the professor the temporary password over a private channel.

(Use your `POSTGRES_USER` / `POSTGRES_DB` values in `psql` commands if `.env` overrides the defaults
`cerberus_app` / `cerberus`.)

---

## 8. Deploy a new release

Order: back up → migrate → start. Migrations run **before** the new version starts, so a failed migration leaves
the running version untouched. All pending migrations run in **one** transaction: if any of them fails, all of them
are rolled back and the schema stays as it was.

1. Note the running tag, for rollback: `grep IMAGE_TAG .env`
2. Set the new `IMAGE_TAG=v0.x.y` in `.env`.
3. `docker-compose pull`
4. Backup (section 10).
5. `docker-compose up -d cerberus_db` (no change if it is already running; makes sure the database is up before
   the migration).
6. `docker-compose run --rm cerberus_api npm run migrate -- up`
   **If this fails, stop here.** Nothing was changed and the old version is still running. Set `IMAGE_TAG` back to
   the old value in `.env` and read the error.
7. `docker-compose up -d` (re-creates `cerberus_api` and `cerberus_web` on the new tag).
8. Health checks (section 11). If the web image changed, hard-refresh the browser.

---

## 9. Rollback

1. Set `IMAGE_TAG` back to the previous tag in `.env`.
2. `docker-compose pull` (no download if the old images are still on the server).
3. `docker-compose up -d`
4. Health checks (section 11).

This does **not** undo migrations: the older version runs against the newer schema. That works as long as the
release's migrations only added things.

If the schema itself must go back, restore the backup taken before the migration (section 10). Do not use
`migrate down`: it reverts only the last migration, and some migrations have no undo step.

---

## 10. Backup and restore

### Backup (before every migration)

With `cerberus_db` running:

```sh
umask 077
docker-compose exec -T cerberus_db \
  pg_dump -U cerberus_app -d cerberus -n cerberus \
  > backups/cerberus-$(date +%F-%H%M).sql
```

- `-T`: no terminal, needed when the output goes to a file.
- `-n cerberus`: only the app's schema. All app tables live there, including sessions and the migrations record.
- Check: the file is not empty and its last lines include `PostgreSQL database dump complete`.
- A dump is only usable for sign-in together with the **same** `PASSWORD_PEPPER`. The pepper is not in the dump;
  it is backed up separately (section 3).

### Restore *(not yet tested; test on a scratch database before relying on it)*

```sh
docker-compose stop cerberus_api
docker-compose exec -T cerberus_db psql -U cerberus_app -d cerberus -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA cerberus CASCADE;'
docker-compose exec -T cerberus_db psql -U cerberus_app -d cerberus -v ON_ERROR_STOP=1 \
  < backups/<file>.sql
```

Then set the previous `IMAGE_TAG` and run Rollback steps 2–4 (section 9). Anything written after the backup
(new users, grants, audit entries) is lost.

---

## 11. Health checks

Through Caddy:

| Command | Expected |
|---------|----------|
| `curl -sS https://cerberus.easleydunnproductions.com/` | the UI's HTML |
| `curl -sS https://cerberus.easleydunnproductions.com/api/health` | JSON with `"success":true`, `"message":"Server is running"` |
| `curl -sS https://cerberus.easleydunnproductions.com/api/health/db` | JSON with `"success":true`, `"database":"connected"` |

On the server:
- `docker-compose ps`: all three up, `cerberus_db` healthy.
- `docker-compose logs --tail=100 cerberus_api`: no errors.

### Services check (after First install)

```sh
docker-compose exec cerberus_db psql -U cerberus_app -d cerberus \
  -c "SELECT service_code, is_active, is_automate FROM cerberus.services ORDER BY service_code;"
```

Expected: 5 rows, all `is_active = t`, `is_automate = t`:
`APPLE_STORE_CONNECT`, `DISCORD`, `GOOGLE_CLOUD`, `GOOGLE_DRIVE`, `GOOGLE_PLAY_CONSOLE`.

---

## 12. Logs

Console output:
- `docker-compose logs --tail=200 cerberus_api` (or `cerberus_db`, `cerberus_web`).
- Docker keeps each container's console output in files of up to 10 MB, 3 files per container (set in the compose
  file), so about 30 MB per container at most.
- A startup failure (e.g. missing pepper) shows here, not in the API's log files below.

API log files: `cerberus_api` also writes `logs/error.log` and `logs/combined.log` (in the `cerberus_api_logs`
volume). Each rolls over at 10 MB and 3 files are kept per log, so about 60 MB at most:

| File         | Contents                              |
|--------------|---------------------------------------|
| `error.log`  | newest entries (always written to)    |
| `error1.log` | previous 10 MB                        |
| `error2.log` | oldest; replaced at the next rollover |

Same for `combined.log`. *(Rollover not yet tested in a running container.)*

- `docker-compose exec cerberus_api ls -l logs/`
- `docker-compose exec cerberus_api tail -n 100 logs/error.log`

---

## 13. Common failures

| Symptom | Cause / fix |
|---------|-------------|
| Any `docker-compose` command: `Set IMAGE_TAG in .env to a release tag, e.g. v0.1.0` | `IMAGE_TAG` empty or missing in `.env` |
| `docker-compose`: external network `cerberus_edge` not found | `docker network create cerberus_edge` (section 6) |
| `docker-compose pull`: denied / unauthorized | Packages are private and the login is missing, expired, revoked, made as another Linux user, or from an account that cannot read these packages. Redo section 5 step 4 |
| `docker-compose pull`: tag not found / manifest unknown | `IMAGE_TAG` has no release (typo, or the release build failed). Check the repo's Packages page |
| `cerberus_api` keeps restarting; logs show `PASSWORD_PEPPER must be set to a random string of at least 32 characters.` | Missing, empty or short in `.env`. If the database has accounts: put back the **original** value from the backup. Only on a database with no accounts: create one (section 3). Then `docker-compose up -d --force-recreate cerberus_api` |
| Same, with `SESSION_SECRET` | Set it in `.env` (`openssl rand -base64 48`). A new value only signs everyone out. Then recreate `cerberus_api` as above |
| Everyone's sign-in fails as a wrong password after a deploy, restore or `.env` edit | The pepper differs from the one the hashes were made with. Put the original value back, then recreate `cerberus_api` as above |
| `migrate` or `/api/health/db` fails with `Invalid URL` | `POSTGRES_PASSWORD` has characters not allowed in a URL. Use a hex value. On a database that already exists, the password is also stored inside `cerberus_db`: changing only `.env` is not enough |
| `migrate`: `relation "…" already exists` | The `cerberus` schema has tables that were not created by migrations. First install needs an empty database |
| `seed:admin`: `INITIAL_ADMIN_PASSWORD is required. There is no default password.` | Not exported, or `-e INITIAL_ADMIN_PASSWORD` left out. Redo "Create the first admin" steps 1–2 |
| `seed:admin`: `INITIAL_ADMIN_EMAIL is required.` / `… must be at least 12 characters long.` | Email not passed / password too short |
| `seed:admin`: `Aborting: an ADMIN user already exists …` (exit code 0) | Not an error; nothing written. The script only creates the first admin |
| `seed:admin`: `relation "users" does not exist` | Migrations not run, or `DB_SCHEMA` is not `cerberus` in `.env` |
| `/api/...` returns 404 from the API | Caddy is not stripping `/api` (`handle_path`) |
| Caddy returns 502 | Caddy not on `cerberus_edge`, or `cerberus_api` / `cerberus_web` not running |
| `/api/health` OK, `/api/health/db` fails | `cerberus_db` down, wrong `POSTGRES_PASSWORD`, or `DB_SSL` not `false` |
| Services check shows more than 5 rows | Rows added by hand. Do not delete rows that have access records; raise it first |
| A direct call to `/bigquery` or `/firebase` returns `No credentials file or project_id found inside …_json folder.` | Expected: the folder is empty on purpose (section 4) |

---

## 14. Open items

- This runbook has not been run end to end on the server.
- Check on the server: `docker-compose version` (v2) and CPU architecture (`x86_64`).
- Caddy container name and reload command are host-specific; fill in once known.
- Package visibility after the first release: public packages need no ghcr.io login.
- Record the token's expiry date once it is created.
- Restore procedure is untested.
- Backups are only taken by hand before a deploy; a nightly schedule is not decided.
- Where the pepper backup is kept, and who holds it: not decided.
- No recovery if the pepper is lost: every user would need a new password, and `seed:admin` refuses to run once
  an ADMIN exists.
- API log file rollover not yet tested in a running container.
- The `Invalid URL` failure was reproduced with the URL parser only, not in a running container.
- `chmod 600 .env` (the file holds every secret): agreed, deferred until after the beta is working.
- Mail settings stay empty until the mail provider is set up.
