/**
 * @file logger.js
 * @description Centralised Winston logger.
 *
 * - Console output with colours in development.
 * - JSON log files in production (logs/combined.log, logs/error.log).
 *   Each file is size-limited: it rolls over at 10 MB and at most 3 files are
 *   kept (error.log, error1.log, error2.log), matching the Docker log limits
 *   in deploy/docker-compose.yml. tailable keeps the newest entries in the
 *   unnumbered file.
 */

"use strict";

const { createLogger, format, transports } = require("winston");
const path = require("path");

const { combine, timestamp, colorize, printf, json, errors } = format;

const isDev = (process.env.NODE_ENV || "development") === "development";

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `[${timestamp}] ${level}: ${message}\n${stack}`
      : `[${timestamp}] ${level}: ${message}`
  )
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

// winston 3.x File transport options (lib/winston/transports/file.js).
const fileLimits = {
  maxsize: 10 * 1024 * 1024, // bytes
  maxFiles: 3,
  tailable: true,
};

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),
    ...(isDev
      ? []
      : [
          new transports.File({
            filename: path.join("logs", "error.log"),
            level: "error",
            ...fileLimits,
          }),
          new transports.File({
            filename: path.join("logs", "combined.log"),
            ...fileLimits,
          }),
        ]),
  ],
  exitOnError: false,
});

module.exports = logger;
