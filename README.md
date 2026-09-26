# Looker Studio Data Scraper & Node.js SQLite Server 📊

A powerful Manifest V3 Chrome Extension and Node.js + SQLite backend solution for extracting, auto-scrolling, auto-paginating, and archiving tables and KPI scorecards from Google Looker Studio (Data Studio) reports into SQLite, Excel, and CSV.

---

## 🌟 Key Features

* **⚡ Virtual Scroll 100% Row Collection**: Handles Angular CDK Virtual Scrolling by performing fine-grained step scrolling (50px steps with zero row skipping).
* **🔄 Auto-Pagination**: Automatically clicks forward through multi-page Looker Studio reports (`.pageControl .pageForward`).
* **🔌 Socket.IO Real-time Connection**: Bi-directional communication between Chrome Extension and Node.js server.
* **📡 Remote Scrape Command**: Trigger an instant scrape from the server via REST API `POST /api/trigger-scrape` or Socket.IO events.
* **⏱️ Auto-Scheduler (5-Min Interval)**: Runs auto-scrape cycles with random time jitter (-20s to +20s) and automatic Google login session expiration detection.
* **💾 Node.js + Express + SQLite Backend**: Automatically archives scraped reports, KPI metrics, and structured voucher records into a local SQLite database (`bao_cao_an_ca.sqlite`).
* **📥 Multi-Format Export**: Export report history directly to Excel (`.xlsx`), CSV, or JSON.

---

## 📁 Repository Structure

```text
.
├── chrome_extension/        # Chrome Extension (Manifest V3)
│   ├── manifest.json        # Extension manifest
│   ├── content.js           # Virtual scroll extractor & Socket.IO client
│   ├── content.css          # In-page Floating Control Widget styles
│   ├── popup.html / .js     # Extension popup UI & export tools
│   ├── socket.io.min.js     # Socket.IO client library
│   └── xlsx.full.min.js     # SheetJS Excel library
│
├── server/                  # Node.js + SQLite Backend Server
│   ├── server.js            # Express API server & Socket.IO hub
│   ├── db.js                # SQLite database schema initializer
│   └── package.json         # Server dependencies
│
├── .gitignore               # Ignored dependencies & SQLite data files
└── README.md                # Project documentation
```

---

## 🚀 Quick Start Guide

### 1. Start the Node.js Server

```bash
cd server
npm install
npm start
```

The server will initialize SQLite database at `server/bao_cao_an_ca.sqlite` and listen on:
👉 `http://localhost:3000`

---

### 2. Install Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** (Tải tiện ích đã giải nén).
4. Select the `chrome_extension` folder in this repository.

---

## 🎮 How to Use

1. Open any **Looker Studio Report** page (e.g. `https://lookerstudio.google.com/...`).
2. A floating widget titled **📊 Looker Studio Scraper** will appear at the bottom right.
3. Verify status shows **`🟢 Socket: Online`**.
4. Click:
   - **`⚡ Cào Trang Hiện Tại`**: Scrapes current page with virtual scroll extraction.
   - **`🔄 Cào Tất cả Trang`**: Scrapes all pages with auto-pagination.
   - **`⏱️ Tự động Cào mỗi 5 phút`**: Enables background auto-scraping loop.
5. Data is automatically saved to SQLite and can be downloaded as `.xlsx` or `.csv`.

---

## 📡 Remote Trigger API

You can trigger a scrape remotely from any external tool or terminal:

```bash
curl -X POST http://localhost:3000/api/trigger-scrape \
  -H "Content-Type: application/json" \
  -d '{"mode":"all"}'
```

---

## 🛠️ Tech Stack

* **Frontend Extension**: HTML5, Vanilla CSS, JavaScript (ES6+), Socket.IO Client, SheetJS (XLSX)
* **Backend Server**: Node.js, Express, Socket.IO, Better-SQLite3, ExcelJS

---

## 📄 License

MIT License. Free for personal and commercial use.
