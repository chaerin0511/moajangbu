// libsql in-memory DB for tests. Must run before any module imports lib/db.
process.env.TURSO_DATABASE_URL = 'file::memory:?cache=shared';
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.SKIP_DB_INIT;
