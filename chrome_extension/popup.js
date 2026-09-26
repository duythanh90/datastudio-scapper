let currentScrapedData = null;

document.addEventListener("DOMContentLoaded", () => {
  const btnScrapeAll = document.getElementById("btnScrapeAll");
  const btnScrapeSingle = document.getElementById("btnScrapeSingle");
  const btnSaveSqlite = document.getElementById("btnSaveSqlite");
  const btnExcel = document.getElementById("btnExcel");
  const btnCsv = document.getElementById("btnCsv");
  const btnJson = document.getElementById("btnJson");

  const statusCard = document.getElementById("statusCard");
  const statusInfo = document.getElementById("statusInfo");
  const statTables = document.getElementById("statTables");
  const statLines = document.getElementById("statLines");
  const actionsGroup = document.getElementById("actionsGroup");
  const previewContainer = document.getElementById("previewContainer");

  // Lắng nghe tiến độ cào trang từ Content Script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "SCRAPE_PROGRESS") {
      const p = message.progress;
      statusInfo.textContent = `⏳ Đang tự động chuyển trang (${p.paginationText || 'Trang ' + p.page})...`;
      statTables.textContent = `Trang ${p.page}`;
      statLines.textContent = `${p.rowsCollected} dòng`;
    }
  });

  // Trích xuất TẤT CẢ các trang (Auto Next)
  btnScrapeAll.addEventListener("click", () => {
    runScrape("SCRAPE_ALL_PAGES");
  });

  // Trích xuất TRANG HIỆN TẠI
  btnScrapeSingle.addEventListener("click", () => {
    runScrape("SCRAPE_SINGLE_PAGE");
  });

  async function runScrape(actionName) {
    statusCard.style.display = "block";
    statusInfo.textContent = actionName === "SCRAPE_ALL_PAGES" 
      ? "🚀 Bắt đầu tự động chuyển trang & cào dữ liệu..." 
      : "Đang trích xuất trang hiện tại...";
    
    btnScrapeAll.disabled = true;
    btnScrapeSingle.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error("Không tìm thấy trang web đang mở!");
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      }).catch(() => {});

      chrome.tabs.sendMessage(tab.id, { action: actionName }, (response) => {
        btnScrapeAll.disabled = false;
        btnScrapeSingle.disabled = false;

        if (chrome.runtime.lastError) {
          statusInfo.textContent = "⚠️ Hãy bấm F5 làm mới trang Looker Studio rồi thử lại.";
          return;
        }

        if (response && response.status === "SUCCESS") {
          currentScrapedData = response.data;
          renderResults(currentScrapedData);
        } else {
          statusInfo.textContent = "❌ Lỗi: " + (response ? response.message : "Không nhận được dữ liệu");
        }
      });
    } catch (err) {
      btnScrapeAll.disabled = false;
      btnScrapeSingle.disabled = false;
      statusInfo.textContent = "❌ Lỗi: " + err.message;
    }
  }

  function renderResults(data) {
    statusInfo.textContent = "🎉 Hoàn tất trích xuất!";
    
    const totalRows = data.tables.reduce((acc, t) => acc + t.rows.length, 0);
    statTables.textContent = data.totalPagesScraped ? `${data.totalPagesScraped} trang` : "1 trang";
    statLines.textContent = `${totalRows} dòng`;

    actionsGroup.style.display = "block";
    previewContainer.style.display = "block";

    let html = `<strong>Báo cáo:</strong> ${data.title}<br>`;
    if (data.pagination) {
      html += `<strong>Vị trí phân trang:</strong> ${data.pagination}<br>`;
    }

    if (data.scorecards && data.scorecards.length > 0) {
      html += `<br><strong>🎯 Chỉ số KPI:</strong><br>`;
      data.scorecards.forEach(kpi => {
        html += `• <b>${kpi.label}:</b> ${kpi.value}<br>`;
      });
    }

    if (data.tables.length > 0) {
      html += `<br><strong>📊 Tổng dữ liệu thu thập (${totalRows} dòng):</strong><br>`;
      data.tables.forEach((tbl, idx) => {
        html += `• Bảng ${idx + 1}: ${tbl.headers.length} cột x ${tbl.rows.length} dòng<br>`;
        if (tbl.headers.length > 0) {
          html += `<small style="color:#94a3b8;">Cột: ${tbl.headers.slice(0, 4).join(", ")}...</small><br>`;
        }
      });
    }
    previewContainer.innerHTML = html;
  }

  function getServerUrl(callback) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get("lsServerUrl", (res) => {
        const url = (res && res.lsServerUrl) ? res.lsServerUrl : "http://localhost:3000";
        callback(url.replace(/\/$/, ""));
      });
    } else {
      const url = localStorage.getItem("lsServerUrl") || "http://localhost:3000";
      callback(url.replace(/\/$/, ""));
    }
  }

  // 💾 Lưu vào Node.js + SQLite Server
  btnSaveSqlite.addEventListener("click", async () => {
    if (!currentScrapedData) return;

    btnSaveSqlite.disabled = true;
    getServerUrl(async (serverUrl) => {
      statusInfo.textContent = `💾 Đang gửi dữ liệu tới SQLite Server (${serverUrl})...`;

      try {
        const res = await fetch(`${serverUrl}/api/reports`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(currentScrapedData)
        });

        const resData = await res.json();
        btnSaveSqlite.disabled = false;

        if (res.ok && resData.success) {
          statusInfo.textContent = `✅ Đã lưu ${resData.totalRowsInserted} dòng vào SQLite! (ID: ${resData.reportId})`;
          alert(`Lưu CSDL SQLite thành công!\n- Mã báo cáo: #${resData.reportId}\n- Số dòng: ${resData.totalRowsInserted} dòng\n- Số KPI: ${resData.totalKpisInserted}`);
        } else {
          statusInfo.textContent = "❌ Lỗi Server: " + (resData.error || "Không thể lưu");
        }
      } catch (err) {
        btnSaveSqlite.disabled = false;
        statusInfo.textContent = `❌ Kết nối Server thất bại! Hãy chắc chắn Node.js Server đang chạy tại (${serverUrl}).`;
        alert(`Lỗi kết nối tới Node.js Server tại ${serverUrl}.\nVui lòng khởi động server bằng lệnh: npm start`);
      }
    });
  });

  // Export Excel (.xlsx)
  btnExcel.addEventListener("click", () => {
    if (!currentScrapedData) return;

    if (typeof XLSX === "undefined") {
      alert("Đang tải thư viện XLSX, vui lòng thử lại!");
      return;
    }

    const wb = XLSX.utils.book_new();

    if (currentScrapedData.scorecards && currentScrapedData.scorecards.length > 0) {
      const kpiRows = [["Tên Chỉ Số", "Giá Trị"]];
      currentScrapedData.scorecards.forEach(kpi => kpiRows.push([kpi.label, kpi.value]));
      const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
      XLSX.utils.book_append_sheet(wb, wsKpi, "Chi_So_KPI");
    }

    if (currentScrapedData.tables.length > 0) {
      currentScrapedData.tables.forEach((t, idx) => {
        const ws = XLSX.utils.aoa_to_sheet(t.allData);
        XLSX.utils.book_append_sheet(wb, ws, `Tong_Hop_Du_Lieu_${idx + 1}`);
      });
    }

    XLSX.writeFile(wb, "Looker_Studio_Full_Data.xlsx");
  });

  // Export CSV (.csv)
  btnCsv.addEventListener("click", () => {
    if (!currentScrapedData) return;

    let csvContent = "\uFEFF";
    if (currentScrapedData.scorecards && currentScrapedData.scorecards.length > 0) {
      csvContent += "=== CHI SO KPI ===\n";
      currentScrapedData.scorecards.forEach(kpi => {
        csvContent += `"${kpi.label}","${kpi.value}"\n`;
      });
      csvContent += "\n";
    }

    if (currentScrapedData.tables.length > 0) {
      currentScrapedData.tables.forEach((t, idx) => {
        csvContent += `=== BANG DU LIEU TONG HOP ${idx + 1} ===\n`;
        t.allData.forEach(row => {
          csvContent += row.map(cell => `"${(cell || "").toString().replace(/"/g, '""')}"`).join(",") + "\n";
        });
        csvContent += "\n";
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Looker_Studio_Full_Data.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Copy JSON
  btnJson.addEventListener("click", () => {
    if (!currentScrapedData) return;
    const jsonStr = JSON.stringify(currentScrapedData, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      alert("Đã sao chép toàn bộ dữ liệu JSON vào Clipboard!");
    });
  });
});
