# Cerberus server runbook

For the server admin. Everything here runs on the server, from `/home/seezle/cerberus` (the folder that holds
`docker-compose.yml`), as the Linux user that runs `docker-compose`. Every command uses `docker-compose` (hyphen).

Contents:
1. Prerequisites
2. Folder layout
3. Server `.env`
4. `secrets/` key folders
5. ghcr.io login
6. `cerberus_edge` network and Caddy
7. First install
8. Deploy a new release
9. Health checks

---

## 1. Prerequisites

| Requirement | Check | Expected | If not met |
|-------------|-------|----------|-----------------|
| x86_64 CPU | `uname -m` | `x86_64` | `aarch64` / `arm64`: the images will not start, because they are built for `linux/amd64` only. Stop: the release needs an ARM build |
| DNS points at this server | `dig +short cerberus.easleydunnproductions.com` | this server's IP | Caddy cannot get the HTTPS certificate. The DNS record needs adding first |
| `openssl` installed | `openssl version` | a version line | Install it. It is used to create the secrets (section 3) and the first admin password (section 7) |
| The release tag to deploy, e.g. `v0.1.0` | Provided by the team lead | — | Ask the team lead for it |
| Key files and settings for the 5 live services | Section 4 | All present | That service will not work. Ask the team lead for them before First install |

The beta runs 5 services: Google Play Console, Apple Store Connect, Google Cloud, Google Drive, Discord.

---

## 2. Folder layout

```
/home/seezle/cerberus/
  docker-compose.yml   <- copy of deploy/docker-compose.yml from the repo
  .env                 <- server .env (section 3); never in git
  secrets/<folder>/    <- integration keys, mounted read-only into cerberus_api (section 4)
```

`env_file: .env` and `./secrets/...` in the compose file are relative to the compose file, so all of these must
sit next to it. If they are somewhere else:

- no `.env` next to `docker-compose.yml`: every `docker-compose` command fails.
- no `secrets/<folder>`: Docker creates it empty, and that service starts with no key.

---

## 3. Server `.env`

Template: `deploy/.env.example` in the repo. Each setting is explained there.

The `.env` is used twice: `docker-compose` reads it to fill in the `${...}` values in `docker-compose.yml`, and
passes it into `cerberus_api` as environment variables.

1. Copy `deploy/.env.example` to `/home/seezle/cerberus/.env`.
2. Fill in:

   | Setting | Provided by | Notes |
   |---------|-------------|-------|
   | `IMAGE_TAG` | team lead | The release to run, e.g. `v0.1.0`. No default: every `docker-compose` command stops without it |
   | `POSTGRES_PASSWORD`, `SESSION_SECRET`, `PASSWORD_PEPPER` | server admin, generated on the server | See "Create the secrets" below. Never typed by hand or copied from another environment |
   | `MAIL_SMTP_HOSTNAME`, `MAIL_SMTP_PORT`, `MAIL_SMTP_USERNAME`, `MAIL_SMTP_PASSWORD`, `MAIL_FROM` | server admin | The app's emails, e.g. account invites |
   | Google Play, Apple, Google Drive and Discord settings | team lead | Names as in the template |

3. Every other setting already has its production value in the template. Keep each of those lines in `.env`
   exactly as it is: same variable, same value. Commented-out settings use their defaults.
4. Do **not** add `DATABASE_URL` or `PORT` to `.env`: the compose file sets them and would override a value there.

### Create the secrets (one time, before First install)

> **Create these once. Never create them again on a running system.**
>
> - `PASSWORD_PEPPER`: mixed into every password before it is hashed. A new value makes **every** stored password stop working, admin included. The only fix is to put the original value back.
> - `POSTGRES_PASSWORD`: the database keeps the password it was first created with. A new value in `.env` does not change it, so `cerberus_api` can no longer connect.
> - `SESSION_SECRET`: a new value signs everyone out.
>
> If step 1 below shows any of them already set, **stop**. Do not replace it.

From `/home/seezle/cerberus`. Each value is written straight into `.env` and never shown on screen.

1. Check none is set yet:
   `grep -cE '^(POSTGRES_PASSWORD|SESSION_SECRET|PASSWORD_PEPPER)=.' .env` → must print `0`.
2. The template has empty `POSTGRES_PASSWORD=`, `SESSION_SECRET=` and `PASSWORD_PEPPER=` lines: delete those three lines from `.env`.
3. Append the new values:

   ```sh
   printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)" >> .env
   printf 'SESSION_SECRET=%s\n' "$(openssl rand -base64 48)" >> .env
   printf 'PASSWORD_PEPPER=%s\n' "$(openssl rand -base64 32)" >> .env
   ```

4. Check their lengths without printing them:
   `awk -F= '/^(POSTGRES_PASSWORD|SESSION_SECRET|PASSWORD_PEPPER)=/{print $1, length($0)-length($1)-1}' .env`
   → exactly three lines: `POSTGRES_PASSWORD 64`, `SESSION_SECRET 64`, `PASSWORD_PEPPER 44`.
5. Back them up (next) **before** First install.

### Back up the secrets

| Secret | Back up? | Why |
|--------|----------|-----|
| `PASSWORD_PEPPER` | **Yes** | A database backup is only usable for sign-in together with the same pepper. The pepper should not in the dump |
| `POSTGRES_PASSWORD` | **Yes** | Needed to reconnect to the existing database if `.env` is lost |
| `SESSION_SECRET` | No | If lost, create a new one; that only signs everyone out |

- Keep the copies **outside the server**. Never in git, chat or email.
- Write down (not the values): created date, where the copies are kept, which server and database they belong to.
- Restoring a database dump on a new or rebuilt server needs these same values in that server's `.env`.

---

## 4. `secrets/` key folders

The compose file mounts each folder read-only into `cerberus_api`.

| Folder in `secrets/` | Service |
|----------------------|---------|
| `googleplay_json/`   | Google Play Console |
| `apple_key/`         | Apple Store Connect |
| `googlecloud_json/`  | Google Cloud |
| `googledrive_json/`  | Google Drive |

---

## 5. ghcr.io login

The professor provides a GitHub token for this (read access to the images only).

1. On the server, as the **same Linux user that runs `docker-compose`** (the login is saved per user):
   `docker login ghcr.io -u <professor's GitHub username>`
2. Paste the token at the `Password:` prompt. Expected: `Login Succeeded`.

Notes:
- Docker keeps the token in that user's `~/.docker/config.json`, not encrypted.
- When the professor provides a new token: run step 1 again.
- If the token expires, running containers keep running; only `docker-compose pull` fails.

---

## 6. `cerberus_edge` network and Caddy

Cerberus needs a Docker network named `cerberus_edge`, with the Caddy container, `cerberus_api` and `cerberus_web` on it. The compose file expects this network to exist already; creating it and connecting Caddy to it is up to the server admin.

Then add the site block from `deploy/caddy/Caddyfile.cerberus` to the host Caddyfile and reload Caddy.

---

## 7. First install

Before starting: sections 1–6 done.

1. Download the images: `docker-compose pull`
2. Start the database: `docker-compose up -d cerberus_db`. Wait until `docker-compose ps` shows it as healthy.
3. Create the database schema and tables:
   `docker-compose run --rm cerberus_api npm run migrate -- up --create-schema`

   **--create-schema** is only needed this first time. The command lists the migrations it runs and finishes without an error.
4. Create the first admin account (below).
5. Start everything: `docker-compose up -d`
6. Health checks (section 9).
7. The professor signs in and sets a new password.

### Create the first admin

Creates the one initial ADMIN account, for the professor, with a random temporary password. Admin will be prompted to change their password on first sign-in.

Do not put `INITIAL_ADMIN_PASSWORD` in `.env`: it would stay on disk after this one-time run.

1. Generate the temporary password (the value is not saved in shell history):
   `export INITIAL_ADMIN_PASSWORD="$(openssl rand -hex 12)"`
2. Create the account:
   ```sh
   docker-compose run --rm \
     -e INITIAL_ADMIN_EMAIL=<Initial Admin's email> \
     -e INITIAL_ADMIN_FIRST=<Initial Admin's first name> \
     -e INITIAL_ADMIN_LAST=<Initial Admin's last name> \
     -e INITIAL_ADMIN_PASSWORD \
     cerberus_api npm run seed:admin
   ```
   `-e INITIAL_ADMIN_PASSWORD` with no value takes it from the shell, so the password is not on the command line or in shell history.
   The output confirms that the admin account was created.
3. Show the password once, to pass it on: `echo "$INITIAL_ADMIN_PASSWORD"`
4. Remove it from the shell: `unset INITIAL_ADMIN_PASSWORD`
5. Give the professor the temporary password over a private channel.

---

## 8. Deploy a new release

Order: back up → migrate → start. If the migration fails, nothing changes: all pending migrations are rolled back together and the old version keeps running.

1. Note the running tag: `grep IMAGE_TAG .env`
2. Set the new `IMAGE_TAG=v0.x.y` in `.env`.
3. `docker-compose pull`
4. Make sure a current backup of the database exists.
5. `docker-compose up -d cerberus_db` (no change if it is already running; makes sure the database is up before
   the migration).
6. `docker-compose run --rm cerberus_api npm run migrate -- up`
   Finishes without an error. A release with no new migrations reports that there is nothing to run.
   **If this fails, stop here.** Nothing was changed and the old version is still running. Set `IMAGE_TAG` back to
   the old value in `.env` and read the error.
7. `docker-compose up -d` (re-creates `cerberus_api` and `cerberus_web` on the new tag).
8. Health checks (section 9).

---

## 9. Health checks

- `docker-compose ps`: all three up, `cerberus_db` healthy.
- `docker-compose logs --tail=100 cerberus_api`: no errors.

