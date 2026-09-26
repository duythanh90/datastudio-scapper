const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const ExcelJS = require('exceljs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Create HTTP Server & attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`[Socket.IO] 🔌 Chrome Extension connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] ❌ Chrome Extension disconnected: ${socket.id}`);
  });

  socket.on('extension_status', (data) => {
    console.log(`[Socket.IO Status from ${socket.id}]:`, data);
  });

  // Direct socket event to receive & save report data
  socket.on('save_scraped_data', (data, callback) => {
    try {
      const reportId = saveReportToDb(data);
      console.log(`[Socket.IO Data] Saved report #${reportId}`);
      if (typeof callback === 'function') {
        callback({ success: true, reportId });
      }
    } catch (err) {
      console.error('[Socket.IO Data Error]:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });
});

// Helper function to execute SQLite transaction for report insertion
function saveReportToDb(data) {
  const { title, url, pagination, scrapedAt, scorecards = [], tables = [] } = data;
  let totalRows = 0;
  tables.forEach(t => {
    totalRows += (t.rows ? t.rows.length : 0);
  });

  const insertReportTransaction = db.transaction(() => {
    const stmtReport = db.prepare(`
      INSERT INTO reports (title, url, pagination, scraped_at, total_rows, total_kpis)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmtReport.run(title || 'Looker Studio Report', url || '', pagination || '', scrapedAt || '', totalRows, scorecards.length);
    const reportId = info.lastInsertRowid;

    // Insert KPI Metrics
    if (scorecards.length > 0) {
      const stmtKpi = db.prepare(`
        INSERT INTO kpi_metrics (report_id, label, value) VALUES (?, ?, ?)
      `);
      scorecards.forEach(kpi => {
        stmtKpi.run(reportId, kpi.label, kpi.value);
      });
    }

    // Insert Raw Table Structure
    const stmtTable = db.prepare(`
      INSERT INTO report_tables (report_id, table_index, headers_json, rows_json)
      VALUES (?, ?, ?, ?)
    `);
    tables.forEach(tbl => {
      stmtTable.run(reportId, tbl.tableIndex || 1, JSON.stringify(tbl.headers || []), JSON.stringify(tbl.rows || []));
    });

    // Insert Voucher Records
    const stmtVoucher = db.prepare(`
      INSERT INTO voucher_records (
        report_id, campaign_name, voucher_code, booth_area, lot_code,
        booth_code, booth_name, store_status, voucher_status, remaining_hours,
        use_date, use_time, vgid, staff_code, issue_date,
        expiry_date, voucher_value, pnl, user_topup, max_usage, usage_count, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    tables.forEach(tbl => {
      if (tbl.rows) {
        tbl.rows.forEach(row => {
          stmtVoucher.run(
            reportId,
            row[0] || '', row[1] || '', row[2] || '', row[3] || '',
            row[4] || '', row[5] || '', row[6] || '', row[7] || '',
            row[8] || '', row[9] || '', row[10] || '', row[11] || '',
            row[12] || '', row[13] || '', row[14] || '', row[15] || '',
            row[16] || '', row[17] || '', row[18] || '', row[19] || '',
            JSON.stringify(row)
          );
        });
      }
    });

    return reportId;
  });

  return insertReportTransaction();
}

// 1. POST /api/reports - Save scraped report data to SQLite DB
app.post('/api/reports', (req, res) => {
  try {
    const reportId = saveReportToDb(req.body);
    const totalRows = (req.body.tables || []).reduce((acc, t) => acc + (t.rows ? t.rows.length : 0), 0);
    
    // Broadcast notification to all connected socket clients
    io.emit('REPORT_SAVED', { reportId, totalRows, title: req.body.title });

    res.json({
      success: true,
      message: 'Đã lưu báo cáo vào SQLite CSDL thành công!',
      reportId,
      totalRowsInserted: totalRows,
      totalKpisInserted: (req.body.scorecards || []).length
    });
  } catch (err) {
    console.error('[Error saving report]:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/trigger-scrape - Trigger an instant scrape on all connected Chrome Extensions
app.post('/api/trigger-scrape', (req, res) => {
  const mode = req.body.mode || 'all';
  io.emit('TRIGGER_SCRAPE_COMMAND', { mode });
  console.log(`[Socket.IO Command] Broadcasted TRIGGER_SCRAPE_COMMAND (mode: ${mode}) to extension clients.`);
  res.json({
    success: true,
    message: `Đã phát lệnh Socket.IO 'TRIGGER_SCRAPE_COMMAND' (chế độ: ${mode}) tới các Chrome Extension!`
  });
});

// 3. GET /api/reports - List all saved reports
app.get('/api/reports', (req, res) => {
  try {
    const reports = db.prepare(`SELECT * FROM reports ORDER BY id DESC`).all();
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/reports/:id - Get detail of a report run
app.get('/api/reports/:id', (req, res) => {
  try {
    const reportId = req.params.id;
    const report = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const kpis = db.prepare(`SELECT * FROM kpi_metrics WHERE report_id = ?`).all(reportId);
    const vouchers = db.prepare(`SELECT * FROM voucher_records WHERE report_id = ?`).all(reportId);

    res.json({
      report,
      kpis,
      vouchersCount: vouchers.length,
      vouchers: vouchers.slice(0, 100)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/vouchers - Search & paginate saved voucher records
app.get('/api/vouchers', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let whereClause = '';
    let params = [];
    if (search) {
      whereClause = `WHERE voucher_code LIKE ? OR campaign_name LIKE ? OR booth_name LIKE ? OR staff_code LIKE ?`;
      const pattern = `%${search}%`;
      params = [pattern, pattern, pattern, pattern];
    }

    const totalCount = db.prepare(`SELECT COUNT(*) as count FROM voucher_records ${whereClause}`).get(...params).count;
    const rows = db.prepare(`SELECT * FROM voucher_records ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    res.json({
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/export/excel/:id - Export SQLite report data to Excel (.xlsx)
app.get('/api/export/excel/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const report = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(reportId);
    if (!report) {
      return res.status(404).send('Report not found');
    }

    const kpis = db.prepare(`SELECT * FROM kpi_metrics WHERE report_id = ?`).all(reportId);
    const vouchers = db.prepare(`SELECT * FROM voucher_records WHERE report_id = ?`).all(reportId);

    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: KPIs
    if (kpis.length > 0) {
      const wsKpi = workbook.addWorksheet('Chi_So_KPI');
      wsKpi.columns = [
        { header: 'Tên Chỉ Số', key: 'label', width: 30 },
        { header: 'Giá Trị', key: 'value', width: 20 }
      ];
      kpis.forEach(k => wsKpi.addRow(k));
    }

    // Sheet 2: Voucher Records
    const wsVoucher = workbook.addWorksheet('Danh_Sach_Voucher');
    wsVoucher.columns = [
      { header: 'TÊN CAMPAIGN', key: 'campaign_name', width: 25 },
      { header: 'MÃ VOUCHER', key: 'voucher_code', width: 20 },
      { header: 'KHU GIAN HÀNG', key: 'booth_area', width: 20 },
      { header: 'MÃ LÔ', key: 'lot_code', width: 15 },
      { header: 'MÃ GIAN HÀNG', key: 'booth_code', width: 20 },
      { header: 'TÊN GIAN HÀNG', key: 'booth_name', width: 25 },
      { header: 'TRẠNG THÁI CỬA HÀNG', key: 'store_status', width: 25 },
      { header: 'TRẠNG THÁI VOUCHER', key: 'voucher_status', width: 20 },
      { header: 'SỐ GIỜ SỬ DỤNG CÒN LẠI', key: 'remaining_hours', width: 25 },
      { header: 'NGÀY SỬ DỤNG', key: 'use_date', width: 15 },
      { header: 'GIỜ SỬ DỤNG', key: 'use_time', width: 15 },
      { header: 'VGID', key: 'vgid', width: 15 },
      { header: 'MÃ NHÂN VIÊN', key: 'staff_code', width: 20 },
      { header: 'NGÀY PHÁT HÀNH', key: 'issue_date', width: 15 },
      { header: 'NGÀY HẾT HẠN', key: 'expiry_date', width: 15 },
      { header: 'GIÁ TRỊ VOUCHER', key: 'voucher_value', width: 15 },
      { header: 'PnL', key: 'pnl', width: 15 },
      { header: 'User Topup', key: 'user_topup', width: 20 },
      { header: 'SỐ LƯỢT TỐI ĐA', key: 'max_usage', width: 15 },
      { header: 'SỐ LƯỢT SỬ DỤNG', key: 'usage_count', width: 15 }
    ];

    vouchers.forEach(v => wsVoucher.addRow(v));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=BaoCaoAnCa_Report_${reportId}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('[Excel Export Error]:', err);
    res.status(500).send('Error generating Excel file');
  }
});

// Start HTTP + Socket.IO Server
server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Node.js + Socket.IO + SQLite Server listening on:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`===================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[!] LỖI: Port ${PORT} đang được sử dụng bởi một tiến trình khác.`);
    console.error(`[!] Để giải phóng Port 3000, hãy chạy lệnh Terminal sau:`);
    console.error(`    lsof -i :3000 | awk 'NR>1 {print $2}' | xargs kill -9\n`);
  } else {
    console.error('[!] Server Error:', err);
  }
});
