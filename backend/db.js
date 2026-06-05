const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

// Convierte sintaxis MySQL a PostgreSQL automáticamente
function toPg(sql) {
  let i = 0;
  return sql
    // 1) ? → $1, $2, ...
    .replace(/\?/g, () => `$${++i}`)
    // 2) DATE_ADD(x, INTERVAL 1 DAY) → (x + INTERVAL '1 day')
    .replace(/DATE_ADD\(([^,]+),\s*INTERVAL\s+1\s+DAY\)/gi,
      "($1 + INTERVAL '1 day')")
    // 3) DATE_FORMAT(x, '%Y-%m') → TO_CHAR(x, 'YYYY-MM')
    .replace(/DATE_FORMAT\(([^,]+),\s*'%Y-%m'\)/gi,
      "TO_CHAR($1, 'YYYY-MM')")
    // 4) DATE_FORMAT(x, '%Y-%m-%d') → TO_CHAR(x, 'YYYY-MM-DD')
    .replace(/DATE_FORMAT\(([^,]+),\s*'%Y-%m-%d'\)/gi,
      "TO_CHAR($1, 'YYYY-MM-DD')")
    // 5) DATE(x) → x::date
    .replace(/\bDATE\(([^)]+)\)/g, '$1::date')
    // 6) YEARWEEK(x, 1) → ISO year-week number
    .replace(/YEARWEEK\(([^,]+),\s*1\)/gi,
      "(EXTRACT(ISOYEAR FROM $1)::bigint * 100 + EXTRACT(WEEK FROM $1)::bigint)")
    // 7) TIMESTAMPDIFF(HOUR, a, b) → seconds / 3600
    .replace(/TIMESTAMPDIFF\(HOUR,\s*([^,]+),\s*([^)]+)\)/gi,
      "(EXTRACT(EPOCH FROM ($2 - $1)) / 3600)")
    // 8) backticks → double quotes (MySQL identifier quoting)
    .replace(/`([^`]+)`/g, '"$1"')
    // 9) DUAL (MySQL dummy table)
    .replace(/\bFROM\s+DUAL\b/gi, '');
}

// db.query devuelve [rows] igual que mysql2 para compatibilidad
async function query(sql, params) {
  const { rows } = await pool.query(toPg(sql), params || []);
  return [rows];
}

// getConnection devuelve un cliente con la misma API que mysql2
async function getConnection() {
  const client = await pool.connect();
  return {
    query: async (sql, params) => {
      const { rows } = await client.query(toPg(sql), params || []);
      return [rows];
    },
    beginTransaction: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    release: () => client.release(),
  };
}

module.exports = { query, getConnection, pool };
