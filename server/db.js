const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'bao_cao_an_ca.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency & performance
db.pragma('journal_mode = WAL');

// Initialize database schema
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      url TEXT,
      pagination TEXT,
      scraped_at TEXT,
      total_rows INTEGER DEFAULT 0,
      total_kpis INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kpi_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      label TEXT,
      value TEXT,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS voucher_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      campaign_name TEXT,
      voucher_code TEXT,
      booth_area TEXT,
      lot_code TEXT,
      booth_code TEXT,
      booth_name TEXT,
      store_status TEXT,
      voucher_status TEXT,
      remaining_hours TEXT,
      use_date TEXT,
      use_time TEXT,
      vgid TEXT,
      staff_code TEXT,
      issue_date TEXT,
      expiry_date TEXT,
      voucher_value TEXT,
      pnl TEXT,
      user_topup TEXT,
      max_usage TEXT,
      usage_count TEXT,
      raw_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS report_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      table_index INTEGER,
      headers_json TEXT,
      rows_json TEXT,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );
  `);

  console.log('[SQLite DB] Database initialized at:', dbPath);
}

initDatabase();

module.exports = db;
