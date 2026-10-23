/**
 * RESEARCHER TOOL - CLIENT APPLICATION LOGIC
 */

document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let currentTab = "pipeline";
  let activeDataset = "";
  let currentPage = 1;
  let currentPageSize = 50;
  let currentSearch = "";
  let currentStatus = "all";
  let totalLeadsCount = 0;
  let eventSource = null;
  let lineCount = 0;
  let runStartTime = null;
  let timerInterval = null;
  let searchDebounceTimeout = null;

  // ---------------------------------------------------------------------------
  // DOM Elements
  // ---------------------------------------------------------------------------
  // Nav
  const navTabs = document.querySelectorAll(".nav-tab");
  const tabViews = document.querySelectorAll(".tab-view");
  const systemStatusIndicator = document.getElementById("system-status-indicator");
  const systemStatusText = document.getElementById("system-status-text");
  const btnRefreshAll = document.getElementById("btn-refresh-all");

  // Stats
  const statCentral = document.getElementById("stat-central-leads");
  const statToday = document.getElementById("stat-today-leads");
  const statTodayDate = document.getElementById("stat-today-date");
  const statNih = document.getElementById("stat-nih-leads");
  const statPool = document.getElementById("stat-pool-leads");
  const statPoolUnprocessed = document.getElementById("stat-pool-unprocessed");
  const headerTrialText = document.getElementById("header-trial-text");
  const statTrialDays = document.getElementById("stat-trial-days");
  const statTrialQuota = document.getElementById("stat-trial-quota");

  // Dynamic Candidate Pool Alerts in Tool 02
  const poolEmptyAlert = document.getElementById("pool-empty-alert");
  const poolActiveAlert = document.getElementById("pool-active-alert");
  const poolActiveText = document.getElementById("pool-active-text");
  const btnScholarlyLabel = document.getElementById("btn-scholarly-label");

  // Pipeline Buttons & Inputs
  const btnRunOpenalex = document.getElementById("btn-run-openalex");
  const inputOpenalexKeyword = document.getElementById("openalex-keyword");
  const inputOpenalexPages = document.getElementById("openalex-pages");
  const selectDateMode = document.getElementById("openalex-date-mode");
  const panelDateMonth = document.getElementById("panel-date-month");
  const panelDateYear = document.getElementById("panel-date-year");
  const panelDateCustom = document.getElementById("panel-date-custom");
  const inputMonthSelect = document.getElementById("openalex-month-select");
  const inputYearSelect = document.getElementById("openalex-year-select");
  const inputCustomFrom = document.getElementById("openalex-custom-from");
  const inputCustomTo = document.getElementById("openalex-custom-to");

  const btnRunScholarly = document.getElementById("btn-run-scholarly");
  const inputScholarlyTarget = document.getElementById("scholarly-target");
  const selectScholarlyFile = document.getElementById("scholarly-file-select");

  const btnRunNih = document.getElementById("btn-run-nih");
  const inputNihKeyword = document.getElementById("nih-keyword");
  const inputNihLeads = document.getElementById("nih-leads");

  const btnRunBiorxiv = document.getElementById("btn-run-biorxiv");
  const btnStopPipeline = document.getElementById("btn-stop-pipeline");

  // Console Elements
  const terminalBody = document.getElementById("terminal-body");
  const consoleScriptLabel = document.getElementById("console-script-label");
  const progressBar = document.getElementById("pipeline-progress-bar");
  const chkAutoscroll = document.getElementById("chk-autoscroll");
  const btnClearConsole = document.getElementById("btn-clear-console");
  const btnCopyConsole = document.getElementById("btn-copy-console");
  const consoleLineCount = document.getElementById("console-line-count");
  const consoleElapsed = document.getElementById("console-elapsed");

  // Leads Explorer Elements
  const datasetSelect = document.getElementById("dataset-select");
  const leadsSearchInput = document.getElementById("leads-search-input");
  const filterPills = document.querySelectorAll(".filter-pill");
  const btnExportCsv = document.getElementById("btn-export-csv");
  const tableResultsCount = document.getElementById("table-results-count");
  const pageSizeSelect = document.getElementById("page-size-select");
  const leadsTableHead = document.getElementById("leads-table-head");
  const leadsTableBody = document.getElementById("leads-table-body");
  const btnPrevPage = document.getElementById("btn-prev-page");
  const btnNextPage = document.getElementById("btn-next-page");
  const pageNumbersContainer = document.getElementById("page-numbers-container");

  // Datasets Grid
  const datasetsGrid = document.getElementById("datasets-grid");

  // Modal
  const detailModal = document.getElementById("detail-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  // ---------------------------------------------------------------------------
  // Tab Navigation
  // ---------------------------------------------------------------------------
  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      switchTab(target);
    });
  });

  function switchTab(tabName) {
    currentTab = tabName;
    navTabs.forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === tabName));
    tabViews.forEach((v) => v.classList.toggle("active", v.id === `view-${tabName}`));

    const titleMap = {
      pipeline: "Scholarly Pipeline",
      nih: "NIH Grant PIs",
      explorer: "Leads Explorer",
      datasets: "Datasets Archive"
    };
    const titleEl = document.getElementById("topbar-view-title");
    if (titleEl && titleMap[tabName]) titleEl.textContent = titleMap[tabName];

    if (tabName === "explorer") {
      loadLeads();
    } else if (tabName === "datasets") {
      loadDatasetsArchive();
    }
  }

  // ---------------------------------------------------------------------------
  // Toast Notifications
  // ---------------------------------------------------------------------------
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Load Stats
  // ---------------------------------------------------------------------------
  async function fetchStats() {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) return;
      const data = await res.json();

      if (statCentral) statCentral.textContent = Number(data.central_master_leads || 0).toLocaleString();
      if (statToday) statToday.textContent = Number(data.today_verified_leads || 0).toLocaleString();
      if (statTodayDate) statTodayDate.textContent = data.today_date || "Today";
      if (statNih) statNih.textContent = Number(data.nih_leads_total || 0).toLocaleString();
      if (statPool) statPool.textContent = Number(data.master_pool_total || 0).toLocaleString();
      if (statPoolUnprocessed) statPoolUnprocessed.textContent = `${Number(data.master_pool_total || 0).toLocaleString()} Candidates`;

      // Trial metrics
      if (headerTrialText) {
        const days = data.trial_days_left !== undefined ? data.trial_days_left : 7.0;
        const used = data.today_verified_used || 0;
        const limit = data.today_verified_limit || 1000;
        headerTrialText.textContent = `${days} Days Left (${used}/${limit} Today)`;
      }
      if (statTrialDays) statTrialDays.textContent = `${data.trial_days_left !== undefined ? data.trial_days_left : 7.0} d`;
      if (statTrialQuota) {
        const limit = data.today_verified_limit || 1000;
        const used = data.today_verified_used || 0;
        statTrialQuota.textContent = `${Math.max(0, limit - used)} leads left`;
      }

      // Dynamic Candidate Pool State for Tool 02
      const queues = data.available_queues || [];
      const poolTotal = Number(data.master_pool_total || 0);

      if (poolTotal === 0 || queues.length === 0) {
        // Empty pool state: disable Tool 02
        if (poolEmptyAlert) poolEmptyAlert.style.display = "flex";
        if (poolActiveAlert) poolActiveAlert.style.display = "none";
        if (selectScholarlyFile) {
          selectScholarlyFile.disabled = true;
          selectScholarlyFile.innerHTML = '<option value="" disabled selected>No candidate pool available (Run Stage 1)</option>';
        }
        if (btnRunScholarly) btnRunScholarly.disabled = true;
        if (btnScholarlyLabel) btnScholarlyLabel.textContent = "Waiting for Stage 1 Extraction";
      } else {
        // Active pool state: enable Tool 02
        if (poolEmptyAlert) poolEmptyAlert.style.display = "none";
        if (poolActiveAlert) {
          poolActiveAlert.style.display = "flex";
          if (poolActiveText) {
            poolActiveText.innerHTML = `<strong>Pool Ready:</strong> ${poolTotal.toLocaleString()} candidates waiting for verified enrichment.`;
          }
        }
        if (selectScholarlyFile) {
          selectScholarlyFile.disabled = false;
          selectScholarlyFile.innerHTML = queues.map(q => 
            `<option value="${q.path}">${q.topic} (${Number(q.count).toLocaleString()} candidates)</option>`
          ).join("");
        }
        if (btnRunScholarly) btnRunScholarly.disabled = false;
        if (btnScholarlyLabel) btnScholarlyLabel.textContent = "Run Scholarly Enrichment";
      }
    } catch (e) {
      console.warn("Failed to fetch dashboard stats", e);
    }
  }

  // ---------------------------------------------------------------------------
  // Pipeline Execution & SSE Log Streaming
  // ---------------------------------------------------------------------------
  function connectLogStream() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource("/api/pipeline/stream");

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        // Heartbeat
        if (payload.type === "heartbeat") {
          updateProcessUIState(payload.status, payload.stage);
          return;
        }

        // Real log line
        appendLogLine(payload);
        if (payload.status) {
          updateProcessUIState(payload.status, payload.stage);
        }
      } catch (err) {
        console.error("Error parsing SSE log event", err);
      }
    };

    eventSource.onerror = () => {
      // Reconnect automatically
    };
  }

  function appendLogLine(entry) {
    // Remove welcome message on first incoming log line
    const welcome = terminalBody.querySelector(".terminal-welcome");
    if (welcome) welcome.remove();

    const line = document.createElement("div");
    line.className = "log-line";

    const text = entry.text || "";
    if (text.includes("COMPLETED:") || text.includes("✅") || text.includes("TARGET REACHED")) {
      line.classList.add("log-success");
    } else if (text.includes("WARNING:") || text.includes("⚠️") || text.includes("Rate limit")) {
      line.classList.add("log-warning");
    } else if (text.includes("ERROR:") || text.includes("❌") || text.includes("Failed")) {
      line.classList.add("log-error");
    } else if (text.includes("Starting") || text.includes("Fetching") || text.includes("Querying")) {
      line.classList.add("log-info");
    }

    line.innerHTML = `
      <span class="log-time">[${entry.time || ""}]</span>
      <span class="log-text">${escapeHtml(text)}</span>
    `;

    terminalBody.appendChild(line);
    lineCount++;
    consoleLineCount.textContent = `${lineCount} lines`;

    if (chkAutoscroll.checked) {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  }

  function updateProcessUIState(status, stage) {
    const isRunning = status === "running";
    if (btnStopPipeline) btnStopPipeline.disabled = !isRunning;
    if (progressBar) progressBar.classList.toggle("active", isRunning);

    if (systemStatusIndicator) {
      const pulse = systemStatusIndicator.querySelector(".pulse-dot");
      if (pulse) {
        pulse.className = isRunning ? "pulse-dot running" : "pulse-dot idle";
      }
    }

    if (systemStatusText) {
      if (isRunning) {
        systemStatusText.textContent = stage ? `Running: ${stage}` : "Running Pipeline";
      } else {
        systemStatusText.textContent = status === "completed" ? "Pipeline Completed" : "System Ready";
      }
    }

    if (consoleScriptLabel) {
      consoleScriptLabel.textContent = isRunning ? (stage || "Running") : (status === "completed" ? "Completed" : "Idle");
    }

    if (isRunning) {
      if (!runStartTime) {
        runStartTime = Date.now();
        startElapsedTimer();
      }
    } else {
      stopElapsedTimer();
      if (status === "completed") {
        fetchStats();
      }
    }
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    timerInterval = setInterval(() => {
      if (runStartTime) {
        const elapsedSec = Math.floor((Date.now() - runStartTime) / 1000);
        consoleElapsed.textContent = `Duration: ${elapsedSec}s`;
      }
    }, 1000);
  }

  function stopElapsedTimer() {
    if (timerInterval) clearInterval(timerInterval);
    runStartTime = null;
  }

  async function triggerRun(action, payload = {}) {
    try {
      updateProcessUIState("running", action);
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.detail || "Failed to start pipeline", "warning");
        updateProcessUIState("idle");
        return;
      }

      showToast(`Started: ${data.stage}`);
    } catch (e) {
      showToast(`Network error: ${e.message}`, "error");
      updateProcessUIState("idle");
    }
  }

  // Date mode switcher (Month / Year / Custom Range)
  if (selectDateMode) {
    selectDateMode.addEventListener("change", () => {
      const mode = selectDateMode.value;
      if (panelDateMonth) panelDateMonth.style.display = mode === "month" ? "flex" : "none";
      if (panelDateYear) panelDateYear.style.display = mode === "year" ? "flex" : "none";
      if (panelDateCustom) panelDateCustom.style.display = mode === "custom" ? "flex" : "none";
    });
  }

  // Bind Buttons
  btnRunOpenalex.addEventListener("click", () => {
    const keyword = inputOpenalexKeyword.value.trim() || "Physical Chemistry";
    const pages = parseInt(inputOpenalexPages.value) || 25;
    
    // Calculate From and To dates based on selected mode
    let fromDate = "2026-01-01";
    let toDate = "2026-01-31";
    const mode = selectDateMode ? selectDateMode.value : "month";

    if (mode === "month" && inputMonthSelect) {
      const ym = inputMonthSelect.value || "2026-01";
      fromDate = `${ym}-01`;
      const [y, m] = ym.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      toDate = `${ym}-${String(lastDay).padStart(2, "0")}`;
    } else if (mode === "year" && inputYearSelect) {
      const yr = inputYearSelect.value || "2026";
      fromDate = `${yr}-01-01`;
      toDate = `${yr}-12-31`;
    } else if (mode === "custom" && inputCustomFrom && inputCustomTo) {
      fromDate = inputCustomFrom.value || "2026-01-01";
      toDate = inputCustomTo.value || "2026-01-31";
    }

    triggerRun("openalex", { 
      keyword, 
      pages,
      from_date: fromDate,
      to_date: toDate
    });
  });

  btnRunScholarly.addEventListener("click", () => {
    const target = parseInt(inputScholarlyTarget.value) || 3000;
    const selectedFile = selectScholarlyFile ? selectScholarlyFile.value.trim() : "";
    triggerRun("scholarly", { target_leads: target, input_file: selectedFile });
  });

  if (btnRunNih) {
    btnRunNih.addEventListener("click", () => {
      const keyword = inputNihKeyword ? (inputNihKeyword.value.trim() || "cell biology") : "cell biology";
      const leads = inputNihLeads ? (parseInt(inputNihLeads.value) || 100) : 100;
      triggerRun("nih", { keyword, target_leads: leads });
    });
  }

  if (btnRunBiorxiv) {
    btnRunBiorxiv.addEventListener("click", () => {
      triggerRun("biorxiv");
    });
  }


  btnStopPipeline.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/pipeline/stop", { method: "POST" });
      const data = await res.json();
      showToast("Pipeline stopped", "warning");
      updateProcessUIState("stopped");
    } catch (e) {
      showToast("Failed to stop process", "error");
    }
  });

  btnClearConsole.addEventListener("click", () => {
    terminalBody.innerHTML = "";
    lineCount = 0;
    consoleLineCount.textContent = "0 lines";
  });

  btnCopyConsole.addEventListener("click", () => {
    const text = Array.from(terminalBody.querySelectorAll(".log-text"))
      .map((el) => el.innerText)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      showToast("Console logs copied to clipboard!");
    });
  });

  // ---------------------------------------------------------------------------
  // Leads Explorer & Data Table
  // ---------------------------------------------------------------------------
  async function loadDatasetsDropdown() {
    try {
      const res = await fetch("/api/datasets");
      if (!res.ok) return;
      const data = await res.json();

      datasetSelect.innerHTML = "";
      const datasets = data.datasets || [];

      if (datasets.length === 0) {
        datasetSelect.innerHTML = '<option value="">No CSV files found</option>';
        return;
      }

      datasets.forEach((ds) => {
        const opt = document.createElement("option");
        opt.value = ds.path;
        opt.textContent = `${ds.name} (${ds.size_kb} KB)`;
        datasetSelect.appendChild(opt);
      });

      // Default to central master leads or today's verified
      const preferred = datasets.find(
        (d) => d.name.includes("daily_verified") || d.name.includes("central_master")
      );
      if (preferred) {
        datasetSelect.value = preferred.path;
      }
      activeDataset = datasetSelect.value;

      // Populate Tool 02 Candidate Source File dropdown with rich counts
      if (selectScholarlyFile) {
        selectScholarlyFile.innerHTML = "";

        // 1. Topic Queues (*_needto_extract.csv and master pools)
        const queueFiles = datasets.filter(
          (d) => d.name.includes("_needto_extract") || d.name.includes("master_pool")
        );

        if (queueFiles.length > 0) {
          queueFiles.forEach((q) => {
            const opt = document.createElement("option");
            opt.value = q.path;
            const topic = q.topic || q.name.replace("_needto_extract.csv", "").replace("_", " ");
            if (q.total > 0) {
              opt.textContent = `⭐ ${topic} — ${q.total.toLocaleString()} total (${q.found.toLocaleString()} found | ${q.needto_extract.toLocaleString()} need to extract)`;
            } else {
              opt.textContent = `⭐ ${topic} (${q.name})`;
            }
            selectScholarlyFile.appendChild(opt);
          });
        } else {
          const defOpt = document.createElement("option");
          defOpt.value = "";
          defOpt.textContent = "⭐ Active Queue (Auto-detects latest needto_extract file)";
          selectScholarlyFile.appendChild(defOpt);
        }

        // 2. Individual Dated Candidate Extractions (data/YYYY-MM-DD/{Topic}_{Date}.csv)
        const extractions = datasets.filter(
          (d) => !queueFiles.includes(d) && 
                 !d.name.includes("_found_") && 
                 !d.name.includes("daily_verified") && 
                 !d.name.includes("central_master") &&
                 !d.name.includes("today_completed")
        );

        if (extractions.length > 0) {
          const optGroup = document.createElement("optgroup");
          optGroup.label = "Individual Dated Extractions";
          extractions.forEach((e) => {
            const opt = document.createElement("option");
            opt.value = e.path;
            if (e.total > 0) {
              opt.textContent = `📁 ${e.name} — ${e.total.toLocaleString()} candidates`;
            } else {
              opt.textContent = `📁 ${e.name} (${e.size_kb} KB)`;
            }
            optGroup.appendChild(opt);
          });
          selectScholarlyFile.appendChild(optGroup);
        }
      }

    } catch (e) {
      console.warn("Failed to load datasets list", e);
    }
  }


  datasetSelect.addEventListener("change", () => {
    activeDataset = datasetSelect.value;
    currentPage = 1;
    loadLeads();
  });

  leadsSearchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      currentSearch = e.target.value.trim();
      currentPage = 1;
      loadLeads();
    }, 300);
  });

  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentStatus = pill.getAttribute("data-status");
      currentPage = 1;
      loadLeads();
    });
  });

  pageSizeSelect.addEventListener("change", (e) => {
    currentPageSize = parseInt(e.target.value);
    currentPage = 1;
    loadLeads();
  });

  btnExportCsv.addEventListener("click", () => {
    if (!activeDataset) return;
    window.open(`/api/leads/export?file=${encodeURIComponent(activeDataset)}`, "_blank");
  });

  btnPrevPage.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadLeads();
    }
  });

  btnNextPage.addEventListener("click", () => {
    const maxPage = Math.ceil(totalLeadsCount / currentPageSize);
    if (currentPage < maxPage) {
      currentPage++;
      loadLeads();
    }
  });

  async function loadLeads() {
    leadsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading leads...</td></tr>`;

    try {
      const params = new URLSearchParams({
        file: activeDataset || "",
        search: currentSearch,
        status: currentStatus,
        page: currentPage,
        page_size: currentPageSize,
      });

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load leads");
      const data = await res.json();

      totalLeadsCount = data.total || 0;
      renderTable(data.leads || [], (currentPage - 1) * currentPageSize + 1);
      renderPagination(data.total || 0, currentPage, currentPageSize);

      tableResultsCount.textContent = `Showing ${Math.min(data.leads.length, currentPageSize)} of ${totalLeadsCount.toLocaleString()} leads (${data.current_file || "Dataset"})`;
    } catch (e) {
      leadsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state text-error">Failed to load dataset: ${e.message}</td></tr>`;
    }
  }

  function renderTable(leads, startIdx) {
    if (leads.length === 0) {
      leadsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">No matching researcher leads found.</td></tr>`;
      return;
    }

    leadsTableBody.innerHTML = "";
    leads.forEach((row, i) => {
      const name = row.researcher_name || row.full_name || row.author_name || "Unknown Author";
      const email = row.professional_email || row.email || "";
      const inst = row.affiliations_seen_on_matching_papers || row.organization || "Academic Institution";
      const topic = row.matched_search_terms || row.field_keyword || row.keyword || "cell biology";
      const award = row.award_amount || "";
      const statusRaw = row.review_status || row.email_status || (email ? "found" : "needs_review");

      let badgeClass = "needs-review";
      let badgeLabel = "Needs Review";

      if (statusRaw.includes("Verified") || statusRaw.includes("found")) {
        badgeClass = "verified";
        badgeLabel = "Verified";
      } else if (email) {
        badgeClass = "found";
        badgeLabel = "Email Attached";
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="color: var(--text-dim);">${startIdx + i}</td>
        <td class="cell-name">${escapeHtml(name)}</td>
        <td>
          ${email ? `
            <div class="email-pill-wrap">
              <span class="email-text">${escapeHtml(email)}</span>
              <button class="btn-copy" data-email="${escapeHtml(email)}" title="Copy email">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          ` : `<span style="color: var(--text-dim); font-style: italic;">No email found</span>`}
        </td>
        <td>${escapeHtml(inst ? inst.substring(0, 50) + (inst.length > 50 ? "..." : "") : "—")}</td>
        <td><span class="status-badge ${badgeClass}">${badgeLabel}</span></td>
        <td><span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(award ? `${topic} (${award})` : topic)}</span></td>
        <td>
          <button class="btn-sm btn-ghost btn-view-row" title="View details">Inspect</button>
        </td>
      `;

      // Copy email action
      const copyBtn = tr.querySelector(".btn-copy");
      if (copyBtn) {
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const em = copyBtn.getAttribute("data-email");
          navigator.clipboard.writeText(em).then(() => showToast(`Copied: ${em}`));
        });
      }

      // Inspect detail action
      tr.querySelector(".btn-view-row").addEventListener("click", () => openDetailModal(row));

      leadsTableBody.appendChild(tr);
    });
  }

  function renderPagination(total, page, pageSize) {
    const totalPages = Math.ceil(total / pageSize) || 1;
    btnPrevPage.disabled = page <= 1;
    btnNextPage.disabled = page >= totalPages;
    pageNumbersContainer.innerHTML = `<span class="page-current">Page ${page} of ${totalPages.toLocaleString()}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Row Detail Modal
  // ---------------------------------------------------------------------------
  function openDetailModal(row) {
    const name = row.researcher_name || row.full_name || "Researcher";
    modalTitle.textContent = name;
    modalBody.innerHTML = "";

    const entries = Object.entries(row);
    entries.forEach(([key, val]) => {
      if (!val) return;
      const div = document.createElement("div");
      div.className = "detail-row";
      div.innerHTML = `
        <span class="detail-label">${escapeHtml(key.replace(/_/g, " "))}</span>
        <span class="detail-value">${escapeHtml(String(val))}</span>
      `;
      modalBody.appendChild(div);
    });

    detailModal.classList.add("active");
  }

  modalCloseBtn.addEventListener("click", () => detailModal.classList.remove("active"));
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) detailModal.classList.remove("active");
  });

  // ---------------------------------------------------------------------------
  // Datasets Archive View
  // ---------------------------------------------------------------------------
  async function loadDatasetsArchive() {
    datasetsGrid.innerHTML = `<div class="empty-state">Scanning CSV files in data directory...</div>`;
    try {
      const res = await fetch("/api/datasets");
      if (!res.ok) throw new Error("Failed to list datasets");
      const data = await res.json();
      const list = data.datasets || [];

      if (list.length === 0) {
        datasetsGrid.innerHTML = `<div class="empty-state">No dataset CSVs generated yet.</div>`;
        return;
      }

      datasetsGrid.innerHTML = "";
      list.forEach((item) => {
        const card = document.createElement("div");
        card.className = "dataset-file-card";
        card.innerHTML = `
          <div class="dataset-file-header">
            <span class="dataset-file-icon">📊</span>
            <div class="dataset-file-info">
              <h4>${escapeHtml(item.name)}</h4>
              <span class="dataset-file-meta">${item.size_kb} KB • Modified ${item.modified}</span>
            </div>
          </div>
          <div class="dataset-file-actions">
            <button class="btn-sm btn-ghost btn-open-in-table" data-path="${item.path}">View Leads</button>
            <a href="/api/leads/export?file=${encodeURIComponent(item.path)}" target="_blank" class="btn-sm btn-secondary" style="text-decoration: none;">Download</a>
          </div>
        `;

        card.querySelector(".btn-open-in-table").addEventListener("click", () => {
          datasetSelect.value = item.path;
          activeDataset = item.path;
          currentPage = 1;
          switchTab("explorer");
        });

        datasetsGrid.appendChild(card);
      });
    } catch (e) {
      datasetsGrid.innerHTML = `<div class="empty-state text-error">Failed: ${e.message}</div>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  btnRefreshAll.addEventListener("click", () => {
    fetchStats();
    loadDatasetsDropdown();
    if (currentTab === "explorer") loadLeads();
    if (currentTab === "datasets") loadDatasetsArchive();
    showToast("Dashboard metrics refreshed");
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  fetchStats();
  connectLogStream();
  loadDatasetsDropdown();
});
