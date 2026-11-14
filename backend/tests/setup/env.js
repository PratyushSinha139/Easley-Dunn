// Fake values so the test suite runs anywhere without a .env. Never used outside tests.
process.env.SESSION_SECRET ??= "test-only-session-secret-0123456789abcdef";
process.env.PASSWORD_PEPPER ??= "test-only-password-pepper-0123456789abcdef";
