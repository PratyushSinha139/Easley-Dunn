/**
 * @file seed-initial-admin.js
 * @description Provisions the single initial ADMIN user for a fresh database.
 *
 * Run on the server (from the directory holding docker-compose.yml):
 *   read -rs INITIAL_ADMIN_PASSWORD && export INITIAL_ADMIN_PASSWORD
 *   docker-compose run --rm \
 *     -e INITIAL_ADMIN_EMAIL=professor@example.edu \
 *     -e INITIAL_ADMIN_PASSWORD \
 *     cerberus_api npm run seed:admin
 *
 * `-e INITIAL_ADMIN_PASSWORD` with no value passes it through from the shell,
 * so the password stays out of the command line and shell history.
 *
 * Environment variables:
 *   INITIAL_ADMIN_EMAIL     required
 *   INITIAL_ADMIN_PASSWORD  required, at least MIN_PASSWORD_LENGTH characters
 *   INITIAL_ADMIN_FIRST     optional, defaults to "System"
 *   INITIAL_ADMIN_LAST      optional, defaults to "Admin"
 *
 * Exits with an error before connecting to the database if a required
 * variable is missing or the password is too short.
 *
 * The admin is created with requires_password_change = true, so the app
 * forces a new password at first sign-in.
 *
 * Refuses to insert if any user with Role = 'ADMIN' already exists.
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const bcrypt = require("bcryptjs");
const { getPool } = require("../src/db/database");
const appConfig = require("../src/config/app.config");
const dbConfig = require("../src/config/db.config");

const BCRYPT_COST = 12;
// Same minimum the app enforces (passwordAuth.controller.js, roles.controller.js).
const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "";
  const firstName = (process.env.INITIAL_ADMIN_FIRST || "System").trim();
  const lastName = (process.env.INITIAL_ADMIN_LAST || "Admin").trim();

  // Validate before getPool(): nothing touches the database on bad input.
  if (!email) {
    throw new Error("INITIAL_ADMIN_EMAIL is required.");
  }
  if (!password) {
    throw new Error("INITIAL_ADMIN_PASSWORD is required. There is no default password.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `INITIAL_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    );
  }

  const pool = getPool();

  try {
    console.log(`Checking schema "${dbConfig.schema}" for an existing ADMIN user...`);

    const existingAdmin = await pool.query(
      `SELECT user_id, email
       FROM users
       WHERE "Role" = 'ADMIN'
       LIMIT 1`
    );

    if (existingAdmin.rows.length > 0) {
      const admin = existingAdmin.rows[0];
      console.log(
        `Aborting: an ADMIN user already exists (user_id: ${admin.user_id}, email: ${admin.email}). Only one initial admin can be provisioned.`
      );
      return;
    }

    const existingEmail = await pool.query(
      `SELECT user_id, email, "Role"
       FROM users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email]
    );

    if (existingEmail.rows.length > 0) {
      const existing = existingEmail.rows[0];
      throw new Error(
        `Cannot provision admin: a user with email "${existing.email}" already exists with Role "${existing.Role}".`
      );
    }

    const passwordHash = await bcrypt.hash(password + appConfig.passwordPepper, BCRYPT_COST);

    const { rows } = await pool.query(
      `INSERT INTO users (
         email,
         first_name,
         last_name,
         "Role",
         is_active,
         password_hash,
         requires_password_change,
         start_date
       )
       VALUES ($1, $2, $3, 'ADMIN', true, $4, true, CURRENT_DATE)
       RETURNING user_id, email, first_name, last_name, "Role", is_active, start_date`,
      [email, firstName, lastName, passwordHash]
    );

    const created = rows[0];
    console.log(
      `Provisioned initial ADMIN user (user_id: ${created.user_id}, email: ${created.email}, name: ${created.first_name} ${created.last_name}).`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`\nAdmin seeding failed: ${err.message}`);
  process.exit(1);
});

