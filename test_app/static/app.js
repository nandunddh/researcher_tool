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

  // Datasets Grid & Storage Bar
  const datasetsGrid = document.getElementById("datasets-grid");
  const archiveDataFolderPath = document.getElementById("archive-data-folder-path");
  const btnChangeDataFolder = document.getElementById("btn-change-data-folder");
  const datasetTopicSearch = document.getElementById("dataset-topic-search");
  const datasetDateFilter = document.getElementById("dataset-date-filter");
  const btnRefreshDatasets = document.getElementById("btn-refresh-datasets");

  let allDatasets = [];
  let currentLeadDataDir = "";
  let activeTopicFilter = "";
  let activeDateFilter = "all";

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
      pipeline: "Dashboard",
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
    if (btnStopPipeline) {
      btnStopPipeline.disabled = !isRunning;
      btnStopPipeline.style.display = isRunning ? "inline-flex" : "none";
    }
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
    if (timerInterval) clearInterval(timerInterval);
    if (!runStartTime) runStartTime = Date.now();
    timerInterval = setInterval(() => {
      if (runStartTime && consoleElapsed) {
        const elapsedSec = Math.floor((Date.now() - runStartTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        const formatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        consoleElapsed.textContent = `Duration: ${formatted}`;
      }
    }, 1000);
  }

  function stopElapsedTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
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
      const leadsList = data.leads || data.rows || [];
      renderTable(leadsList, (currentPage - 1) * currentPageSize + 1);
      renderPagination(data.total || 0, currentPage, currentPageSize);

      if (tableResultsCount) {
        tableResultsCount.textContent = `Showing ${Math.min(leadsList.length, currentPageSize)} of ${totalLeadsCount.toLocaleString()} leads (${data.current_file || data.file || "Dataset"})`;
      }
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
        <td style="text-align: center; color: var(--text-dim); font-size: 0.8rem;">${startIdx + i}</td>
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
        <td style="text-align: center;">
          <button class="btn-view-profile btn-view-row" title="View researcher full profile">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>View Profile</span>
          </button>
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

    detailModal.style.display = "flex";
    detailModal.classList.add("active");
  }

  function closeDetailModal() {
    detailModal.classList.remove("active");
    detailModal.style.display = "none";
  }

  modalCloseBtn.addEventListener("click", closeDetailModal);
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) closeDetailModal();
  });

  // ---------------------------------------------------------------------------
  // Datasets Archive View
  // ---------------------------------------------------------------------------
  if (btnRefreshDatasets) {
    btnRefreshDatasets.addEventListener("click", () => {
      loadDatasetsArchive();
    });
  }

  if (datasetTopicSearch) {
    datasetTopicSearch.addEventListener("input", (e) => {
      activeTopicFilter = e.target.value.trim().toLowerCase();
      renderDatasetsGrid();
    });
  }

  if (datasetDateFilter) {
    datasetDateFilter.addEventListener("change", (e) => {
      activeDateFilter = e.target.value;
      renderDatasetsGrid();
    });
  }

  if (btnChangeDataFolder) {
    btnChangeDataFolder.addEventListener("click", async () => {
      const current = currentLeadDataDir || "C:\\SciProspect Data";
      const userChoice = prompt("Enter the new Lead Data Folder directory path:\n(SciProspect will save and search all lead datasets in this folder)", current);
      if (userChoice && userChoice.trim() && userChoice.trim() !== current) {
        try {
          const res = await fetch("/api/config/data-dir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data_dir: userChoice.trim() })
          });
          const resData = await res.json();
          if (res.ok) {
            showToast("Lead Data Folder updated successfully!", "success");
            loadDatasetsArchive();
            fetchStats();
            loadDatasetSelect();
          } else {
            showToast(resData.detail || "Failed to update folder", "error");
          }
        } catch (err) {
          showToast(`Error: ${err.message}`, "error");
        }
      }
    });
  }

  async function loadDatasetsArchive() {
    datasetsGrid.innerHTML = `<div class="empty-state">Scanning lead datasets...</div>`;
    try {
      const res = await fetch("/api/datasets");
      if (!res.ok) throw new Error("Failed to list datasets");
      const data = await res.json();
      allDatasets = data.datasets || [];
      currentLeadDataDir = data.data_dir || "";

      if (archiveDataFolderPath) {
        archiveDataFolderPath.textContent = currentLeadDataDir || "Documents/SciProspect Data";
        archiveDataFolderPath.title = currentLeadDataDir;
      }

      // Populate distinct dates in Date filter dropdown
      if (datasetDateFilter) {
        const prevSelected = activeDateFilter;
        const distinctDates = Array.from(new Set(allDatasets.map(d => d.date).filter(Boolean))).sort().reverse();
        datasetDateFilter.innerHTML = `<option value="all">All Dates</option>`;
        distinctDates.forEach(d => {
          const opt = document.createElement("option");
          opt.value = d;
          opt.textContent = `📅 ${d}`;
          if (d === prevSelected) opt.selected = true;
          datasetDateFilter.appendChild(opt);
        });
        if (datasetDateFilter.value) {
          activeDateFilter = datasetDateFilter.value;
        }
      }

      renderDatasetsGrid();
    } catch (e) {
      datasetsGrid.innerHTML = `<div class="empty-state text-error">Failed: ${e.message}</div>`;
    }
  }

  function renderDatasetsGrid() {
    if (allDatasets.length === 0) {
      datasetsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 2.8rem 1.5rem; text-align: center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" style="margin: 0 auto 0.75rem auto; display: block;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <h4 style="font-size: 1.05rem; font-weight: 600; color: #0f172a; margin-bottom: 0.35rem;">Lead Data Folder is Empty</h4>
          <p style="color: #64748b; font-size: 0.85rem; max-width: 480px; margin: 0 auto;">No lead datasets or candidate queues found in your folder yet. Run OpenAlex Discovery or NIH Extraction to generate researcher datasets.</p>
        </div>
      `;
      return;
    }

    // Filter by Topic and Date
    const filtered = allDatasets.filter((item) => {
      // 1. Topic filter
      if (activeTopicFilter) {
        const tMatch = (item.topic || "").toLowerCase().includes(activeTopicFilter);
        const nMatch = (item.name || "").toLowerCase().includes(activeTopicFilter);
        if (!tMatch && !nMatch) return false;
      }
      // 2. Date filter
      if (activeDateFilter && activeDateFilter !== "all") {
        if (item.date !== activeDateFilter) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      datasetsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 2.2rem 1rem; text-align: center;">
          <p style="color: #64748b; font-size: 0.88rem;">No datasets found matching your search criteria.</p>
        </div>
      `;
      return;
    }

    datasetsGrid.innerHTML = "";
    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = "dataset-card";
      const topicLabel = item.topic || "General";
      const dateLabel = item.date || "";

      card.innerHTML = `
        <div class="dataset-card-top">
          <div class="dataset-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div class="dataset-details">
            <h4 class="dataset-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h4>
            <div class="dataset-meta-row" style="margin-top: 0.35rem; margin-bottom: 0.25rem;">
              <span class="badge-topic">${escapeHtml(topicLabel)}</span>
              ${dateLabel ? `<span class="chip-date">📅 ${escapeHtml(dateLabel)}</span>` : ""}
            </div>
            <div class="dataset-meta-row">
              <span class="meta-tag meta-size">${item.size_kb} KB</span>
              <span class="meta-sep">•</span>
              <span class="meta-date">Modified ${item.modified}</span>
            </div>
          </div>
        </div>
        <div class="dataset-actions-row">
          <button class="btn-action btn-open-leads btn-open-in-table" data-path="${item.path}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            <span>View Leads</span>
          </button>
          <a href="/api/leads/export?file=${encodeURIComponent(item.path)}" target="_blank" class="btn-action btn-download-leads">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download</span>
          </a>
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

  // ---------------------------------------------------------------------------
  // Startup Splash Screen & Progress Bar Animation
  // ---------------------------------------------------------------------------
  function initSplashScreen() {
    const splash = document.getElementById("app-splash");
    const bar = document.getElementById("splash-progress-bar");
    const statusText = document.getElementById("splash-status-text");
    const percentText = document.getElementById("splash-percent-text");

    if (!splash || !bar) return;

    const stages = [
      { pct: 15, msg: "Initializing SciProspect Desktop Engine..." },
      { pct: 38, msg: "Connecting to OpenAlex & CrossRef Scholar APIs..." },
      { pct: 68, msg: "Connecting to Europe PMC & ORCID validation network..." },
      { pct: 88, msg: "Synchronizing SQLite Central Leads Repository..." },
      { pct: 100, msg: "Lead Intelligence Suite Ready!" }
    ];

    let currentStageIndex = 0;

    function advanceStage() {
      if (currentStageIndex >= stages.length) {
        setTimeout(() => {
          splash.classList.add("fade-out");
          setTimeout(() => {
            if (splash.parentNode) splash.remove();
          }, 600);
        }, 220);
        return;
      }

      const stage = stages[currentStageIndex];
      bar.style.width = `${stage.pct}%`;
      if (percentText) percentText.textContent = `${stage.pct}%`;
      if (statusText) statusText.textContent = stage.msg;

      currentStageIndex++;
      const nextDelay = currentStageIndex === stages.length ? 320 : Math.floor(Math.random() * 140) + 240;
      setTimeout(advanceStage, nextDelay);
    }

    // Start progression smoothly after initial paint
    setTimeout(advanceStage, 80);
  }

  btnRefreshAll.addEventListener("click", () => {
    fetchStats();
    loadDatasetsDropdown();
    if (currentTab === "explorer") loadLeads();
    if (currentTab === "datasets") loadDatasetsArchive();
    showToast("Dashboard metrics refreshed");
  });

  // ---------------------------------------------------------------------------
  // Desktop Menubar & Data Management Actions
  // ---------------------------------------------------------------------------
  const menubarItems = document.querySelectorAll(".menubar-item");
  menubarItems.forEach(item => {
    const btn = item.querySelector(".menubar-btn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = item.classList.contains("open");
      menubarItems.forEach(i => i.classList.remove("open"));
      if (!isOpen) item.classList.add("open");
    });
  });

  document.addEventListener("click", () => {
    menubarItems.forEach(i => i.classList.remove("open"));
  });

  function showInfoModal(title, contentHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = contentHtml;
    detailModal.style.display = "flex";
    detailModal.classList.add("active");
  }
  window.closeDetailModal = closeDetailModal;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && detailModal && detailModal.classList.contains("active")) {
      closeDetailModal();
    }
  });

  async function openDataFolderInExplorer() {
    try {
      const res = await fetch("/api/open-folder", { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        showToast("Opened data folder in Windows Explorer");
      } else {
        showToast(data.error || "Failed to open folder", "error");
      }
    } catch (e) {
      showToast(`Network error: ${e.message}`, "error");
    }
  }

  async function executeMergeDeduplicate() {
    showToast("Scanning datasets, normalizing emails & merging...", "info");
    try {
      const res = await fetch("/api/leads/merge-deduplicate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to merge datasets");

      fetchStats();
      loadDatasetsDropdown();
      if (currentTab === "datasets") loadDatasetsArchive();

      showInfoModal(
        "Lead Deduplication & Merger Complete",
        `
        <div style="padding: 0.5rem 0;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 1rem; margin-bottom: 1.25rem;">
            <h4 style="color: #15803d; margin: 0 0 0.4rem 0; font-size: 1rem;">✔ All Datasets Unified Successfully</h4>
            <p style="color: #166534; font-size: 0.85rem; margin: 0;">Unique verified researcher leads have been compiled into <strong>central_master_leads.csv</strong> with 0% duplicates.</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1.25rem;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem;">
              <div style="font-size: 0.75rem; color: #64748b;">Datasets Scanned</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #0f172a;">${data.files_scanned} files</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem;">
              <div style="font-size: 0.75rem; color: #64748b;">Total Leads Analyzed</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #0f172a;">${data.total_leads_scanned.toLocaleString()}</div>
            </div>
            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 0.75rem;">
              <div style="font-size: 0.75rem; color: #e11d48;">Duplicates Removed</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #be123c;">${data.duplicates_removed.toLocaleString()}</div>
            </div>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 0.75rem;">
              <div style="font-size: 0.75rem; color: #0284c7;">Net Unique Master Leads</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #0369a1;">${data.unique_master_leads.toLocaleString()}</div>
            </div>
          </div>
          <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
            <button class="btn btn-secondary" onclick="document.getElementById('detail-modal').classList.remove('active')">Close</button>
            <button class="btn btn-primary" id="btn-modal-view-master">View Master in Explorer</button>
          </div>
        </div>
        `
      );

      const btnViewMaster = document.getElementById("btn-modal-view-master");
      if (btnViewMaster) {
        btnViewMaster.addEventListener("click", () => {
          detailModal.classList.remove("active");
          datasetSelect.value = "central_master_leads.csv";
          activeDataset = "central_master_leads.csv";
          currentPage = 1;
          switchTab("explorer");
        });
      }
    } catch (err) {
      showToast(`Deduplication error: ${err.message}`, "error");
    }
  }

  // Hook Menu Actions
  const menuOpenFolder = document.getElementById("menu-open-folder");
  if (menuOpenFolder) menuOpenFolder.addEventListener("click", openDataFolderInExplorer);

  const btnOpenArchive = document.getElementById("btn-open-explorer-archive");
  if (btnOpenArchive) btnOpenArchive.addEventListener("click", openDataFolderInExplorer);

  const menuChangeFolder = document.getElementById("menu-change-folder");
  if (menuChangeFolder) {
    menuChangeFolder.addEventListener("click", () => {
      switchTab("datasets");
      if (btnChangeDataFolder) btnChangeDataFolder.click();
    });
  }

  const menuExportMaster = document.getElementById("menu-export-master");
  if (menuExportMaster) {
    menuExportMaster.addEventListener("click", () => {
      window.open("/api/leads/export?file=central_master_leads.csv", "_blank");
    });
  }

  // Navigation Menus
  const menuNavStage1 = document.getElementById("menu-nav-stage1");
  if (menuNavStage1) menuNavStage1.addEventListener("click", () => switchTab("pipeline"));

  const menuNavStage2 = document.getElementById("menu-nav-stage2");
  if (menuNavStage2) menuNavStage2.addEventListener("click", () => switchTab("pipeline"));

  const menuNavNih = document.getElementById("menu-nav-nih");
  if (menuNavNih) menuNavNih.addEventListener("click", () => switchTab("nih"));

  const menuStopPipeline = document.getElementById("menu-stop-pipeline");
  if (menuStopPipeline && btnStopPipeline) {
    menuStopPipeline.addEventListener("click", () => btnStopPipeline.click());
  }

  // Data & Tools
  const menuMergeDedup = document.getElementById("menu-merge-dedup");
  if (menuMergeDedup) menuMergeDedup.addEventListener("click", executeMergeDeduplicate);

  const btnMergeDedupExplorer = document.getElementById("btn-merge-dedup-explorer");
  if (btnMergeDedupExplorer) btnMergeDedupExplorer.addEventListener("click", executeMergeDeduplicate);

  const btnMergeDedupArchive = document.getElementById("btn-merge-dedup-archive");
  if (btnMergeDedupArchive) btnMergeDedupArchive.addEventListener("click", executeMergeDeduplicate);

  const menuClearLogs = document.getElementById("menu-clear-logs");
  if (menuClearLogs && btnClearConsole) menuClearLogs.addEventListener("click", () => btnClearConsole.click());

  // Check Data & Duplicate Stats Modal
  const menuCheckStats = document.getElementById("menu-check-stats");
  if (menuCheckStats) {
    menuCheckStats.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        showInfoModal(
          "Data Analysis & Storage Summary",
          `
          <div style="padding: 0.5rem 0;">
            <p style="font-size: 0.85rem; color: #64748b; margin-top: 0;">Overview of your lead pipeline metrics, active datasets, and storage paths.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
              <div style="font-size: 0.72rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Lead Storage Location</div>
              <div style="font-size: 0.88rem; font-weight: 600; color: #0284c7; word-break: break-all; margin-top: 0.25rem;">${escapeHtml(data.data_dir)}</div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1.25rem;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem;">
                <div style="font-size: 0.72rem; color: #64748b;">Verified Leads Today</div>
                <div style="font-size: 1.2rem; font-weight: 700; color: #0f172a;">${Number(data.today_verified_leads || 0).toLocaleString()}</div>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem;">
                <div style="font-size: 0.72rem; color: #64748b;">Central Master Leads</div>
                <div style="font-size: 1.2rem; font-weight: 700; color: #0f172a;">${Number(data.central_master_leads || 0).toLocaleString()}</div>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem;">
                <div style="font-size: 0.72rem; color: #64748b;">Candidate Discovery Pool</div>
                <div style="font-size: 1.2rem; font-weight: 700; color: #0f172a;">${Number(data.master_pool_total || 0).toLocaleString()}</div>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem;">
                <div style="font-size: 0.72rem; color: #64748b;">Today's Verified Quota</div>
                <div style="font-size: 1.2rem; font-weight: 700; color: #0f172a;">${data.today_verified_used || 0} / ${data.today_verified_limit || 1000}</div>
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button class="btn btn-secondary" onclick="document.getElementById('detail-modal').classList.remove('active')">Close</button>
              <button class="btn btn-primary" id="btn-stats-open-folder">Open Data Folder</button>
            </div>
          </div>
          `
        );
        const btnOpen = document.getElementById("btn-stats-open-folder");
        if (btnOpen) btnOpen.addEventListener("click", openDataFolderInExplorer);
      } catch (e) {
        showToast("Failed to fetch data stats", "error");
      }
    });
  }

  // Help Menu Modals
  const menuHelpLicense = document.getElementById("menu-help-license");
  if (menuHelpLicense) {
    menuHelpLicense.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/trial/status");
        const st = await res.json();
        showInfoModal(
          "Evaluation License & Quotas",
          `
          <div style="padding: 0.5rem 0;">
            <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
              <div style="font-size: 0.85rem; font-weight: 700; color: #854d0e;">Evaluation Edition (7-Day Trial)</div>
              <div style="font-size: 0.78rem; color: #a16207; margin-top: 0.2rem;">Full-featured evaluation license with 1,000 verified leads per day.</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">Trial Days Remaining:</span>
                <span style="font-weight: 700; color: #0f172a;">${st.days_left} Days</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">Expiration Date:</span>
                <span style="font-weight: 600; color: #0f172a;">${st.expires_on}</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">Daily Verified Quota:</span>
                <span style="font-weight: 600; color: #0f172a;">1,000 Verified Leads / Day</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">Used Today:</span>
                <span style="font-weight: 600; color: #0284c7;">${st.today_verified} / 1,000</span>
              </div>
            </div>
          </div>
          `
        );
      } catch (e) {
        showToast("Failed to fetch license details", "error");
      }
    });
  }

  const menuHelpGuide = document.getElementById("menu-help-guide");
  if (menuHelpGuide) {
    menuHelpGuide.addEventListener("click", () => {
      showInfoModal(
        "SciProspect Quickstart Guide",
        `
        <div style="padding: 0.5rem 0; font-size: 0.85rem; line-height: 1.5; color: #334155;">
          <h4 style="color: #0f172a; margin: 0 0 0.4rem 0;">Two-Stage Scientific Prospecting Workflow</h4>
          <ol style="padding-left: 1.25rem; margin-bottom: 1rem;">
            <li style="margin-bottom: 0.4rem;"><strong>Stage 01: OpenAlex Discovery</strong> — Scans worldwide scientific research papers for your target keyword/topic and populates a candidate author pool.</li>
            <li style="margin-bottom: 0.4rem;"><strong>Stage 02: Scholarly Verification</strong> — Cross-references candidate names against official ORCID profiles and Europe PMC records to extract validated institutional emails.</li>
            <li style="margin-bottom: 0.4rem;"><strong>Leads Explorer</strong> — Search, filter, and inspect verified contacts. Use <em>Merge & Deduplicate</em> to unify separate searches with 0% duplicates.</li>
          </ol>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem;">
            <strong>Data Storage:</strong> All CSV files are saved in your chosen folder without cluttering the app install directory.
          </div>
        </div>
        `
      );
    });
  }

  const menuHelpAbout = document.getElementById("menu-help-about");
  if (menuHelpAbout) {
    menuHelpAbout.addEventListener("click", () => {
      showInfoModal(
        "About SciProspect",
        `
        <div style="padding: 0.5rem 0; text-align: center;">
          <div style="font-size: 1.2rem; font-weight: 700; color: #0f172a; margin-bottom: 0.25rem;">SciProspect Lead Intelligence</div>
          <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 1rem;">Version 1.0 (Evaluation Edition)</div>
          <p style="font-size: 0.85rem; color: #334155; line-height: 1.5; margin-bottom: 1rem;">
            AI-driven scientific researcher extraction, ORCID profile resolution, and verified institutional email prospecting system.
          </p>
          <div style="font-size: 0.75rem; color: #94a3b8;">
            © 2026 SciProspect Lead Intelligence. All rights reserved.
          </div>
        </div>
        `
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Auto-Updater Flow
  // ---------------------------------------------------------------------------
  async function checkForUpdates(isManual = false) {
    if (isManual) showToast("Checking for updates...", "info");
    try {
      const res = await fetch("/api/update/check");
      const info = await res.json();

      if (!res.ok || info.error) {
        if (isManual) showToast(info.error || "Failed to check for updates", "warning");
        return;
      }

      if (!info.update_available) {
        if (isManual) {
          showInfoModal(
            "SciProspect is Up to Date",
            `
            <div style="padding: 0.5rem 0; text-align: center;">
              <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🎉</div>
              <h4 style="color: #0f172a; margin: 0 0 0.5rem 0;">You have the latest version!</h4>
              <p style="color: #64748b; font-size: 0.85rem; margin: 0 0 1.25rem 0;">SciProspect <strong>v${escapeHtml(info.current_version)}</strong> is currently the newest release.</p>
              <button class="btn btn-primary" onclick="closeDetailModal()">Got it</button>
            </div>
            `
          );
        }
        return;
      }

      // Update is available!
      const changelogHtml = (info.changelog || [])
        .map(item => `<li style="margin-bottom: 0.35rem;">${escapeHtml(item)}</li>`)
        .join("");

      showInfoModal(
        `✨ New Update Available: v${info.latest_version}`,
        `
        <div style="padding: 0.5rem 0;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
            <div style="font-size: 0.85rem; font-weight: 700; color: #15803d;">SciProspect v${escapeHtml(info.latest_version)} is ready to install!</div>
            <div style="font-size: 0.78rem; color: #166534; margin-top: 0.2rem;">Current version: v${escapeHtml(info.current_version)} ${info.release_date ? `• Released: ${escapeHtml(info.release_date)}` : ""}</div>
          </div>

          <h5 style="margin: 0 0 0.4rem 0; font-size: 0.85rem; color: #334155;">What's New in this release:</h5>
          <ul style="padding-left: 1.2rem; font-size: 0.82rem; color: #475569; margin: 0 0 1.25rem 0; line-height: 1.45;">
            ${changelogHtml || "<li>Performance optimizations and bug fixes.</li>"}
          </ul>

          <div id="update-progress-wrap" style="display: none; margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #64748b; margin-bottom: 0.35rem;">
              <span id="update-status-msg">Downloading update...</span>
              <span id="update-percent-label">0%</span>
            </div>
            <div style="height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
              <div id="update-download-bar" style="height: 100%; width: 0%; background: #0284c7; transition: width 0.2s ease;"></div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button class="btn btn-secondary" id="btn-cancel-update" onclick="closeDetailModal()">Later</button>
            <button class="btn btn-primary" id="btn-start-download-update">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download & Install Update</span>
            </button>
          </div>
        </div>
        `
      );

      const btnDownload = document.getElementById("btn-start-download-update");
      const progressWrap = document.getElementById("update-progress-wrap");
      const progressBar = document.getElementById("update-download-bar");
      const percentLabel = document.getElementById("update-percent-label");
      const statusMsg = document.getElementById("update-status-msg");

      if (btnDownload) {
        btnDownload.addEventListener("click", async () => {
          btnDownload.disabled = true;
          if (progressWrap) progressWrap.style.display = "block";

          const dlRes = await fetch("/api/update/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ download_url: info.download_url })
          });

          if (!dlRes.ok) {
            showToast("Failed to start update download", "error");
            btnDownload.disabled = false;
            return;
          }

          const pollTimer = setInterval(async () => {
            const pRes = await fetch("/api/update/progress");
            const pData = await pRes.json();

            if (progressBar) progressBar.style.width = `${pData.percent}%`;
            if (percentLabel) percentLabel.textContent = `${pData.percent}%`;

            if (pData.status === "ready") {
              clearInterval(pollTimer);
              if (statusMsg) statusMsg.textContent = "Download complete! Ready to install.";
              btnDownload.disabled = false;
              btnDownload.innerHTML = `<span>Launch Installer & Upgrade</span>`;
              btnDownload.onclick = async () => {
                showToast("Launching installer... SciProspect will close to complete the update.");
                await fetch("/api/update/install", { method: "POST" });
              };
            } else if (pData.status === "error") {
              clearInterval(pollTimer);
              if (statusMsg) statusMsg.textContent = `Download failed: ${pData.error}`;
              btnDownload.disabled = false;
            }
          }, 600);
        });
      }

    } catch (e) {
      if (isManual) showToast(`Update check failed: ${e.message}`, "error");
    }
  }

  const menuHelpUpdate = document.getElementById("menu-help-update");
  if (menuHelpUpdate) {
    menuHelpUpdate.addEventListener("click", () => checkForUpdates(true));
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  initSplashScreen();
  fetchStats();
  connectLogStream();
  loadDatasetsDropdown();
});

