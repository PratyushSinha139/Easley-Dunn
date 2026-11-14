/**
 * @file health.test.js
 * @description Integration tests for the health-check endpoints.
 *
 * Run with:  npm test
 * /health/db needs a real PostgreSQL database (DATABASE_URL, DB_SCHEMA); CI
 * starts one as a service container (see .github/workflows/ci.yml).
 */

"use strict";

require("dotenv").config();

const request = require("supertest");
const app = require("../../src/app");

describe("GET /health", () => {
  it("should return 200 and server running status", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/running/i);
  });
});

describe("GET /health/db", () => {
  it("should return 200 and database connected", async () => {
    const res = await request(app).get("/health/db");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.database).toBe("connected");
  });
});

describe("Unknown route", () => {
  it("should return 404 for unregistered routes", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
