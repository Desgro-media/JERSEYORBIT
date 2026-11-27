/* PostgreSQL connection pool and transaction helper. */
import pg from 'pg';

// int8 arrives as a string by default. Every id and count here is far below 2^53, so a number is exact.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export function createDb(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  // a dropped idle connection must not crash the process
  pool.on('error', (err) => console.error('Database connection error:', err.message));

  return {
    pool,
    query: (text, params) => pool.query(text, params),
    /** run fn(client) inside one transaction */
    async tx(fn) {
      const client = await pool.connect();
      let broken;
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch((e) => (broken = e));
        throw err;
      } finally {
        client.release(broken);
      }
    },
    close: () => pool.end(),
  };
}
