/**
 * @file config.js
 * @description Frontend settings shared by every module.
 *
 * Values come from REACT_APP_* variables, which are baked into the build:
 * changing them on the server does nothing until the frontend is rebuilt.
 */

/** Where the browser reaches the backend. Falls back to the backend's default local port. */
export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
