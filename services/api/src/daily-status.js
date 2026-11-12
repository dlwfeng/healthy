import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
let initialized;

export function validDate(input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input || "")) return false;
  const time = new Date(`${input}T12:00:00Z`);
  return !Number.isNaN(time.getTime()) && time.toISOString().slice(0, 10) === input;
}

export function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function ready() {
  if (!process.env.DATABASE_URL) throw new Error("Database not configured");
  initialized ??= pool.query(`
    CREATE TABLE IF NOT EXISTS daily_status_entries (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entry_date DATE NOT NULL,
      content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `).catch((error) => { initialized = undefined; throw error; });
  await initialized;
}

export const dailyStatusStore = {
  async listForReport(startDate, endDate) {
    await ready();
    const { rows } = await pool.query(
      'SELECT id::text, entry_date::text AS date, content, created_at FROM daily_status_entries WHERE entry_date BETWEEN $1 AND $2 ORDER BY entry_date, id',
      [startDate, endDate],
    );
    return rows;
  },
  async add(date, content) {
    await ready();
    const { rows } = await pool.query(
      "INSERT INTO daily_status_entries (entry_date, content) VALUES ($1, $2) RETURNING id::text, entry_date::text AS date, content, created_at",
      [date, content],
    );
    return rows[0];
  },
  async list(startDate, endDate) {
    await ready();
    const { rows } = await pool.query(
      "SELECT id::text, entry_date::text AS date, content, created_at FROM daily_status_entries WHERE entry_date BETWEEN $1 AND $2 ORDER BY entry_date DESC, id DESC LIMIT 200",
      [startDate, endDate],
    );
    return rows;
  },
};
