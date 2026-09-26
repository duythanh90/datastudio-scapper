/**
 * Looker Studio Specialized Content Script với Virtual Scroll 100% Row Collection (Fine-Grained Step Scroll)
 */

let isScrapingAllPages = false;
let currentExtractedData = null;

let isAutoScrapeEnabled = false;
let autoScrapeTimer = null;
let autoScrapeSecondsLeft = 0;
let socket = null;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFloatingWidget);
} else {
  initFloatingWidget();
}

function initFloatingWidget() {
  if (document.getElementById("looker-scraper-floating-widget")) return;

  const widgetHtml = `
    <div id="looker-scraper-floating-widget">
      <div class="widget-header">
        <div class="widget-title">
          <span>📊 Looker Studio Scraper</span>
          <span id="ls-socket-badge" class="ls-socket-badge offline">🔴 Socket: Offline</span>
        </div>
        <button id="ls-toggle-min" class="widget-toggle-btn" title="Thu nhỏ / Mở rộng">—</button>
      </div>

      <div id="ls-widget-body" class="widget-body">
        <button id="ls-btn-auto" class="ls-btn ls-btn-auto">
          <span id="ls-auto-icon">⏱️</span>
          <span id="ls-auto-text">Tự động Cào mỗi 5 phút (TẮT)</span>
        </button>
        <div id="ls-auto-timer" class="ls-auto-timer-badge" style="display: none;">⏰ Cào tiếp theo: --:--</div>

        <button id="ls-btn-all" class="ls-btn ls-btn-primary">
          <span>🔄 Cào Tất cả Trang (Cuộn & Auto-Next)</span>
        </button>

        <button id="ls-btn-single" class="ls-btn ls-btn-secondary">
          <span>⚡ Cào Trang Hiện Tại (Có Cuộn Ảo)</span>
        </button>

        <div id="ls-status-box" class="ls-status">Sẵn sàng trích xuất dữ liệu.</div>

        <div class="ls-stats-grid">
          <div class="ls-stat-box">
            <div id="ls-stat-page" class="ls-stat-num">0</div>
            <div class="ls-stat-lbl">Phân trang</div>
          </div>
          <div class="ls-stat-box">
            <div id="ls-stat-rows" class="ls-stat-num">0</div>
            <div class="ls-stat-lbl">Tổng số dòng</div>
          </div>
        </div>

        <div id="ls-actions-row" style="display: none; flex-direction: column; gap: 6px; margin-top: 4px;">
          <button id="ls-btn-sqlite" class="ls-btn ls-btn-sqlite">
            <span>💾 Lưu vào CSDL SQLite</span>
          </button>
          <button id="ls-btn-excel" class="ls-btn ls-btn-secondary">
            <span>📥 Tải File Excel (.xlsx)</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const container = document.createElement("div");
  container.innerHTML = widgetHtml;
  document.body.appendChild(container.firstElementChild);

  bindWidgetEvents();
  checkAutoScrapeStateOnLoad();
  initSocketConnection();
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

function initSocketConnection() {
  if (typeof io === "undefined") {
    console.warn("[Socket.IO] Library io is not loaded.");
    return;
  }

  getServerUrl((serverUrl) => {
    try {
      socket = io(serverUrl, {
        reconnectionAttempts: 20,
        reconnectionDelay: 2000
      });

      socket.on("connect", () => {
        console.log("[Socket.IO Client] Connected to Server at", serverUrl, "ID:", socket.id);
        updateSocketBadgeUI(true);
        socket.emit("extension_status", {
          url: window.location.href,
          title: document.title,
          status: "READY"
        });
      });

      socket.on("disconnect", () => {
        console.log("[Socket.IO Client] Disconnected from Server.");
        updateSocketBadgeUI(false);
      });

      socket.on("TRIGGER_SCRAPE_COMMAND", async (data) => {
        console.log("[Socket.IO Client] Received scrape command from server:", data);
        const statusBox = document.getElementById("ls-status-box");
        if (statusBox) statusBox.textContent = "📡 Nhận lệnh cào dữ liệu từ xa từ Socket.IO Server...";

        let extracted = null;
        if (data && data.mode === "single") {
          extracted = await extractSinglePageWithScroll();
        } else {
          isScrapingAllPages = true;
          extracted = await performAllPagesScrape((progress) => {
            socket.emit("extension_status", { status: "SCRAPING", progress });
          });
        }

        if (extracted) {
          currentExtractedData = extracted;
          const totalRows = extracted.tables.reduce((acc, t) => acc + t.rows.length, 0);
          if (statusBox) statusBox.textContent = `✅ Đã cào xong ${totalRows} dòng. Đang gửi về Server qua Socket.IO...`;

          socket.emit("save_scraped_data", extracted, (res) => {
            if (res && res.success) {
              if (statusBox) statusBox.textContent = `✅ Socket.IO: Đã lưu báo cáo #${res.reportId} (${totalRows} dòng) vào SQLite!`;
            } else {
              if (statusBox) statusBox.textContent = "❌ Socket.IO Error: " + (res ? res.error : "Không thể lưu");
            }
          });
        }
      });

    } catch (err) {
      console.error("[Socket.IO Init Error]:", err);
    }
  });
}

function updateSocketBadgeUI(isConnected) {
  const badge = document.getElementById("ls-socket-badge");
  if (badge) {
    badge.textContent = isConnected ? "🟢 Socket: Online" : "🔴 Socket: Offline";
    badge.className = isConnected ? "ls-socket-badge online" : "ls-socket-badge offline";
  }
}

function checkAutoScrapeStateOnLoad() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["lsAutoScrapeEnabled", "lsPostReloadScrape"], (res) => {
      if (res && res.lsAutoScrapeEnabled) {
        setWidgetAutoState(true);
        if (res.lsPostReloadScrape) {
          chrome.storage.local.set({ lsPostReloadScrape: false }, () => {
            runPostReloadAutoScrape();
          });
        } else {
          startAutoScrapeCountdown();
        }
      }
    });
  } else {
    const enabled = localStorage.getItem("lsAutoScrapeEnabled") === "true";
    const postReload = localStorage.getItem("lsPostReloadScrape") === "true";
    if (enabled) {
      setWidgetAutoState(true);
      if (postReload) {
        localStorage.setItem("lsPostReloadScrape", "false");
        runPostReloadAutoScrape();
      } else {
        startAutoScrapeCountdown();
      }
    }
  }
}

function setWidgetAutoState(enabled) {
  isAutoScrapeEnabled = enabled;
  const btnAuto = document.getElementById("ls-btn-auto");
  const autoTimer = document.getElementById("ls-auto-timer");
  const autoText = document.getElementById("ls-auto-text");

  if (btnAuto) btnAuto.classList.toggle("active", enabled);
  if (autoTimer) autoTimer.style.display = enabled ? "block" : "none";
  if (autoText) autoText.textContent = enabled ? "⏱️ Tự động Cào mỗi 5 phút (ĐANG BẬT)" : "⏱️ Tự động Cào mỗi 5 phút (TẮT)";
}

function toggleAutoScrape(enable) {
  setWidgetAutoState(enable);
  const statusBox = document.getElementById("ls-status-box");

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ lsAutoScrapeEnabled: enable });
  } else {
    localStorage.setItem("lsAutoScrapeEnabled", enable ? "true" : "false");
  }

  if (enable) {
    if (statusBox) statusBox.textContent = "⏱️ Đã BẬT cào tự động 5 phút/lần (Có độ trễ ngẫu nhiên).";
    startAutoScrapeCountdown();
  } else {
    stopAutoScrapeCountdown();
    if (statusBox) statusBox.textContent = "⏹️ Đã TẮT cào tự động.";
  }
}

function stopAutoScrapeCountdown() {
  if (autoScrapeTimer) {
    clearInterval(autoScrapeTimer);
    autoScrapeTimer = null;
  }
  const autoTimer = document.getElementById("ls-auto-timer");
  if (autoTimer) autoTimer.style.display = "none";
}

function isGoogleSessionExpired() {
  const url = window.location.href;
  if (url.includes("accounts.google.com") || url.includes("signin")) {
    return true;
  }
  const bodyText = document.body ? document.body.innerText : "";
  if (bodyText.includes("Sign in to Google") || bodyText.includes("Access denied") || bodyText.includes("Bạn cần quyền truy cập")) {
    return true;
  }
  return false;
}

function startAutoScrapeCountdown() {
  stopAutoScrapeCountdown();

  if (!isAutoScrapeEnabled) return;

  const autoTimer = document.getElementById("ls-auto-timer");
  if (autoTimer) autoTimer.style.display = "block";

  const jitter = Math.floor(Math.random() * 41) - 20; 
  autoScrapeSecondsLeft = Math.max(60, 300 + jitter);

  const statusBox = document.getElementById("ls-status-box");

  autoScrapeTimer = setInterval(() => {
    autoScrapeSecondsLeft--;

    const mins = String(Math.floor(autoScrapeSecondsLeft / 60)).padStart(2, '0');
    const secs = String(autoScrapeSecondsLeft % 60).padStart(2, '0');

    if (autoTimer) autoTimer.textContent = `⏰ Cào tiếp theo sau: ${mins}:${secs}`;

    if (autoScrapeSecondsLeft <= 0) {
      stopAutoScrapeCountdown();
      if (statusBox) statusBox.textContent = "🔄 Đang làm mới trang để cào dữ liệu đợt mới...";
      
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ lsPostReloadScrape: true }, () => {
          window.location.reload();
        });
      } else {
        localStorage.setItem("lsPostReloadScrape", "true");
        window.location.reload();
      }
    }
  }, 1000);
}

async function runPostReloadAutoScrape() {
  const statusBox = document.getElementById("ls-status-box");
  const statPage = document.getElementById("ls-stat-page");
  const statRows = document.getElementById("ls-stat-rows");
  const actionsRow = document.getElementById("ls-actions-row");

  if (statusBox) statusBox.textContent = "⏳ Đang chờ Looker Studio nạp xong dữ liệu (7 giây)...";
  await new Promise(resolve => setTimeout(resolve, 7000));

  if (isGoogleSessionExpired()) {
    if (statusBox) statusBox.textContent = "⚠️ Phiên Google Login hết hạn! Vui lòng đăng nhập lại.";
    toggleAutoScrape(false);
    return;
  }

  if (statusBox) statusBox.textContent = "🚀 Đang tự động cào dữ liệu mới...";
  isScrapingAllPages = true;

  const data = await performAllPagesScrape((progress) => {
    if (statusBox) statusBox.textContent = `⏳ ${progress.status || 'Đang cào'}...`;
    if (statPage) statPage.textContent = `Trang ${progress.page}`;
    if (statRows) statRows.textContent = `${progress.rowsCollected} dòng`;
  });

  if (data) {
    currentExtractedData = data;
    const totalRows = data.tables.reduce((acc, t) => acc + t.rows.length, 0);
    if (statPage) statPage.textContent = `${data.totalPagesScraped} trang`;
    if (statRows) statRows.textContent = `${totalRows} dòng`;
    if (actionsRow) actionsRow.style.display = "flex";

    getServerUrl(async (serverUrl) => {
      if (statusBox) statusBox.textContent = `💾 Đang tự động gửi dữ liệu về SQLite (${serverUrl})...`;
      try {
        const res = await fetch(`${serverUrl}/api/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const resData = await res.json();
        if (res.ok && resData.success) {
          if (statusBox) statusBox.textContent = `✅ Tự động cào & lưu ${resData.totalRowsInserted} dòng vào SQLite! (Mã #${resData.reportId})`;
        } else {
          if (statusBox) statusBox.textContent = "❌ Lỗi Server SQLite: " + (resData.error || "Không thể lưu");
        }
      } catch (err) {
        if (statusBox) statusBox.textContent = `⚠️ Không thể gửi tới SQLite Server (${serverUrl})! Đảm bảo server đang chạy.`;
      }
    });
  }

  startAutoScrapeCountdown();
}

function bindWidgetEvents() {
  const widget = document.getElementById("looker-scraper-floating-widget");
  const toggleMin = document.getElementById("ls-toggle-min");
  const widgetBody = document.getElementById("ls-widget-body");

  const btnAuto = document.getElementById("ls-btn-auto");
  const btnAll = document.getElementById("ls-btn-all");
  const btnSingle = document.getElementById("ls-btn-single");
  const btnSqlite = document.getElementById("ls-btn-sqlite");
  const btnExcel = document.getElementById("ls-btn-excel");

  const statusBox = document.getElementById("ls-status-box");
  const statPage = document.getElementById("ls-stat-page");
  const statRows = document.getElementById("ls-stat-rows");
  const actionsRow = document.getElementById("ls-actions-row");

  let isMinimized = false;
  toggleMin.addEventListener("click", () => {
    isMinimized = !isMinimized;
    widgetBody.style.display = isMinimized ? "none" : "flex";
    widget.classList.toggle("minimized", isMinimized);
    toggleMin.textContent = isMinimized ? "▢" : "—";
  });

  btnAuto.addEventListener("click", () => {
    toggleAutoScrape(!isAutoScrapeEnabled);
  });

  // 🔄 Cào tất cả trang + Cuộn mịn 100% dòng
  btnAll.addEventListener("click", async () => {
    btnAll.disabled = true;
    btnSingle.disabled = true;
    statusBox.textContent = "🚀 Đang tự động cuộn mịn & cào tất cả các trang...";
    actionsRow.style.display = "none";

    isScrapingAllPages = true;
    const data = await performAllPagesScrape((progress) => {
      statusBox.textContent = `⏳ ${progress.status || 'Đang cào'} (${progress.paginationText || 'Trang ' + progress.page})...`;
      statPage.textContent = `Trang ${progress.page}`;
      statRows.textContent = `${progress.rowsCollected} dòng`;
    });

    btnAll.disabled = false;
    btnSingle.disabled = false;

    if (data) {
      currentExtractedData = data;
      const totalRows = data.tables.reduce((acc, t) => acc + t.rows.length, 0);
      statusBox.textContent = `🎉 Hoàn tất! Đã trích xuất đủ ${totalRows} dòng từ ${data.totalPagesScraped} trang.`;
      statPage.textContent = `${data.totalPagesScraped} trang`;
      statRows.textContent = `${totalRows} dòng`;
      actionsRow.style.display = "flex";
    }
  });

  // ⚡ Cào trang hiện tại + Cuộn mịn
  btnSingle.addEventListener("click", async () => {
    btnAll.disabled = true;
    btnSingle.disabled = true;
    statusBox.textContent = "⚡ Đang cuộn dọc & trích xuất đầy đủ dòng...";

    const data = await extractSinglePageWithScroll();
    currentExtractedData = data;

    btnAll.disabled = false;
    btnSingle.disabled = false;

    const totalRows = data.tables.reduce((acc, t) => acc + t.rows.length, 0);
    statusBox.textContent = `✅ Trích xuất đủ ${totalRows} dòng.`;
    statPage.textContent = "1 trang";
    statRows.textContent = `${totalRows} dòng`;
    actionsRow.style.display = "flex";
  });

  // 💾 Lưu vào CSDL SQLite
  btnSqlite.addEventListener("click", async () => {
    if (!currentExtractedData) return;

    btnSqlite.disabled = true;
    getServerUrl(async (serverUrl) => {
      statusBox.textContent = `💾 Đang gửi dữ liệu tới SQLite Server (${serverUrl})...`;

      try {
        const res = await fetch(`${serverUrl}/api/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentExtractedData)
        });

        const resData = await res.json();
        btnSqlite.disabled = false;

        if (res.ok && resData.success) {
          statusBox.textContent = `✅ Đã lưu ${resData.totalRowsInserted} dòng vào SQLite! (Mã #${resData.reportId})`;
          alert(`Lưu CSDL SQLite thành công!\n- Mã báo cáo: #${resData.reportId}\n- Số dòng: ${resData.totalRowsInserted} dòng\n- Số KPI: ${resData.totalKpisInserted}`);
        } else {
          statusBox.textContent = "❌ Lỗi Server: " + (resData.error || "Không thể lưu");
        }
      } catch (err) {
        btnSqlite.disabled = false;
        statusBox.textContent = `❌ Lỗi kết nối Server! Vui lòng bật Node.js Server tại (${serverUrl}).`;
        alert(`Không kết nối được tới Node.js Server tại ${serverUrl}.\nHãy chắc chắn server đang chạy bằng lệnh: npm start`);
      }
    });
  });

  // 📥 Tải file Excel
  btnExcel.addEventListener("click", () => {
    if (!currentExtractedData) return;

    if (typeof XLSX === "undefined") {
      alert("Đang nạp thư viện XLSX, hãy thử lại!");
      return;
    }

    const wb = XLSX.utils.book_new();

    if (currentExtractedData.scorecards && currentExtractedData.scorecards.length > 0) {
      const kpiRows = [["Tên Chỉ Số", "Giá Trị"]];
      currentExtractedData.scorecards.forEach(kpi => kpiRows.push([kpi.label, kpi.value]));
      const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
      XLSX.utils.book_append_sheet(wb, wsKpi, "Chi_So_KPI");
    }

    if (currentExtractedData.tables.length > 0) {
      currentExtractedData.tables.forEach((t, idx) => {
        const ws = XLSX.utils.aoa_to_sheet(t.allData);
        XLSX.utils.book_append_sheet(wb, ws, `Tong_Hop_Du_Lieu_${idx + 1}`);
      });
    }

    XLSX.writeFile(wb, "Looker_Studio_BaoCaoAnCa.xlsx");
  });
}

function findPrimaryScrollableElement(tblContainer) {
  const candidates = [
    tblContainer.querySelector(".tableBody"),
    tblContainer.querySelector(".centerColsContainer"),
    tblContainer.querySelector(".horizontalScrolling"),
    tblContainer.querySelector(".cdk-virtual-scroll-viewport"),
    tblContainer.querySelector("upgraded-table .table")
  ];

  for (const el of candidates) {
    if (el && el.scrollHeight > el.clientHeight && el.clientHeight > 0) {
      return el;
    }
  }

  const allDesc = tblContainer.querySelectorAll("*");
  for (const el of allDesc) {
    if (el.scrollHeight > el.clientHeight + 5 && el.clientHeight > 0) {
      const overflowY = window.getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
        return el;
      }
    }
  }

  return tblContainer.querySelector(".tableBody") || tblContainer;
}

function triggerScrollEvent(element, deltaY = 50) {
  if (!element) return;

  element.scrollTop += deltaY;

  element.dispatchEvent(new Event('scroll', { bubbles: true, cancelable: true }));

  const wheelEvt = new WheelEvent('wheel', {
    deltaY: deltaY,
    bubbles: true,
    cancelable: true,
    view: window
  });
  element.dispatchEvent(wheelEvt);
}

function extractCellValue(cell) {
  if (!cell) return "";
  const titleVal = cell.getAttribute("title");
  const valEl = cell.querySelector(".cell-value");
  const text = valEl ? valEl.innerText.trim() : cell.innerText.trim();
  return (titleVal !== null && titleVal !== "" && titleVal !== "undefined") ? titleVal : text;
}

function extractHeadersFromTable(tblContainer) {
  const headers = [];
  const headerCells = tblContainer.querySelectorAll(".headerRow .headerCell, th, .cdk-header-cell");
  headerCells.forEach(cell => {
    const titleAttr = cell.querySelector(".colName") ? cell.querySelector(".colName").getAttribute("title") : null;
    const text = titleAttr || cell.innerText.trim();
    headers.push(text.replace(/\s+/g, " "));
  });
  return headers;
}

function extractVisibleRowsFromTable(tblContainer) {
  const rowsData = [];

  const centerContainer = tblContainer.querySelector(".tableBody .centerColsContainer") || tblContainer;
  const pinnedContainer = tblContainer.querySelector(".tableBody .leftPinnedColsContainer");

  const centerRows = centerContainer.querySelectorAll(".row");
  const pinnedRows = pinnedContainer ? pinnedContainer.querySelectorAll(".row") : [];

  const topDummy = centerContainer.querySelector(".top-dummy") || (pinnedContainer ? pinnedContainer.querySelector(".top-dummy") : null);
  const topDummyHeight = topDummy ? (topDummy.offsetHeight || parseFloat(window.getComputedStyle(topDummy).height) || 0) : 0;

  if (centerRows.length > 0) {
    centerRows.forEach((cRow, idx) => {
      const pRow = pinnedRows[idx];
      const rowVals = [];

      if (pRow) {
        const pCells = pRow.querySelectorAll(".cell, td, .cdk-cell");
        pCells.forEach(c => rowVals.push(extractCellValue(c)));
      }

      const cCells = cRow.querySelectorAll(".cell, td, .cdk-cell");
      cCells.forEach(c => rowVals.push(extractCellValue(c)));

      if (rowVals.some(v => v !== "")) {
        const rowHeight = cRow.offsetHeight || 28;
        let rowTop = cRow.offsetTop;
        if (!rowTop || rowTop <= 0) {
          rowTop = topDummyHeight + (idx * rowHeight);
        }
        const estimatedIndex = Math.round(rowTop / rowHeight);

        rowsData.push({
          index: estimatedIndex,
          data: rowVals
        });
      }
    });
  } else {
    const fallbackRows = tblContainer.querySelectorAll("tr:not(.headerRow), .cdk-row");
    fallbackRows.forEach((row, idx) => {
      const cells = row.querySelectorAll("td, .cdk-cell");
      const rowVals = [];
      cells.forEach(c => rowVals.push(extractCellValue(c)));
      if (rowVals.some(v => v !== "")) {
        rowsData.push({
          index: idx,
          data: rowVals
        });
      }
    });
  }

  return rowsData;
}

/**
 * Thu thập 100% dòng bằng cách cuộn mịn bước nhỏ 50px trên 1 container cuộn duy nhất
 */
async function scrollAndCollectAllRowsInTable(tblContainer) {
  const scrollElement = findPrimaryScrollableElement(tblContainer);
  const headers = extractHeadersFromTable(tblContainer);
  
  const indexMap = new Map();
  const signatureMap = new Map();

  // Reset cuộn về đỉnh
  if (scrollElement) {
    scrollElement.scrollTop = 0;
    triggerScrollEvent(scrollElement, -999999);
  }
  await new Promise(resolve => setTimeout(resolve, 400));

  let atBottomCount = 0;
  let noNewRowsCount = 0;
  let prevTotalCount = 0;
  const maxScrollSteps = 500;
  const scrollStepPx = 50;

  for (let step = 0; step < maxScrollSteps; step++) {
    const visibleRows = extractVisibleRowsFromTable(tblContainer);
    
    visibleRows.forEach(item => {
      const sig = item.data.join("||");
      if (sig.trim()) {
        if (!isNaN(item.index) && item.index >= 0) {
          indexMap.set(item.index, item.data);
        } else {
          signatureMap.set(sig, item.data);
        }
      }
    });

    const currentTotal = indexMap.size + signatureMap.size;
    if (currentTotal === prevTotalCount) {
      noNewRowsCount++;
    } else {
      noNewRowsCount = 0;
      prevTotalCount = currentTotal;
    }

    if (scrollElement) {
      const isAtBottom = (scrollElement.scrollTop + scrollElement.clientHeight) >= (scrollElement.scrollHeight - 5);
      if (isAtBottom) {
        atBottomCount++;
        if (atBottomCount >= 4) {
          break;
        }
      } else {
        atBottomCount = 0;
      }

      triggerScrollEvent(scrollElement, scrollStepPx);
    } else {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Quét nốt lần cuối ở đáy
  await new Promise(resolve => setTimeout(resolve, 500));
  const finalRows = extractVisibleRowsFromTable(tblContainer);
  finalRows.forEach(item => {
    const sig = item.data.join("||");
    if (sig.trim()) {
      if (!isNaN(item.index) && item.index >= 0) {
        indexMap.set(item.index, item.data);
      } else {
        signatureMap.set(sig, item.data);
      }
    }
  });

  // Reset cuộn về vị trí ban đầu
  if (scrollElement) {
    scrollElement.scrollTop = 0;
    triggerScrollEvent(scrollElement, -999999);
  }

  let combinedRows = [];
  if (indexMap.size > 0) {
    const sortedIndices = Array.from(indexMap.keys()).sort((a, b) => a - b);
    sortedIndices.forEach(idx => combinedRows.push(indexMap.get(idx)));
    
    signatureMap.forEach((rowData, sig) => {
      if (!combinedRows.some(r => r.join("||") === sig)) {
        combinedRows.push(rowData);
      }
    });
  } else {
    combinedRows = Array.from(signatureMap.values());
  }

  return {
    headers: headers,
    rows: combinedRows
  };
}

async function extractSinglePageWithScroll() {
  const result = extractBaseData();

  const tableContainers = document.querySelectorAll("upgraded-table, .table-wrapper, table, .cdk-table, [role='table']");
  for (let idx = 0; idx < tableContainers.length; idx++) {
    const tblContainer = tableContainers[idx];
    const { headers, rows } = await scrollAndCollectAllRowsInTable(tblContainer);
    
    if (headers.length > 0 || rows.length > 0) {
      const allMatrix = [];
      if (headers.length > 0) allMatrix.push(headers);
      allMatrix.push(...rows);

      result.tables.push({
        tableIndex: idx + 1,
        headers: headers,
        rows: rows,
        allData: allMatrix
      });
    }
  }

  return result;
}

async function performAllPagesScrape(onProgress) {
  const accumulatedData = extractBaseData();

  let masterHeaders = [];
  const masterRowsMap = new Map();
  let pageCount = 0;

  while (isScrapingAllPages) {
    pageCount++;
    
    const pageLabelEl = document.querySelector(".pageControl .pageLabel");
    const paginationText = pageLabelEl ? pageLabelEl.innerText.trim() : "";
    accumulatedData.pagination = paginationText;

    if (onProgress) {
      onProgress({
        status: `Đang cuộn cuộn dọc & cào trang ${pageCount}`,
        page: pageCount,
        paginationText: paginationText,
        rowsCollected: masterRowsMap.size
      });
    }

    const tableContainers = document.querySelectorAll("upgraded-table, .table-wrapper, table, .cdk-table, [role='table']");
    if (tableContainers.length > 0) {
      const primaryTable = tableContainers[0];
      const { headers, rows } = await scrollAndCollectAllRowsInTable(primaryTable);

      if (masterHeaders.length === 0 && headers.length > 0) {
        masterHeaders = headers;
      }

      rows.forEach(row => {
        const sig = row.join("||");
        if (sig.trim() && !masterRowsMap.has(sig)) {
          masterRowsMap.set(sig, row);
        }
      });
    }

    if (onProgress) {
      onProgress({
        status: `Đã hoàn tất cào trang ${pageCount}, chuẩn bị sang trang tiếp...`,
        page: pageCount,
        paginationText: paginationText,
        rowsCollected: masterRowsMap.size
      });
    }

    const nextBtn = document.querySelector(".pageControl .pageForward");
    const isNextDisabled = !nextBtn || 
                           nextBtn.classList.contains("disabled") || 
                           nextBtn.getAttribute("tabindex") === "-1" ||
                           nextBtn.getAttribute("aria-disabled") === "true";

    if (isNextDisabled) {
      break;
    }

    nextBtn.click();
    await new Promise(resolve => setTimeout(resolve, 1800));
  }

  const allCollectedRows = Array.from(masterRowsMap.values());
  accumulatedData.totalPagesScraped = pageCount;
  accumulatedData.totalRowsCollected = allCollectedRows.length;

  if (masterHeaders.length > 0 || allCollectedRows.length > 0) {
    accumulatedData.tables = [{
      tableIndex: 1,
      headers: masterHeaders,
      rows: allCollectedRows,
      allData: masterHeaders.length > 0 ? [masterHeaders, ...allCollectedRows] : allCollectedRows
    }];
  }

  return accumulatedData;
}

function extractBaseData() {
  const result = {
    title: document.title || "Looker Studio Report",
    url: window.location.href,
    scrapedAt: new Date().toLocaleString("vi-VN"),
    tables: [],
    scorecards: [],
    filters: [],
    pagination: ""
  };

  const kpiElements = document.querySelectorAll(".kpimetric, ng2-kpimetric, .scorecard-component");
  kpiElements.forEach(kpi => {
    const labelEl = kpi.querySelector(".kpi-label");
    const valEl = kpi.querySelector(".value-label");
    if (labelEl || valEl) {
      const label = labelEl ? labelEl.innerText.trim() : "";
      const val = valEl ? valEl.innerText.trim() : "";
      if (label || val) {
        result.scorecards.push({ label, value: val });
      }
    }
  });

  const filterElements = document.querySelectorAll("canvas-control-host, .dimension-filter");
  filterElements.forEach(flt => {
    const mainText = flt.querySelector(".main-text, main-section");
    if (mainText) {
      const name = mainText.innerText.trim();
      if (name && !result.filters.includes(name)) {
        result.filters.push(name);
      }
    }
  });

  const pageLabelEl = document.querySelector(".pageControl .pageLabel");
  if (pageLabelEl) {
    result.pagination = pageLabelEl.innerText.trim();
  }

  const bodyText = document.body ? document.body.innerText : "";
  result.textLines = bodyText.split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return result;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCRAPE_SINGLE_PAGE") {
    extractSinglePageWithScroll().then(data => {
      sendResponse({ status: "SUCCESS", data });
    });
    return true;
  } else if (request.action === "SCRAPE_ALL_PAGES") {
    isScrapingAllPages = true;
    performAllPagesScrape((progress) => {
      chrome.runtime.sendMessage({ action: "SCRAPE_PROGRESS", progress }).catch(() => {});
    }).then(data => {
      sendResponse({ status: "SUCCESS", data });
    });
    return true;
  }
  return true;
});
