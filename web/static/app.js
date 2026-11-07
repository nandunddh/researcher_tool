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
      if (tab.getAttribute("target") === "_blank") return;
      const target = tab.getAttribute("data-tab");
      switchTab(target);
    });
  });

  function switchTab(tabName, updateHistory = true) {
    currentTab = tabName;
    const studioCreateAction = document.getElementById('btn-open-create-site-modal');
    if (studioCreateAction) studioCreateAction.hidden = tabName !== 'builder';
    try { sessionStorage.setItem("scip_active_tab", tabName); } catch (e) {}
    navTabs.forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === tabName));
    tabViews.forEach((v) => {
      const isActive = (v.id === `view-${tabName}`);
      v.classList.toggle("active", isActive);
      v.style.display = isActive ? "block" : "none";
    });

    const titleMap = {
      pipeline: "Dashboard",
      nih: "NIH Grant PIs",
      explorer: "Leads Explorer",
      datasets: "Datasets Archive",
      builder: "SciStudio Websites"
    };
    const titleEl = document.getElementById("topbar-view-title");
    if (titleEl && titleMap[tabName]) titleEl.textContent = titleMap[tabName];

    const badgeEl = document.getElementById("view-context-badge");
    if (badgeEl) {
      const badgeMap = {
        pipeline: "Research workspace",
        nih: "NIH Grant Intelligence",
        explorer: "Verified Lead Database",
        datasets: "Data Archives & Exports",
        builder: "SciStudio Drag-and-Drop Publishing"
      };
      badgeEl.textContent = badgeMap[tabName] || "Scientific Platform";
    }

    // Clean SPA Browser URL Routing
    if (updateHistory) {
      const routeMap = {
        pipeline: "/dashboard",
        builder: "/scistudio",
        nih: "/nih",
        explorer: "/explorer",
        datasets: "/datasets"
      };
      const newPath = routeMap[tabName] || "/dashboard";
      if (window.location.pathname !== newPath) {
        window.history.pushState({ tab: tabName }, "", newPath);
      }
    }

    if (tabName === "explorer") {
      loadLeads();
    } else if (tabName === "datasets") {
      loadDatasetsArchive();
    } else if (tabName === "nih") {
      loadNihLeads();
    } else if (tabName === "builder") {
      const u = window.currentUser;
      const hasAccess = !!(u && (u.is_admin || u.scistudio_access !== false));
      const lockedView = document.getElementById("scistudio-locked-view");
      const dashView = document.getElementById("builder-dashboard-view");
      const studioView = document.getElementById("builder-studio-view");

      if (!hasAccess && u && !u.is_admin) {
        if (lockedView) lockedView.style.display = "block";
        if (dashView) dashView.style.display = "none";
        if (studioView) studioView.style.display = "none";
        return;
      } else {
        if (lockedView) lockedView.style.display = "none";
      }
      fetchBuilderSites();
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

      // Trial / License metrics: ONLY display trial card for Trial users, hide for Pro
      const trialPill = document.getElementById("header-trial-pill");
      const isTrial = !!(data.is_trial === true);
      if (trialPill) {
        if (isTrial) {
          trialPill.style.display = "block";
          if (headerTrialText) {
            const days = data.trial_days_left !== undefined ? data.trial_days_left : "7";
            const used = data.today_verified_used || 0;
            const limit = data.today_verified_limit || 1000;
            headerTrialText.textContent = `${days} Days Left (${used}/${limit} Today)`;
          }
        } else {
          trialPill.style.display = "none";
        }
      }
      if (statTrialDays) {
        statTrialDays.textContent = (data.is_trial === false || data.trial_days_left === "Unlimited") ? "Lifetime" : `${data.trial_days_left !== undefined ? data.trial_days_left : 7.0} d`;
      }
      if (statTrialQuota) {
        if (data.is_trial === false || data.trial_days_limit === "Unlimited") {
          statTrialQuota.textContent = "Unlimited Leads";
        } else {
          const limit = data.today_verified_limit || 1000;
          const used = data.today_verified_used || 0;
          statTrialQuota.textContent = `${Math.max(0, limit - used)} leads left`;
        }
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

      const footerStoragePath = document.getElementById("footer-storage-path");
      if (footerStoragePath) {
        footerStoragePath.textContent = "Cloud Database Connected";
      }
      const footerVersionDisplay = document.getElementById("footer-version-display");
      if (footerVersionDisplay) {
        footerVersionDisplay.textContent = "SciProspect & SciStudio v2.0";
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

        // Heartbeat (silent keep-alive, no UI re-render)
        if (payload.type === "heartbeat") {
          return;
        }

        // Real log line
        appendLogLine(payload);

        // Live UI Progress Bar & ETA Updater
        if (payload.text) {
          const pm = payload.text.match(/\[(\d+)\/(\d+)\s*\|\s*([\d\.]+)%\](?:\s*\[Elapsed:\s*([^\|\]]+)\|\s*ETA:\s*([^\|\]]+)\|\s*([^\|\]]+)\])?/);
          if (pm) {
            const cur = pm[1];
            const tot = pm[2];
            const pct = parseFloat(pm[3]);
            const elapsed = pm[4] ? pm[4].trim() : '';
            const eta = pm[5] ? pm[5].trim() : '';
            const spd = pm[6] ? pm[6].trim() : '';

            const pBar = document.getElementById('pipeline-progress-bar');
            if (pBar) {
              pBar.style.width = pct + '%';
              if (pct >= 100) pBar.classList.add('completed');
              else pBar.classList.remove('completed');
            }

            const pBadge = document.getElementById('progress-percent-badge');
            if (pBadge) pBadge.textContent = pct.toFixed(1) + '%';

            const pCount = document.getElementById('progress-leads-count');
            if (pCount) pCount.textContent = cur + ' / ' + tot + ' Leads';

            const pSpeed = document.getElementById('progress-speed-pill');
            if (pSpeed && spd) pSpeed.textContent = '⚡ Speed: ' + spd;

            const pElapsed = document.getElementById('progress-elapsed-pill');
            if (pElapsed && elapsed) pElapsed.textContent = '⏱️ Elapsed: ' + elapsed;

            const pEta = document.getElementById('progress-eta-pill');
            if (pEta && eta) {
              pEta.textContent = pct >= 100 ? '✓ Target Reached' : '⏳ ETA: ' + eta;
            }
          }
        }
        if (payload.text && payload.text.startsWith("COLLECTION_RESULT ")) {
          const result = JSON.parse(payload.text.slice("COLLECTION_RESULT ".length));
          const box = document.getElementById("collection-result");
          if (box) {
            box.hidden = false;
            box.textContent = `${result.collected} / ${result.target} contacts collected. ` + (result.shortfall ? `${result.shortfall} fewer than requested. ` : "Target reached. ");
            const link = document.createElement("a");
            link.href = `/api/leads/export?file=${encodeURIComponent(result.file)}`;
            link.textContent = "Download CSV";
            link.setAttribute("download", "");
            box.appendChild(link);
          }
          const count = document.getElementById("progress-leads-count");
          if (count) count.textContent = `${result.collected} / ${result.target} Contacts`;
          const bar = document.getElementById("pipeline-progress-bar");
          if (bar) bar.style.width = `${100 * result.collected / result.target}%`;
          fetchStats();
          loadDatasetsDropdown();
        }
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

    // Live UI Progress Bar & ETA Badges Updater
    const pm = text.match(/\[(\d+)\/(\d+)\s*\|\s*([\d\.]+)%\](?:\s*\[Elapsed:\s*([^\|\]]+)\|\s*ETA:\s*([^\|\]]+)\|\s*([^\|\]]+)\])?/);
    if (pm) {
      const cur = pm[1];
      const tot = pm[2];
      const pct = parseFloat(pm[3]);
      const elapsed = pm[4] ? pm[4].trim() : "";
      const eta = pm[5] ? pm[5].trim() : "";
      const spd = pm[6] ? pm[6].trim() : "";

      const pBar = document.getElementById("pipeline-progress-bar");
      if (pBar) {
        pBar.style.width = `${pct}%`;
        if (pct >= 100) pBar.classList.add("completed");
        else pBar.classList.remove("completed");
      }

      const pBadge = document.getElementById("progress-percent-badge");
      if (pBadge) pBadge.textContent = `${pct.toFixed(1)}%`;

      const pCount = document.getElementById("progress-leads-count");
      if (pCount) pCount.textContent = `${cur} / ${tot} Leads`;

      const pSpeed = document.getElementById("progress-speed-pill");
      if (pSpeed && spd) pSpeed.textContent = `⚡ Speed: ${spd}`;

      const pElapsed = document.getElementById("progress-elapsed-pill");
      if (pElapsed && elapsed) pElapsed.textContent = `⏱️ Elapsed: ${elapsed}`;

      const pEta = document.getElementById("progress-eta-pill");
      if (pEta && eta) {
        pEta.textContent = pct >= 100 ? "✓ Target Reached" : `⏳ ETA: ${eta}`;
      }
    } else if (text.includes("COMPLETED:") || text.includes("TARGET REACHED")) {
      const pBar = document.getElementById("pipeline-progress-bar");
      if (pBar) {
        pBar.style.width = "100%";
        pBar.classList.add("completed");
      }
      const pEta = document.getElementById("progress-eta-pill");
      if (pEta) pEta.textContent = "✓ Completed";
    }
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

  let lastProcessStatus = "idle";
  function updateProcessUIState(status, stage) {
    const isRunning = status === "running";
    if (btnStopPipeline) {
      btnStopPipeline.disabled = !isRunning;
      btnStopPipeline.style.display = isRunning ? "inline-flex" : "none";
    }
    if (progressBar) progressBar.classList.toggle("active", isRunning);
    const collectButton = document.getElementById("btn-run-unified");
    if (collectButton) collectButton.disabled = isRunning;
    const label = document.getElementById("unified-btn-text");
    if (label && isRunning) label.textContent = "Collecting contacts?";
    else if (label) label.textContent = `Collect ${document.getElementById("unified-target")?.value || 100} contacts`;

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
      if (status === "completed" && lastProcessStatus !== "completed") {
        fetchStats();
        loadDatasetsDropdown();
        if (currentTab === "nih") {
          loadNihLeads();
        } else if (currentTab === "explorer") {
          loadLeads();
        }
      }
    }
    lastProcessStatus = status;
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
      const resultBox = document.getElementById("collection-result");
      if (resultBox) resultBox.hidden = true;
      updateProcessUIState("running", action);
      const pBar = document.getElementById("pipeline-progress-bar");
      if (pBar) { pBar.style.width = "0%"; pBar.classList.remove("completed"); }
      const pBadge = document.getElementById("progress-percent-badge");
      if (pBadge) pBadge.textContent = "0.0%";
      const pCount = document.getElementById("progress-leads-count");
      if (pCount) pCount.textContent = "0 Leads Discovered";
      const pEta = document.getElementById("progress-eta-pill");
      if (pEta) pEta.textContent = "⏳ ETA: Initializing...";
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
  if (btnRunOpenalex) {
    btnRunOpenalex.addEventListener("click", () => {
      const keyword = (inputOpenalexKeyword ? inputOpenalexKeyword.value.trim() : "") || "Physical Chemistry";
      const pages = parseInt(inputOpenalexPages ? inputOpenalexPages.value : 25) || 25;
      
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
  }

  if (btnRunScholarly) {
    btnRunScholarly.addEventListener("click", () => {
      const target = parseInt(inputScholarlyTarget ? inputScholarlyTarget.value : 3000) || 3000;
      const selectedFile = selectScholarlyFile ? selectScholarlyFile.value.trim() : "";
      triggerRun("scholarly", { target_leads: target, input_file: selectedFile });
    });
  }

  if (btnRunNih) {
    btnRunNih.addEventListener("click", () => {
      const keyword = inputNihKeyword ? (inputNihKeyword.value.trim() || "cell biology") : "cell biology";
      const leads = inputNihLeads ? (parseInt(inputNihLeads.value) || 100) : 100;
      triggerRun("nih", { keyword, target_leads: leads });
    });
  }

  // ---------------------------------------------------------------------------
  // Scientific Data Source Selector (Source 1: OpenAlex, Source 2: bioRxiv, etc.)
  // ---------------------------------------------------------------------------
  let activeDataSource = "openalex";
  const pillOpenalex = document.getElementById("src-pill-openalex");
  const pillBiorxiv = document.getElementById("src-pill-biorxiv");
  const pillNih = document.getElementById("src-pill-nih");
  const pillMore = document.getElementById("src-pill-more");

  const unifiedCardBadge = document.getElementById("unified-card-badge");
  const unifiedCardTitle = document.getElementById("unified-card-title");
  const unifiedCardSubtitle = document.getElementById("unified-card-subtitle");
  const unifiedBtnText = document.getElementById("unified-btn-text");
  const sourceMetaText = document.getElementById("source-meta-text");
  const lblUnifiedKeyword = document.getElementById("lbl-unified-keyword");

  function setDataSource(sourceName) {
    activeDataSource = sourceName;
    pillOpenalex?.classList.toggle("active", sourceName === "openalex");
    pillBiorxiv?.classList.toggle("active", sourceName === "biorxiv");
    refreshCollectLabel();
  }

  if (pillOpenalex) {
    pillOpenalex.addEventListener("click", () => setDataSource("openalex"));
  }
  if (pillBiorxiv) {
    pillBiorxiv.addEventListener("click", () => setDataSource("biorxiv"));
  }
  if (pillNih) {
    pillNih.addEventListener("click", () => {
      switchTab("nih");
      showToast("Switched to Tab 2: NIH RePORTER Grant PIs");
    });
  }
  if (pillMore) {
    pillMore.addEventListener("click", () => {
      showToast("Next Sources in Roadmap: PubMed/NCBI, ChemRxiv (Chemistry), & arXiv!");
    });
  }

  // Unified 1-Click Pipeline Button
  const btnRunUnified = document.getElementById("btn-run-unified");
  const inputUnifiedKeyword = document.getElementById("unified-keyword");
  const inputUnifiedTarget = document.getElementById("unified-target");
  const selectUnifiedMinScore = document.getElementById("unified-min-score");
  const inputUnifiedDateFrom = document.getElementById("unified-date-from");
  const inputUnifiedDateTo = document.getElementById("unified-date-to");

  function normalizeDateInput(val, fallback) {
    if (!val) return fallback;
    val = String(val).trim();
    const isoMatch = val.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
    }
    const dmyMatch = val.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
    }
    return val;
  }

  const autoToggle = document.getElementById("collect-auto");
  function refreshCollectLabel() {
    const count = inputUnifiedTarget?.value || "100";
    if (unifiedBtnText) unifiedBtnText.textContent = `Collect ${count} contacts`;
    const summary = document.querySelector(".collector-settings summary span");
    if (summary) summary.textContent = `Score ${selectUnifiedMinScore?.value || 50}+ ? ${autoToggle?.checked ? "Automatic sources" : activeDataSource}`;
    document.querySelectorAll("[data-contact-count]").forEach(button => {
      const selected = button.dataset.contactCount === count;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  document.querySelectorAll("[data-contact-count]").forEach(button => {
    button.addEventListener("click", () => { inputUnifiedTarget.value = button.dataset.contactCount; refreshCollectLabel(); });
  });
  inputUnifiedTarget?.addEventListener("input", refreshCollectLabel);
  selectUnifiedMinScore?.addEventListener("change", refreshCollectLabel);
  if (inputUnifiedDateTo) inputUnifiedDateTo.value = new Date().toLocaleDateString("en-CA");
  if (autoToggle) autoToggle.addEventListener("change", () => {
    setDataSource(activeDataSource);
    refreshCollectLabel();
  });
  refreshCollectLabel();
  if (btnRunUnified) {
    btnRunUnified.addEventListener("click", () => {
      if (!inputUnifiedKeyword.reportValidity() || !inputUnifiedTarget.reportValidity()) return;
      if (inputUnifiedDateFrom.value > inputUnifiedDateTo.value) {
        showToast("Choose an end date after the start date.", "warning");
        inputUnifiedDateTo.focus();
        return;
      }
      const keyword = inputUnifiedKeyword.value.trim();
      if (!keyword) { inputUnifiedKeyword.focus(); return; }
      const targetLeads = parseInt(inputUnifiedTarget ? inputUnifiedTarget.value : 1000) || 1000;
      const minScore = parseInt(selectUnifiedMinScore ? selectUnifiedMinScore.value : 50) || 50;
      const rawFrom = inputUnifiedDateFrom ? inputUnifiedDateFrom.value : "";
      const rawTo = inputUnifiedDateTo ? inputUnifiedDateTo.value : "";
      const fromDate = normalizeDateInput(rawFrom, "2025-01-01");
      const toDate = normalizeDateInput(rawTo, "2026-12-31");

      const actionName = document.getElementById("collect-auto")?.checked ? "auto" : (activeDataSource === "biorxiv" ? "biorxiv" : "unified");

      triggerRun(actionName, {
        keyword,
        target_leads: targetLeads,
        min_score: minScore,
        from_date: fromDate,
        to_date: toDate
      });
    });
  }

  // Wipe Datasets Button
  const btnWipeDatasets = document.getElementById("btn-wipe-datasets");
  if (btnWipeDatasets) {
    btnWipeDatasets.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to wipe all old lead dataset files and start with a fresh slate?")) {
        return;
      }
      try {
        const res = await fetch("/api/leads/clear-all", { method: "POST" });
        const data = await res.json();
        showToast(data.message || "All old datasets cleared.");
        loadDatasetsDropdown();
        loadLeads();
        fetchStats();
      } catch (err) {
        showToast("Failed to clear datasets: " + err.message, "error");
      }
    });
  }

  if (btnRunBiorxiv) {
    btnRunBiorxiv.addEventListener("click", () => {
      setDataSource("biorxiv");
      triggerRun("biorxiv");
    });
  }


  if (btnStopPipeline) {
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
  }

  if (btnClearConsole) {
    btnClearConsole.addEventListener("click", () => {
      if (terminalBody) terminalBody.innerHTML = "";
      lineCount = 0;
      if (consoleLineCount) consoleLineCount.textContent = "0 lines";
    });
  }

  if (btnCopyConsole) {
    btnCopyConsole.addEventListener("click", () => {
      if (!terminalBody) return;
      const text = Array.from(terminalBody.querySelectorAll(".log-text"))
        .map((el) => el.innerText)
        .join("\n");
      navigator.clipboard.writeText(text).then(() => {
        showToast("Console logs copied to clipboard!");
      });
    });
  }

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


  if (datasetSelect) {
    datasetSelect.addEventListener("change", () => {
      activeDataset = datasetSelect.value;
      currentPage = 1;
      loadLeads();
    });
  }

  if (leadsSearchInput) {
    leadsSearchInput.addEventListener("input", (e) => {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadLeads();
      }, 300);
    });
  }

  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentStatus = pill.getAttribute("data-status");
      currentPage = 1;
      loadLeads();
    });
  });

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      currentPageSize = parseInt(e.target.value);
      currentPage = 1;
      loadLeads();
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", () => {
      if (!activeDataset) return;
      window.open(`/api/leads/export?file=${encodeURIComponent(activeDataset)}`, "_blank");
    });
  }

  if (btnPrevPage) {
    btnPrevPage.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadLeads();
      }
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener("click", () => {
      const maxPage = Math.ceil(totalLeadsCount / currentPageSize);
      if (currentPage < maxPage) {
        currentPage++;
        loadLeads();
      }
    });
  }

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
      leadsTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">No matching researcher leads found.</td></tr>`;
      return;
    }

    leadsTableBody.innerHTML = "";
    leads.forEach((row, i) => {
      const name = row.researcher_name || row.full_name || row.author_name || "Unknown Author";
      const email = row.professional_email || row.email || "";
      const inst = row.affiliations_seen_on_matching_papers || row.affiliation || row.organization || "Academic Institution";
      const topic = row.matched_search_terms || row.search_keyword || row.field_keyword || row.keyword || "cell biology";
      const award = row.award_amount || "";
      const statusRaw = row.review_status || row.email_status || (email ? "found" : "needs_review");

      // Calculate Match Score display
      const rawScore = row.match_score ? parseInt(row.match_score) : null;
      let scoreBadge = `<span style="color:var(--text-dim);font-size:0.75rem;">—</span>`;
      if (rawScore !== null && !isNaN(rawScore)) {
        if (rawScore >= 80) {
          scoreBadge = `<span class="pill-badge pill-emerald" style="font-weight:700;">🟢 ${rawScore}/100</span>`;
        } else if (rawScore >= 65) {
          scoreBadge = `<span class="pill-badge pill-cyan" style="font-weight:700;">🔵 ${rawScore}/100</span>`;
        } else {
          scoreBadge = `<span class="pill-badge pill-amber" style="font-weight:700;">🟡 ${rawScore}/100</span>`;
        }
      }

      // Data Source badge
      const srcRaw = (row.data_source || row.source || "").toLowerCase();
      let srcBadge = `<span class="badge-source badge-openalex">📚 OpenAlex</span>`;
      if (srcRaw.includes("biorxiv") || srcRaw.includes("medrxiv")) {
        srcBadge = `<span class="badge-source badge-biorxiv">🧬 bioRxiv</span>`;
      } else if (srcRaw.includes("nih") || row.award_amount) {
        srcBadge = `<span class="badge-source badge-nih">🏛️ NIH Grant</span>`;
      }

      let badgeClass = "needs-review";
      let badgeLabel = "Needs Review";

      if (statusRaw === "author_linked" || row.email_confidence === "author_linked") {
        badgeClass = "verified";
        badgeLabel = "Author linked";
      } else if (email) {
        badgeClass = "found";
        badgeLabel = "Review email";
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align: center; color: var(--text-dim); font-size: 0.8rem;">${startIdx + i}</td>
        <td class="cell-name">${escapeHtml(name)}</td>
        <td>
          ${email ? `
            <div class="email-pill-wrap" title="Click to copy: ${escapeHtml(email)}">
              <span class="email-text">${escapeHtml(email)}</span>
              <button class="btn-copy" data-email="${escapeHtml(email)}" title="Copy email address" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          ` : `<span style="color: var(--text-dim); font-style: italic;">No email found</span>`}
        </td>
        <td style="text-align: center;">${scoreBadge}</td>
        <td style="text-align: center;">${srcBadge}</td>
        <td>${escapeHtml(inst ? inst.substring(0, 50) + (inst.length > 50 ? "..." : "") : "—")}</td>
        <td><span class="status-badge ${badgeClass}">${badgeLabel}</span></td>
        <td><span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(award ? `${topic} (${award})` : topic)}</span></td>
        <td style="text-align: center;">
          <button class="btn-view-profile btn-view-row" title="View researcher full profile dossier" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>View Profile</span>
          </button>
        </td>
      `;

      // Copy email action with checkmark feedback
      const pillWrap = tr.querySelector(".email-pill-wrap");
      const copyBtn = tr.querySelector(".btn-copy");
      if (pillWrap && copyBtn && email) {
        pillWrap.addEventListener("click", (e) => {
          e.stopPropagation();
          handleCopyEmailClick(copyBtn, email);
        });
      }

      // Inspect detail action
      const viewBtn = tr.querySelector(".btn-view-row");
      if (viewBtn) {
        viewBtn.addEventListener("click", () => openDetailModal(row));
      }

      leadsTableBody.appendChild(tr);
    });
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise((resolve, reject) => {
      try {
        const ok = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (ok) resolve();
        else reject(new Error("Copy command failed"));
      } catch (err) {
        document.body.removeChild(textArea);
        reject(err);
      }
    });
  }

  function handleCopyEmailClick(btnEl, email) {
    if (!email) return;
    copyTextToClipboard(email).then(() => {
      showToast(`Copied: ${email}`);
      if (btnEl) {
        btnEl.classList.add("copied");
        const origSvg = btnEl.innerHTML;
        btnEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          btnEl.classList.remove("copied");
          btnEl.innerHTML = origSvg;
        }, 1800);
      }
    }).catch(() => {
      showToast("Unable to copy to clipboard", "error");
    });
  }

  function renderPagination(total, page, pageSize) {
    const totalPages = Math.ceil(total / pageSize) || 1;
    btnPrevPage.disabled = page <= 1;
    btnNextPage.disabled = page >= totalPages;
    pageNumbersContainer.innerHTML = `<span class="page-current">Page ${page} of ${totalPages.toLocaleString()}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Row Detail Modal (Rich Scientific Researcher Profile)
  // ---------------------------------------------------------------------------
  function openDetailModal(row) {
    const name = row.researcher_name || row.full_name || row.author_name || "Unknown Researcher";
    const email = row.professional_email || row.email || "";
    const inst = row.affiliations_seen_on_matching_papers || row.organization || "Academic Institution";
    const topic = row.matched_search_terms || row.field_keyword || row.keyword || "Scientific Research";
    const orcid = row.orcid || "";
    const papers = row.example_papers || "";
    const dois = row.example_paper_dois || "";
    const status = row.email_status || row.review_status || (email ? "Needs review" : "No email");
    const source = row.email_source_url || "ORCID / Europe PMC";

    const initials = name.split(" ").map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "SC";

    modalTitle.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.65rem;">
        <div style="width: 32px; height: 32px; border-radius: 8px; background: #0284c7; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">
          ${escapeHtml(initials)}
        </div>
        <div>
          <div style="font-size: 1.05rem; font-weight: 700; color: #0f172a; line-height: 1.2;">${escapeHtml(name)}</div>
          <div style="font-size: 0.74rem; color: #64748b; font-weight: 500;">Researcher Profile Dossier</div>
        </div>
      </div>
    `;

    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.9rem;">
        <!-- Status Box -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.6rem 0.85rem;">
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <span style="font-size: 0.74rem; color: #64748b; font-weight: 600;">VERIFICATION:</span>
            <span class="status-badge ${status.toLowerCase().includes('verif') ? 'verified' : 'found'}">${escapeHtml(status)}</span>
          </div>
          <div style="font-size: 0.74rem; color: #64748b;">
            Field: <strong style="color: #0f172a;">${escapeHtml(topic)}</strong>
          </div>
        </div>

        <!-- Contact & Identifiers -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem;">
          <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.04em;">Contact & Identifiers</div>
          <div style="display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.84rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
              <span style="color: #64748b;">Professional Email:</span>
              ${email ? `
                <div class="email-pill-wrap" style="margin: 0;" title="Click to copy">
                  <span class="email-text">${escapeHtml(email)}</span>
                  <button class="btn-copy" id="modal-email-copy-btn" data-email="${escapeHtml(email)}" title="Copy email" type="button">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                </div>
              ` : `<span style="color: #94a3b8; font-style: italic;">No verified email</span>`}
            </div>
            ${orcid ? `
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">ORCID Registry:</span>
                <span style="font-family: monospace; font-size: 0.8rem; font-weight: 600; color: #0284c7;">${escapeHtml(orcid)}</span>
              </div>
            ` : ""}
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #64748b;">Resolution Source:</span>
              <span style="color: #0f172a; font-weight: 500;">${escapeHtml(source)}</span>
            </div>
          </div>
        </div>

        <!-- Academic Affiliation -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem;">
          <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.35rem; letter-spacing: 0.04em;">Academic Affiliations</div>
          <div style="font-size: 0.84rem; color: #0f172a; line-height: 1.45;">
            ${escapeHtml(inst || "Academic Institution")}
          </div>
        </div>

        <!-- Publications & Research Evidence -->
        ${papers || dois ? `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem;">
            <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.35rem; letter-spacing: 0.04em;">Matched Publications</div>
            <div style="font-size: 0.8rem; color: #334155; line-height: 1.45; max-height: 130px; overflow-y: auto;">
              ${escapeHtml(papers || dois)}
            </div>
          </div>
        ` : ""}

        <!-- Modal Footer Actions -->
        <div style="display: flex; justify-content: flex-end; gap: 0.6rem; padding-top: 0.5rem; border-top: 1px solid #f1f5f9;">
          <button class="btn btn-secondary" type="button" onclick="closeDetailModal()">Close</button>
          ${email ? `
            <button class="btn btn-primary" id="modal-copy-footer-btn" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy Email</span>
            </button>
          ` : ""}
        </div>
      </div>
    `;

    const modalCopyBtn = modalBody.querySelector("#modal-copy-footer-btn");
    if (modalCopyBtn) {
      modalCopyBtn.addEventListener("click", () => handleCopyEmailClick(modalCopyBtn, email));
    }
    const innerPill = modalBody.querySelector("#modal-email-copy-btn");
    if (innerPill) {
      innerPill.addEventListener("click", () => handleCopyEmailClick(innerPill, email));
    }

    detailModal.style.display = "flex";
    detailModal.classList.add("active");
  }

  function closeDetailModal() {
    detailModal.classList.remove("active");
    detailModal.style.display = "none";
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeDetailModal);
  if (detailModal) {
    detailModal.addEventListener("click", (e) => {
      if (e.target === detailModal) closeDetailModal();
    });
  }

  // ---------------------------------------------------------------------------
  // Dedicated NIH Grant PIs Leads Table Controller
  // ---------------------------------------------------------------------------
  const nihTableBody = document.getElementById("nih-leads-table-body");
  const nihTableCount = document.getElementById("nih-table-count");
  const nihSearchInput = document.getElementById("nih-search-input");
  const btnExportNihCsv = document.getElementById("btn-export-nih-csv");
  const nihPaginationInfo = document.getElementById("nih-pagination-info");
  const btnNihPrev = document.getElementById("btn-nih-prev");
  const btnNihNext = document.getElementById("btn-nih-next");

  let nihCurrentPage = 1;
  const nihPageSize = 25;
  let nihSearch = "";
  let nihTotalCount = 0;
  let nihActiveFile = "";
  let nihDebounceTimer = null;

  async function loadNihLeads() {
    if (!nihTableBody) return;
    nihTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">Loading NIH funded leads...</td></tr>`;

    try {
      // Find the latest NIH dataset
      const dRes = await fetch("/api/datasets");
      if (dRes.ok) {
        const dData = await dRes.json();
        const datasets = dData.datasets || [];
        const nihFile = datasets.find(d => d.name.toLowerCase().includes("nih_funded") || d.name.toLowerCase().includes("nih"));
        if (nihFile) {
          nihActiveFile = nihFile.path;
        }
      }

      if (!nihActiveFile) {
        nihActiveFile = "nih_funded_leads_2026-10-24.csv";
      }

      const params = new URLSearchParams({
        file: nihActiveFile,
        search: nihSearch,
        page: nihCurrentPage,
        page_size: nihPageSize,
      });

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load NIH leads");
      const data = await res.json();

      const leads = data.leads || data.rows || [];
      nihTotalCount = data.total || leads.length;

      if (nihTableCount) {
        nihTableCount.textContent = `${nihTotalCount.toLocaleString()} PIs`;
      }

      if (leads.length === 0) {
        nihTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">No NIH funded leads found. Click "Extract NIH Funded PIs" above to start extracting.</td></tr>`;
        if (nihPaginationInfo) nihPaginationInfo.textContent = "Showing 0 of 0 leads";
        if (btnNihPrev) btnNihPrev.disabled = true;
        if (btnNihNext) btnNihNext.disabled = true;
        return;
      }

      nihTableBody.innerHTML = "";
      leads.forEach((row, i) => {
        const name = row.full_name || row.researcher_name || row.contact_pi_name || "Unknown PI";
        const email = row.email || row.professional_email || "";
        const org = row.organization || row.org_name || "Academic Institution";
        const award = row.award_amount || "$0";
        const fiscalYear = row.fiscal_year || "2026";
        const projectTitle = row.project_title || "";
        const rowIdx = (nihCurrentPage - 1) * nihPageSize + i + 1;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="text-align: center; color: var(--text-dim); font-size: 0.8rem;">${rowIdx}</td>
          <td class="cell-name">${escapeHtml(name)}</td>
          <td>
            ${
              email
                ? `<div class="email-pill-wrap" title="Click to copy: ${escapeHtml(email)}">
                     <span class="email-text">${escapeHtml(email)}</span>
                     <button class="btn-copy" data-email="${escapeHtml(email)}" title="Copy email address" type="button">
                       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                     </button>
                   </div>`
                : `<span style="color: var(--text-dim); font-style: italic;">No email found</span>`
            }
          </td>
          <td title="${escapeHtml(org)}">${escapeHtml(org.length > 35 ? org.substring(0, 35) + "..." : org)}</td>
          <td><span style="font-weight: 700; color: #0284c7;">${escapeHtml(award)}</span></td>
          <td><span class="pill-badge pill-cyan">FY ${escapeHtml(fiscalYear)}</span></td>
          <td title="${escapeHtml(projectTitle)}">${escapeHtml(projectTitle.length > 40 ? projectTitle.substring(0, 40) + "..." : projectTitle)}</td>
          <td style="text-align: center;">
            <button class="btn-view-profile btn-view-row" title="View researcher full profile dossier" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Profile</span>
            </button>
          </td>
        `;

        const pillWrap = tr.querySelector(".email-pill-wrap");
        const copyBtn = tr.querySelector(".btn-copy");
        if (pillWrap && copyBtn && email) {
          pillWrap.addEventListener("click", (e) => {
            e.stopPropagation();
            handleCopyEmailClick(copyBtn, email);
          });
        }

        const viewBtn = tr.querySelector(".btn-view-row");
        if (viewBtn) {
          viewBtn.addEventListener("click", () => openDetailModal(row));
        }

        nihTableBody.appendChild(tr);
      });

      const totalPages = Math.ceil(nihTotalCount / nihPageSize) || 1;
      if (nihPaginationInfo) {
        nihPaginationInfo.textContent = `Showing ${Math.min(leads.length, nihPageSize)} of ${nihTotalCount.toLocaleString()} leads (Page ${nihCurrentPage} of ${totalPages})`;
      }
      if (btnNihPrev) btnNihPrev.disabled = nihCurrentPage <= 1;
      if (btnNihNext) btnNihNext.disabled = nihCurrentPage >= totalPages;

    } catch (e) {
      nihTableBody.innerHTML = `<tr><td colspan="8" class="empty-state text-error">Failed to load NIH leads: ${e.message}</td></tr>`;
    }
  }

  if (nihSearchInput) {
    nihSearchInput.addEventListener("input", (e) => {
      clearTimeout(nihDebounceTimer);
      nihDebounceTimer = setTimeout(() => {
        nihSearch = e.target.value.trim();
        nihCurrentPage = 1;
        loadNihLeads();
      }, 300);
    });
  }

  if (btnExportNihCsv) {
    btnExportNihCsv.addEventListener("click", () => {
      if (!nihActiveFile) return;
      window.open(`/api/leads/export?file=${encodeURIComponent(nihActiveFile)}`, "_blank");
    });
  }

  if (btnNihPrev) {
    btnNihPrev.addEventListener("click", () => {
      if (nihCurrentPage > 1) {
        nihCurrentPage--;
        loadNihLeads();
      }
    });
  }

  if (btnNihNext) {
    btnNihNext.addEventListener("click", () => {
      const maxPages = Math.ceil(nihTotalCount / nihPageSize);
      if (nihCurrentPage < maxPages) {
        nihCurrentPage++;
        loadNihLeads();
      }
    });
  }

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


  if (btnRefreshAll) {
    btnRefreshAll.addEventListener("click", () => {
      fetchStats();
      loadDatasetsDropdown();
      if (currentTab === "explorer") loadLeads();
      if (currentTab === "datasets") loadDatasetsArchive();
      showToast("Dashboard metrics refreshed");
    });
  }

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
        const isTrial = st.is_trial !== false;
        showInfoModal(
          isTrial ? "Evaluation License & Quotas" : "Commercial License Status",
          `
          <div style="padding: 0.5rem 0;">
            <div style="background: ${isTrial ? "#fefce8" : "#f0fdf4"}; border: 1px solid ${isTrial ? "#fef08a" : "#bbf7d0"}; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
              <div style="font-size: 0.85rem; font-weight: 700; color: ${isTrial ? "#854d0e" : "#166534"};">${isTrial ? "Evaluation Edition (7-Day Trial)" : "SciProspect Professional Edition"}</div>
              <div style="font-size: 0.78rem; color: ${isTrial ? "#a16207" : "#15803d"}; margin-top: 0.2rem;">${isTrial ? "Full-featured evaluation license with 1,000 verified leads per day." : "Full commercial license with unlimited discovery and verified email enrichment."}</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">License Status:</span>
                <span style="font-weight: 700; color: #0f172a;">${isTrial ? `${st.days_left} Days Left` : "Active / Lifetime"}</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">Expiration:</span>
                <span style="font-weight: 600; color: #0f172a;">${st.expires_on || "Never (Lifetime License)"}</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">Daily Verified Quota:</span>
                <span style="font-weight: 600; color: #0f172a;">${isTrial ? "1,000 Verified Leads / Day" : "Unlimited Leads"}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-bottom: 0.4rem;">
                <span style="color: #64748b;">Restrictions:</span>
                <span style="font-weight: 600; color: #0284c7;">${isTrial ? "Evaluation Active" : "None (Zero Limits)"}</span>
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
  // Unified Authentication Controller
  // ---------------------------------------------------------------------------
  
  // ---------------------------------------------------------------------------
  // DevTools Anti-Tampering Defense Watchdog
  // ---------------------------------------------------------------------------
  let isInitialAuthCheckComplete = false;
  let isSessionAuthenticated = false;

  const antiTamperObserver = new MutationObserver(() => {
    if (!isSessionAuthenticated && isInitialAuthCheckComplete) {
      const shell = document.getElementById("app-shell");
      if (shell) {
        if (shell.style.display !== "none" || shell.classList.contains("authenticated")) {
          shell.style.setProperty("display", "none", "important");
          shell.classList.remove("authenticated");
        }
      }
    }
  });

  antiTamperObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden"]
  });

  async function checkAuthSession() {
    try {
      const res = await fetch("/api/auth/me");
      isInitialAuthCheckComplete = true;
      if (res.ok) {
        const data = await res.json();
        renderAuthenticatedState(data.user);
      } else {
        const errData = await res.json().catch(() => ({}));
        // Only pass suspension notice, never pass standard unauthenticated message
        const detail = errData.detail || "";
        if (detail && detail.includes("ACCESS SUSPENDED")) {
          renderUnauthenticatedState(detail);
        } else {
          renderUnauthenticatedState("");
        }
      }
    } catch (e) {
      isInitialAuthCheckComplete = true;
      renderUnauthenticatedState("");
    }
  }

  function renderAuthenticatedState(user) {
    isSessionAuthenticated = true;
    const overlay = document.getElementById("auth-gate-overlay");
    if (overlay) overlay.style.display = "none";
    const shell = document.getElementById("app-shell");
    if (shell) {
      shell.classList.add("authenticated");
      shell.style.removeProperty("display");
    }

    // Modern Unified User Profile Dropdown
    const userMenuContainer = document.getElementById("user-menu-container");
    if (userMenuContainer) userMenuContainer.style.display = "inline-flex";

    const chip = document.getElementById("user-profile-chip");
    if (chip) {
      chip.style.removeProperty("display");
      const nameEl = document.getElementById("user-chip-name");
      if (nameEl) nameEl.textContent = user.client_name || user.client_email || "Account";
      const tierEl = document.getElementById("user-chip-tier");
      if (tierEl) tierEl.textContent = (user.tier || "pro").toUpperCase();

      const ddName = document.getElementById("user-dd-name");
      if (ddName) ddName.textContent = user.client_name || "Account";
      const ddEmail = document.getElementById("user-dd-email");
      if (ddEmail) ddEmail.textContent = user.client_email || user.license_key || "Enterprise Access";
      const ddBadge = document.getElementById("user-dd-badge");
      if (ddBadge) {
        ddBadge.innerHTML = `<span class="badge-dot"></span> ${(user.tier || "pro").toUpperCase()} License Active`;
      }

      chip.onclick = (e) => {
        e.stopPropagation();
        if (userMenuContainer) userMenuContainer.classList.toggle("open");
      };
    }

    if (!window._userDropdownListenerAttached) {
      document.addEventListener("click", (e) => {
        const umc = document.getElementById("user-menu-container");
        if (umc && !umc.contains(e.target)) {
          umc.classList.remove("open");
        }
      });
      window._userDropdownListenerAttached = true;
    }

    const ddBtnRefresh = document.getElementById("dd-btn-refresh");
    if (ddBtnRefresh) {
      ddBtnRefresh.onclick = () => {
        const umc = document.getElementById("user-menu-container");
        if (umc) umc.classList.remove("open");
        fetchStats();
        showToast("Dashboard metrics refreshed", "info");
      };
    }

    const ddBtnSignOut = document.getElementById("dd-btn-sign-out");
    if (ddBtnSignOut) {
      ddBtnSignOut.onclick = () => {
        const umc = document.getElementById("user-menu-container");
        if (umc) umc.classList.remove("open");
        const mainSignOut = document.getElementById("btn-sign-out");
        if (mainSignOut) {
          mainSignOut.click();
        } else {
          renderUnauthenticatedState();
        }
      };
    }

    // Toggle Left Menu Trial Badge (Trial only, hidden for Pro)
    const trialPillEl = document.getElementById("header-trial-pill");
    if (trialPillEl) {
      const isTrialUser = ((user.tier || "").toLowerCase() === "trial");
      trialPillEl.style.display = isTrialUser ? "block" : "none";
    }

    // ONLY SHOW ROOT ADMIN IF CURRENT USER IS ROOT ADMIN
    const isAdmin = !!(user && user.is_admin);
    const ddBtnRootAdmin = document.getElementById("dd-btn-root-admin");
    if (ddBtnRootAdmin) ddBtnRootAdmin.style.display = isAdmin ? "flex" : "none";
    const btnRootAdmin = document.getElementById("btn-root-admin");
    if (btnRootAdmin) btnRootAdmin.style.display = isAdmin ? "inline-flex" : "none";
    const menuRootAdmin = document.getElementById("menu-root-admin");
    if (menuRootAdmin) menuRootAdmin.style.display = isAdmin ? "flex" : "none";

    window.currentUser = user;
    const hasSciStudioAccess = !!(user && (user.is_admin || user.scistudio_access !== false));
    const scistudioLockBadge = document.getElementById("scistudio-lock-badge");
    if (scistudioLockBadge) {
      scistudioLockBadge.style.display = hasSciStudioAccess ? "none" : "inline";
    }

    const btnSignOut = document.getElementById("btn-sign-out");
    if (btnSignOut) btnSignOut.style.display = "inline-flex";
    const btnRefreshAll = document.getElementById("btn-refresh-all");
    if (btnRefreshAll) btnRefreshAll.style.display = "inline-flex";

    // Initialize browser routing to retain current page or active tab
    initBrowserRouting();

    // Initialize authenticated data loads
    fetchStats();
    loadDatasetsDropdown();
    if (!eventSource) {
      connectLogStream();
    }
  }

  function renderUnauthenticatedState(errorMsg) {
    isSessionAuthenticated = false;
    document.body.classList.remove("studio-fullscreen-mode");
    if (eventSource) {
      try { eventSource.close(); } catch(e) {}
      eventSource = null;
    }
    const shell = document.getElementById("app-shell");
    if (shell) {
      shell.classList.remove("authenticated");
      shell.style.setProperty("display", "none", "important");
    }
    const overlay = document.getElementById("auth-gate-overlay");
    if (overlay) overlay.style.display = "flex";
    
    const userMenuContainer = document.getElementById("user-menu-container");
    if (userMenuContainer) {
      userMenuContainer.style.display = "none";
      userMenuContainer.classList.remove("open");
    }
    const chip = document.getElementById("user-profile-chip");
    if (chip) chip.style.display = "none";
    const btnSignOut = document.getElementById("btn-sign-out");
    if (btnSignOut) btnSignOut.style.display = "none";
    const btnRefreshAll = document.getElementById("btn-refresh-all");
    if (btnRefreshAll) btnRefreshAll.style.display = "none";

    const ddBtnRootAdmin = document.getElementById("dd-btn-root-admin");
    if (ddBtnRootAdmin) ddBtnRootAdmin.style.display = "none";
    const btnRootAdmin = document.getElementById("btn-root-admin");
    if (btnRootAdmin) btnRootAdmin.style.display = "none";
    const menuRootAdmin = document.getElementById("menu-root-admin");
    if (menuRootAdmin) menuRootAdmin.style.display = "none";

    const errBox = document.getElementById("auth-error-box");
    if (errBox) {
      if (errorMsg && errorMsg !== "Not authenticated") {
        errBox.style.display = "block";
        errBox.textContent = errorMsg;
      } else if (!errorMsg) {
        errBox.style.display = "none";
        errBox.textContent = "";
      }
    }
  }

  window.switchAuthTab = function(tab) {
    const btnLic = document.getElementById("auth-tab-btn-license");
    const btnPwd = document.getElementById("auth-tab-btn-pwd");
    const btnAdm = document.getElementById("auth-tab-btn-admin");
    if (btnLic) btnLic.classList.toggle("active", tab === "license");
    if (btnPwd) btnPwd.classList.toggle("active", tab === "password");
    if (btnAdm) btnAdm.classList.toggle("active", tab === "admin");

    const vLic = document.getElementById("auth-view-license");
    const vPwd = document.getElementById("auth-view-password");
    const vAdm = document.getElementById("auth-view-admin");
    if (vLic) vLic.style.display = (tab === "license") ? "block" : "none";
    if (vPwd) vPwd.style.display = (tab === "password") ? "block" : "none";
    if (vAdm) vAdm.style.display = (tab === "admin") ? "block" : "none";

    const errBox = document.getElementById("auth-error-box");
    if (errBox) { errBox.style.display = "none"; errBox.textContent = ""; }
  };

  async function executeAuthLogin(payload, btnId) {
    const errBox = document.getElementById("auth-error-box");
    if (errBox) errBox.style.display = "none";
    const btn = document.getElementById(btnId);
    const origText = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = "<span>Authenticating...</span>"; }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        if (errBox) {
          errBox.textContent = data.detail || "Authentication failed. Please verify your credentials.";
          errBox.style.display = "block";
        }
        return;
      }

      showToast(`Welcome, ${data.user.client_name}!`, "success");
      renderAuthenticatedState(data.user);
      fetchStats();
      loadDatasetsDropdown();
    } catch (e) {
      if (errBox) {
        errBox.textContent = `Connection error: ${e.message}`;
        errBox.style.display = "block";
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    }
  }

  window.submitLicenseAuth = function(e) {
    e.preventDefault();
    const inputEl = document.getElementById("auth-input-license-key");
    const key = inputEl ? inputEl.value.trim() : "";
    if (!key) return;
    executeAuthLogin({ identifier: key }, "btn-auth-submit-key");
  };

  // Password visibility toggle (Show / Hide)
  const btnTogglePwd = document.getElementById("btn-toggle-pwd");
  const inputPwd = document.getElementById("auth-input-pwd");
  if (btnTogglePwd && inputPwd) {
    btnTogglePwd.addEventListener("click", () => {
      const isPwd = inputPwd.type === "password";
      inputPwd.type = isPwd ? "text" : "password";
      const eye = btnTogglePwd.querySelector(".eye-icon");
      const eyeOff = btnTogglePwd.querySelector(".eye-off-icon");
      if (eye && eyeOff) {
        eye.style.display = isPwd ? "none" : "block";
        eyeOff.style.display = isPwd ? "block" : "none";
      }
      btnTogglePwd.setAttribute("title", isPwd ? "Hide password" : "Show password");
    });
  }

  window.submitPasswordAuth = function(e) {
    e.preventDefault();
    const emailEl = document.getElementById("auth-input-email");
    const pwdEl = document.getElementById("auth-input-pwd");
    const email = emailEl ? emailEl.value.trim() : "";
    const pwd = pwdEl ? pwdEl.value.trim() : "";
    if (!email || !pwd) return;
    executeAuthLogin({ identifier: email, password: pwd }, "btn-auth-submit-pwd");
  };

  window.submitAdminAuth = function(e) {
    e.preventDefault();
    const pwdEl = document.getElementById("auth-input-admin-pwd");
    const pwd = pwdEl ? pwdEl.value.trim() : "";
    if (!pwd) return;
    executeAuthLogin({ identifier: "admin", password: pwd }, "btn-auth-submit-admin");
  };

  const btnSignOut = document.getElementById("btn-sign-out");
  if (btnSignOut) {
    btnSignOut.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
        showToast("Signed out successfully.");
        renderUnauthenticatedState();
      } catch (e) {
        renderUnauthenticatedState();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  // Desktop vs Web Mode: Keep menubar only in desktop app version, hide on web
  const isAppMode = !!(
    window.pywebview ||
    window.matchMedia('(display-mode: standalone)').matches ||
    new URLSearchParams(window.location.search).get('mode') === 'app' ||
    sessionStorage.getItem('scip_app_mode') === 'true'
  );
  if (new URLSearchParams(window.location.search).get('mode') === 'app') {
    sessionStorage.setItem('scip_app_mode', 'true');
  }

  document.body.classList.toggle("desktop-app-mode", isAppMode);
  // Move the existing account control, preserving its listeners and login state.
  if (!isAppMode) {
    const webActions = document.querySelector(".app-topbar .topbar-right");
    const accountMenu = document.getElementById("user-menu-container");
    if (webActions && accountMenu) webActions.appendChild(accountMenu);
  }

  const desktopMenubar = document.getElementById("desktop-menubar");
  const titlebarSep = document.getElementById("titlebar-sep");
  if (desktopMenubar) {
    desktopMenubar.style.display = isAppMode ? "flex" : "none";
  }
  if (titlebarSep) {
    titlebarSep.style.display = isAppMode ? "block" : "none";
  }


  // ===========================================================================
  // MODULE 05: SCISTUDIO WEBSITE BUILDER STUDIO LOGIC (V2 PRO)
  // ===========================================================================
  let userWebsites = [];
  let currentSite = null;
  let activeComponentId = null;
  let starterTemplates = [];
  let selectedTemplateId = "genomics";

  // Curated Scientific Vector Icons (FontAwesome 6)
  const SCIENTIFIC_ICONS = [
    { val: "fa-solid fa-microscope", label: "Microscope (Lab & Analysis)" },
    { val: "fa-solid fa-dna", label: "DNA Helix (Genomics & CRISPR)" },
    { val: "fa-solid fa-brain", label: "Brain (Neuroscience & AI)" },
    { val: "fa-solid fa-flask-vial", label: "Flask & Vials (Pharma & Chemistry)" },
    { val: "fa-solid fa-stethoscope", label: "Stethoscope (Clinical & Oncology)" },
    { val: "fa-solid fa-atom", label: "Atom (Physics & Quantum)" },
    { val: "fa-solid fa-laptop-code", label: "Laptop (Bioinformatics & ML)" },
    { val: "fa-solid fa-chart-line", label: "Chart (Data & Trends)" },
    { val: "fa-solid fa-earth-americas", label: "Globe (Global Climate & Ecology)" },
    { val: "fa-solid fa-bolt", label: "Bolt (CRISPR & Energy)" },
    { val: "fa-solid fa-users", label: "Faculty (Keynote Speakers)" },
    { val: "fa-solid fa-award", label: "Award (Grants & NIH Funding)" },
    { val: "fa-solid fa-lightbulb", label: "Lightbulb (Innovation & Patents)" },
    { val: "fa-solid fa-shield-halved", label: "Shield (Safety & Trial Standards)" },
    { val: "fa-solid fa-rocket", label: "Rocket (Translational Launch)" },
    { val: "fa-solid fa-ticket", label: "Ticket (Passes & Admissions)" },
    { val: "fa-solid fa-location-dot", label: "Location (Campus Venue & Hall)" },
    { val: "fa-solid fa-envelope", label: "Envelope (Inquiries & RSVP)" },
    { val: "fa-solid fa-circle-question", label: "Question (FAQ & Help)" },
    { val: "fa-solid fa-book-open", label: "Open Book (Publications & Papers)" },
    { val: "fa-solid fa-certificate", label: "Certificate (Accreditation)" },
    { val: "fa-solid fa-star", label: "Star (Keynote & Highlight)" }
  ];

  // Curated High-Res Scientific Stock Presets
  const SCIENTIFIC_STOCK_IMAGES = [
    { label: "🔬 Lab", url: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=900&auto=format&fit=crop&q=80" },
    { label: "🧬 DNA", url: "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=900&auto=format&fit=crop&q=80" },
    { label: "🏛️ Hall", url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=900&auto=format&fit=crop&q=80" },
    { label: "🩺 Clinic", url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=900&auto=format&fit=crop&q=80" },
    { label: "🧪 Biotech", url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=900&auto=format&fit=crop&q=80" },
    { label: "💻 DeepTech", url: "https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=900&auto=format&fit=crop&q=80" }
  ];

  // Speaker Avatar Presets
  const SPEAKER_AVATAR_PRESETS = [
    { label: "Prof. Elena", url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80" },
    { label: "Dr. Marcus", url: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&auto=format&fit=crop&q=80" },
    { label: "Dr. Sarah", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80" },
    { label: "Prof. David", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80" }
  ];

  function renderVectorIcon(iconStr, defaultColor = "#38bdf8") {
    if (!iconStr) return `<i class="fa-solid fa-microscope" style="color:${defaultColor}"></i>`;
    const s = String(iconStr).trim();
    if (s.includes("fa-")) {
      return `<i class="${s}" style="color:${defaultColor}"></i>`;
    }
    return `<span>${s}</span>`;
  }

  const btnOpenCreateSiteModal = document.getElementById("btn-open-create-site-modal");
  const modalCreateSite = document.getElementById("modal-create-site");
  const btnCloseCreateSite = document.getElementById("btn-close-create-site");
  const btnCancelCreateSite = document.getElementById("btn-cancel-create-site");
  const formCreateSite = document.getElementById("form-create-site");
  const createSiteNameInput = document.getElementById("create-site-name");
  const createSiteSlugInput = document.getElementById("create-site-slug");

  // Wizard Extra Fields
  const wizardTemplatesGrid = document.getElementById("wizard-templates-grid");
  const createSiteThemeMode = document.getElementById("create-site-theme-mode");
  const createPrimaryColor = document.getElementById("create-primary-color");
  const labelCreatePrimary = document.getElementById("label-create-primary");
  const createNavBrand = document.getElementById("create-nav-brand");
  const createNavCta = document.getElementById("create-nav-cta");
  const createHeroEyebrow = document.getElementById("create-hero-eyebrow");
  const createHeroHeadline = document.getElementById("create-hero-headline");
  const createHeroSubheadline = document.getElementById("create-hero-subheadline");
  const createHeroBtn1 = document.getElementById("create-hero-btn1");
  const createHeroBtn2 = document.getElementById("create-hero-btn2");
  const secChkSpeakers = document.getElementById("sec-chk-speakers");
  const secChkFeatures = document.getElementById("sec-chk-features");
  const secChkPricing = document.getElementById("sec-chk-pricing");
  const secChkGallery = document.getElementById("sec-chk-gallery");
  const secChkFaq = document.getElementById("sec-chk-faq");
  const secChkContact = document.getElementById("sec-chk-contact");

  if (createPrimaryColor && labelCreatePrimary) {
    createPrimaryColor.addEventListener("input", () => {
      labelCreatePrimary.textContent = createPrimaryColor.value;
    });
  }

  const builderDashboardView = document.getElementById("builder-dashboard-view");
  const builderStudioView = document.getElementById("builder-studio-view");
  const builderSitesGrid = document.getElementById("builder-sites-grid");
  const builderSearchSites = document.getElementById("builder-search-sites");
  const statTotalSites = document.getElementById("stat-total-sites");

  const btnStudioBack = document.getElementById("btn-studio-back");
  const studioSiteName = document.getElementById("studio-site-name");
  const studioSiteStatus = document.getElementById("studio-site-status");
  const btnDeviceDesktop = document.getElementById("btn-device-desktop");
  const btnDeviceMobile = document.getElementById("btn-device-mobile");
  const builderCanvasFrame = document.getElementById("builder-canvas-frame");
  const canvasSectionsList = document.getElementById("canvas-sections-list");
  const inspectorContent = document.getElementById("inspector-content");

  const btnStudioSave = document.getElementById("btn-studio-save");
  const btnStudioPublish = document.getElementById("btn-studio-publish");
  const btnStudioPreview = document.getElementById("btn-studio-preview");
  const btnStudioExport = document.getElementById("btn-studio-export");

  const themePrimaryColor = document.getElementById("theme-primary-color");
  const labelPrimaryColor = document.getElementById("label-primary-color");
  const themeAccentColor = document.getElementById("theme-accent-color");
  const labelAccentColor = document.getElementById("label-accent-color");
  const themeBgPreset = document.getElementById("theme-bg-preset");

  // Slug auto-generation on typing name
  if (createSiteNameInput && createSiteSlugInput) {
    createSiteNameInput.addEventListener("input", () => {
      const slugVal = createSiteNameInput.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      createSiteSlugInput.value = slugVal;
    });
  }

  // Fetch starter templates and render wizard picker
  async function fetchTemplatesAndRenderWizard() {
    try {
      const res = await fetch("/api/builder/templates");
      if (!res.ok) return;
      const data = await res.json();
      starterTemplates = data.templates || [];
      renderWizardTemplates(starterTemplates);
    } catch (err) {
      console.warn("Failed to load starter templates:", err);
    }
  }

  function renderWizardTemplates(templates) {
    if (!wizardTemplatesGrid) return;
    if (!templates || !templates.length) {
      wizardTemplatesGrid.innerHTML = '<div style="color: #94a3b8; font-size: 0.82rem; padding: 1rem;">No templates available.</div>';
      return;
    }

    wizardTemplatesGrid.innerHTML = templates.map((tmpl, idx) => {
      const isSel = (tmpl.id === selectedTemplateId) || (!selectedTemplateId && idx === 0);
      if (isSel && !selectedTemplateId) selectedTemplateId = tmpl.id;
      return `
        <div class="wizard-template-card ${isSel ? 'active' : ''}" data-tmpl-id="${tmpl.id}">
          <div class="wizard-tmpl-top">
            <span class="wizard-tmpl-icon">${tmpl.icon || '🌐'}</span>
            <span class="wizard-tmpl-category">${escapeHtml(tmpl.category || 'General')}</span>
          </div>
          <div class="wizard-tmpl-title">${escapeHtml(tmpl.name)}</div>
          <div class="wizard-tmpl-desc">${escapeHtml(tmpl.description || '')}</div>
        </div>
      `;
    }).join("");

    wizardTemplatesGrid.querySelectorAll(".wizard-template-card").forEach(card => {
      card.addEventListener("click", () => {
        wizardTemplatesGrid.querySelectorAll(".wizard-template-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        const tmplId = card.getAttribute("data-tmpl-id");
        selectedTemplateId = tmplId;
        applyTemplateDefaultsToWizard(tmplId);
      });
    });
  }

  function applyTemplateDefaultsToWizard(tmplId) {
    const tmpl = starterTemplates.find(t => t.id === tmplId);
    if (!tmpl) return;

    const briefName = briefConfNameInput ? briefConfNameInput.value.trim() : "";
    const siteTitle = briefName || tmpl.name;

    if (createSiteNameInput) {
      createSiteNameInput.value = siteTitle;
      const slugVal = siteTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (createSiteSlugInput) createSiteSlugInput.value = slugVal;
    }
    if (createSiteThemeMode && tmpl.theme) {
      createSiteThemeMode.value = tmpl.theme.mode || "dark";
    }
    if (createPrimaryColor && tmpl.theme) {
      createPrimaryColor.value = tmpl.theme.primary_color || "#38bdf8";
      if (labelCreatePrimary) labelCreatePrimary.textContent = createPrimaryColor.value;
    }
    if (createNavBrand) {
      createNavBrand.value = siteTitle;
    }
    if (createNavCta) {
      createNavCta.value = "Register Now";
    }
    if (createHeroEyebrow) {
      createHeroEyebrow.value = `🌟 ${siteTitle.toUpperCase()} 2026`;
    }
    if (createHeroHeadline) {
      createHeroHeadline.value = `${siteTitle}: Breakthroughs & Collaborative Discovery`;
    }
    if (createHeroSubheadline) {
      createHeroSubheadline.value = tmpl.description || "";
    }
    if (createHeroBtn1) createHeroBtn1.value = "Register Today";
    if (createHeroBtn2) createHeroBtn2.value = "Explore Faculty";
  }

  // ---------------------------------------------------------------------------
  // Client Briefing & Multi-Step Wizard Flow
  // ---------------------------------------------------------------------------
  const wizardPane1 = document.getElementById("wizard-pane-1");
  const wizardPane2 = document.getElementById("wizard-pane-2");
  const wizardPane3 = document.getElementById("wizard-pane-3");
  const wizardHeaderSubtitle = document.getElementById("wizard-header-subtitle");

  const stepIndicator1 = document.getElementById("wizard-step-indicator-1");
  const stepIndicator2 = document.getElementById("wizard-step-indicator-2");
  const stepIndicator3 = document.getElementById("wizard-step-indicator-3");

  const briefConfNameInput = document.getElementById("brief-conf-name");
  const briefStartDateInput = document.getElementById("brief-start-date");
  const briefEndDateInput = document.getElementById("brief-end-date");
  const briefVenueFormatInput = document.getElementById("brief-venue-format");
  const briefContactEmailInput = document.getElementById("brief-contact-email");

  const btnBriefNext = document.getElementById("btn-brief-next");
  const btnReviewBack = document.getElementById("btn-review-back");
  const btnReviewProceed = document.getElementById("btn-review-proceed");
  const btnTemplatesBack = document.getElementById("btn-templates-back");

  const reviewSummaryContainer = document.getElementById("review-summary-container");
  const reviewMissingAlert = document.getElementById("review-missing-alert");

  let currentWizardStep = 1;

  function switchWizardStep(step) {
    currentWizardStep = step;
    if (wizardPane1) wizardPane1.style.display = (step === 1) ? "block" : "none";
    if (wizardPane2) wizardPane2.style.display = (step === 2) ? "block" : "none";
    if (wizardPane3) wizardPane3.style.display = (step === 3) ? "block" : "none";

    if (stepIndicator1) {
      stepIndicator1.className = `wizard-stepper-step ${step === 1 ? 'active' : (step > 1 ? 'completed' : '')}`;
    }
    if (stepIndicator2) {
      stepIndicator2.className = `wizard-stepper-step ${step === 2 ? 'active' : (step > 2 ? 'completed' : '')}`;
    }
    if (stepIndicator3) {
      stepIndicator3.className = `wizard-stepper-step ${step === 3 ? 'active' : ''}`;
    }

    if (wizardHeaderSubtitle) {
      if (step === 1) wizardHeaderSubtitle.textContent = "Step 1 of 3: Conference Client Briefing";
      else if (step === 2) wizardHeaderSubtitle.textContent = "Step 2 of 3: Review Client Briefing";
      else if (step === 3) wizardHeaderSubtitle.textContent = "Step 3 of 3: Starter Template & Visual Customization";
    }

    if (step === 1 && briefConfNameInput) {
      setTimeout(() => briefConfNameInput.focus({ preventScroll: true }), 60);
    } else if (step === 2) {
      renderReviewSummary();
      const reviewBody = reviewSummaryContainer?.closest(".wizard-body");
      if (reviewBody) reviewBody.scrollTop = 0;
    } else if (step === 3) {
      syncBriefToTemplateForm();
    }
  }

  function renderReviewSummary() {
    if (!reviewSummaryContainer) return;
    const name = briefConfNameInput ? briefConfNameInput.value.trim() : "";
    const startDate = briefStartDateInput ? briefStartDateInput.value.trim() : "";
    const endDate = briefEndDateInput ? briefEndDateInput.value.trim() : "";
    const venue = briefVenueFormatInput ? briefVenueFormatInput.value.trim() : "";
    const email = briefContactEmailInput ? briefContactEmailInput.value.trim() : "";

    const items = [
      {
        label: "Conference Name",
        required: true,
        val: name,
        fallbackText: "Required"
      },
      {
        label: "Start Date",
        required: false,
        val: startDate,
        fallbackText: "Upcoming conference schedule"
      },
      {
        label: "End Date",
        required: false,
        val: endDate,
        fallbackText: "Standard event duration"
      },
      {
        label: "Venue or Online Format",
        required: false,
        val: venue,
        fallbackText: "Hybrid (In-Person & Live Stream)"
      },
      {
        label: "Contact Email",
        required: false,
        val: email,
        fallbackText: "Organization secretariat email"
      }
    ];

    const missingOptional = items.filter(i => !i.required && !i.val);

    reviewSummaryContainer.innerHTML = items.map(item => {
      const hasVal = Boolean(item.val);
      const badgeHtml = hasVal
        ? `<span class="badge-provided">Provided</span>`
        : (item.required
            ? `<span class="badge-missing" style="color:#ef4444; border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.1);"><i class="fa-solid fa-asterisk"></i> Required</span>`
            : `<span class="badge-missing">Optional</span>`);

      const valDisplay = hasVal
        ? `<span class="review-field-val">${escapeHtml(item.val)}</span>`
        : `<span class="review-field-val missing">Not provided</span>`;

      return `
        <div class="review-row">
          <div class="review-field-meta">
            <span class="review-field-name">${escapeHtml(item.label)}</span>
            ${valDisplay}
          </div>
          <div>
            ${badgeHtml}
          </div>
        </div>
      `;
    }).join("");

    if (reviewMissingAlert) {
      if (missingOptional.length > 0) {
        const missingNames = missingOptional.map(m => m.label).join(", ");
        reviewMissingAlert.innerHTML = `
          <div class="review-notice-banner">
            <strong>You can continue.</strong> Optional details not provided: ${escapeHtml(missingNames)}. Review any generated placeholder content before publishing.
          </div>
        `;
      } else {
        reviewMissingAlert.innerHTML = `
          <div class="review-notice-banner all-complete">
            <strong>Your brief is ready.</strong> Continue to choose your website design.
          </div>
        `;
      }
    }
  }

  function syncBriefToTemplateForm() {
    const name = briefConfNameInput ? briefConfNameInput.value.trim() : "";
    if (!name) return;

    if (createSiteNameInput) {
      createSiteNameInput.value = name;
    }
    if (createSiteSlugInput) {
      const slugVal = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      createSiteSlugInput.value = slugVal;
    }
    if (createNavBrand) {
      createNavBrand.value = name;
    }
    if (createHeroHeadline) {
      createHeroHeadline.value = `${name}: Breakthroughs & Collaborative Discovery`;
    }
    const startDate = briefStartDateInput ? briefStartDateInput.value.trim() : "";
    const endDate = briefEndDateInput ? briefEndDateInput.value.trim() : "";
    if (startDate && createHeroEyebrow) {
      createHeroEyebrow.value = `🌟 ${name.toUpperCase()} (${startDate}${endDate ? ' – ' + endDate : ''})`;
    }
  }

  if (btnBriefNext) {
    btnBriefNext.addEventListener("click", () => {
      const name = briefConfNameInput ? briefConfNameInput.value.trim() : "";
      if (!name) {
        if (briefConfNameInput) {
          briefConfNameInput.focus();
        }
        showToast("Please provide the conference name (required)", "warning");
        return;
      }
      switchWizardStep(2);
    });
  }

  if (btnReviewBack) {
    btnReviewBack.addEventListener("click", () => {
      // Return to step 1 without losing any entered answers!
      switchWizardStep(1);
    });
  }

  if (btnReviewProceed) {
    btnReviewProceed.addEventListener("click", () => {
      switchWizardStep(3);
    });
  }

  if (btnTemplatesBack) {
    btnTemplatesBack.addEventListener("click", () => {
      switchWizardStep(2);
    });
  }

  // Open / Close Create Modal with Active Class
  if (btnOpenCreateSiteModal && modalCreateSite) {
    btnOpenCreateSiteModal.addEventListener("click", () => {
      modalCreateSite.classList.add("active");
      modalCreateSite.style.display = "flex";
      switchWizardStep(1);
      fetchTemplatesAndRenderWizard();
      if (!selectedTemplateId && starterTemplates.length > 0) {
        selectedTemplateId = starterTemplates[0].id;
      }
      if (selectedTemplateId) {
        applyTemplateDefaultsToWizard(selectedTemplateId);
      }
    });
  }

  function closeCreateSiteModal() {
    if (modalCreateSite) {
      modalCreateSite.classList.remove("active");
      modalCreateSite.style.display = "none";
    }
  }

  if (btnCloseCreateSite) btnCloseCreateSite.addEventListener("click", closeCreateSiteModal);
  if (btnCancelCreateSite) btnCancelCreateSite.addEventListener("click", closeCreateSiteModal);

  // Submit Create Site from Comprehensive Wizard
  window.handleCreateSiteSubmit = async function(e) {
    e.preventDefault();
    const briefName = briefConfNameInput ? briefConfNameInput.value.trim() : "";
    const name = (createSiteNameInput ? createSiteNameInput.value.trim() : "") || briefName;
    const slug = createSiteSlugInput ? createSiteSlugInput.value.trim() : "";
    if (!name) {
      showToast("Conference / website title is required", "warning");
      return;
    }

    const clientBrief = {
      conference_name: briefName || name,
      start_date: briefStartDateInput ? briefStartDateInput.value.trim() : "",
      end_date: briefEndDateInput ? briefEndDateInput.value.trim() : "",
      venue_format: briefVenueFormatInput ? briefVenueFormatInput.value.trim() : "",
      contact_email: briefContactEmailInput ? briefContactEmailInput.value.trim() : ""
    };

    const themeMode = createSiteThemeMode ? createSiteThemeMode.value : "dark";
    const primaryColor = createPrimaryColor ? createPrimaryColor.value : "#38bdf8";
    const navBrand = createNavBrand ? createNavBrand.value.trim() : name;
    const navCta = createNavCta ? createNavCta.value.trim() : "Register Now";
    const heroEyebrow = createHeroEyebrow ? createHeroEyebrow.value.trim() : "";
    const heroHeadline = createHeroHeadline ? createHeroHeadline.value.trim() : "";
    const heroSubheadline = createHeroSubheadline ? createHeroSubheadline.value.trim() : "";
    const heroBtn1 = createHeroBtn1 ? createHeroBtn1.value.trim() : "Register Today";
    const heroBtn2 = createHeroBtn2 ? createHeroBtn2.value.trim() : "Explore Faculty";

    const sections = {
      hero: true,
      speakers: secChkSpeakers ? secChkSpeakers.checked : true,
      features: secChkFeatures ? secChkFeatures.checked : true,
      pricing: secChkPricing ? secChkPricing.checked : true,
      gallery: secChkGallery ? secChkGallery.checked : true,
      faq: secChkFaq ? secChkFaq.checked : true,
      contact: secChkContact ? secChkContact.checked : true,
      footer: true
    };

    const payload = {
      name,
      slug,
      template_id: selectedTemplateId || "genomics",
      theme_config: {
        mode: themeMode,
        primary_color: primaryColor
      },
      client_brief: clientBrief,
      custom_options: {
        mode: themeMode,
        primary_color: primaryColor,
        nav_brand: navBrand,
        nav_cta: navCta,
        hero_eyebrow: heroEyebrow,
        hero_headline: heroHeadline,
        hero_subheadline: heroSubheadline,
        hero_btn1: heroBtn1,
        hero_btn2: heroBtn2,
        sections: sections,
        client_brief: clientBrief
      },
      conference_id: (document.getElementById("create-site-conference") ? document.getElementById("create-site-conference").value : "") || null
    };

    try {
      showToast("Generating SciStudio website from client brief...", "info");
      const res = await fetch("/api/builder/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create website");

      closeCreateSiteModal();
      showToast("SciStudio website generated successfully from brief!", "success");
      await fetchConferences();
      openBuilderStudio(data.site.site_id);
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    }
  };

  // ---------------------------------------------------------------------------
  // Conference Workspaces Manager
  // ---------------------------------------------------------------------------
  let userConferences = [];
  let selectedConferenceId = "all";

  async function fetchConferences() {
    try {
      const res = await fetch("/api/builder/conferences");
      if (!res.ok) return;
      const data = await res.json();
      userConferences = data.conferences || [];
      renderConferenceSelector();
    } catch (e) {
      console.warn("Failed to load conferences:", e);
    }
  }

  function renderConferenceSelector() {
    const sel = document.getElementById("conference-workspace-select");
    const wizardSel = document.getElementById("create-site-conference");

    try {
      const saved = sessionStorage.getItem("scip_selected_conference");
      if (saved && (saved === "all" || userConferences.some(c => c.conference_id === saved))) {
        selectedConferenceId = saved;
      }
    } catch(e) {}

    if (sel) {
      let optionsHtml = `<option value="all" ${selectedConferenceId === "all" ? "selected" : ""}>All conferences (${userWebsites.length})</option>`;
      userConferences.forEach(c => {
        const siteCount = userWebsites.filter(s => s.conference_id === c.conference_id).length;
        optionsHtml += `<option value="${c.conference_id}" ${selectedConferenceId === c.conference_id ? "selected" : ""}>${escapeHtml(c.name)} (${siteCount} site${siteCount === 1 ? '' : 's'})</option>`;
      });
      sel.innerHTML = optionsHtml;
    }

    if (wizardSel) {
      let wizardHtml = `<option value="">(None / General Website)</option>`;
      userConferences.forEach(c => {
        const isPreselected = (selectedConferenceId !== "all" && selectedConferenceId === c.conference_id);
        wizardHtml += `<option value="${c.conference_id}" ${isPreselected ? "selected" : ""}>${escapeHtml(c.name)}</option>`;
      });
      wizardSel.innerHTML = wizardHtml;
    }

    const pill = document.getElementById("conf-site-count-pill");
    if (pill) {
      if (selectedConferenceId === "all") {
        pill.textContent = `${userWebsites.length} Total Website${userWebsites.length === 1 ? '' : 's'}`;
      } else {
        const conf = userConferences.find(c => c.conference_id === selectedConferenceId);
        const count = userWebsites.filter(s => s.conference_id === selectedConferenceId).length;
        pill.textContent = `${count} Website${count === 1 ? '' : 's'} in ${conf ? conf.name : 'Workspace'}`;
      }
    }
  }

  const confSelectEl = document.getElementById("conference-workspace-select");
  if (confSelectEl) {
    confSelectEl.addEventListener("change", (e) => {
      selectedConferenceId = e.target.value;
      try { sessionStorage.setItem("scip_selected_conference", selectedConferenceId); } catch(e) {}
      applyConferenceFilter();
    });
  }

  function applyConferenceFilter() {
    let filtered = userWebsites;
    if (selectedConferenceId !== "all") {
      filtered = userWebsites.filter(s => s.conference_id === selectedConferenceId);
    }
    const hasWorkspaceSites = filtered.length > 0;
    const toolbar = document.querySelector('#builder-dashboard-view .scistudio-toolbar');
    if (toolbar) toolbar.hidden = !hasWorkspaceSites;
    if (!hasWorkspaceSites && builderSearchSites) {
      builderSearchSites.value = '';
      const clearSearch = document.getElementById('btn-clear-search');
      if (clearSearch) clearSearch.style.display = 'none';
    }
    const q = (builderSearchSites ? builderSearchSites.value : "").toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.slug || '').toLowerCase().includes(q)
      );
    }
    renderBuilderSites(filtered);
    renderConferenceSelector();
  }

  // Create Conference Modal
  const modalCreateConf = document.getElementById("modal-create-conference");
  const btnOpenCreateConf = document.getElementById("btn-open-create-conf-modal");
  const btnCloseCreateConf = document.getElementById("btn-close-create-conf");
  const btnCancelCreateConf = document.getElementById("btn-cancel-create-conf");

  if (btnOpenCreateConf) {
    btnOpenCreateConf.addEventListener("click", () => {
      if (modalCreateConf) {
        modalCreateConf.style.display = "flex";
        const nameInput = document.getElementById("conf-input-name");
        if (nameInput) {
          nameInput.value = "";
          nameInput.focus();
        }
        const descInput = document.getElementById("conf-input-desc");
        if (descInput) descInput.value = "";
      }
    });
  }

  function closeCreateConfModal() {
    if (modalCreateConf) modalCreateConf.style.display = "none";
  }
  if (btnCloseCreateConf) btnCloseCreateConf.addEventListener("click", closeCreateConfModal);
  if (btnCancelCreateConf) btnCancelCreateConf.addEventListener("click", closeCreateConfModal);

  window.handleCreateConferenceSubmit = async function(event) {
    event.preventDefault();
    const nameInput = document.getElementById("conf-input-name");
    const descInput = document.getElementById("conf-input-desc");
    const name = nameInput ? nameInput.value.trim() : "";
    const description = descInput ? descInput.value.trim() : "";

    if (!name) {
      showToast("Conference name is required", "error");
      return;
    }

    try {
      showToast("Creating conference workspace...", "info");
      const res = await fetch("/api/builder/conferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create conference");

      closeCreateConfModal();
      showToast(`Conference "${data.conference.name}" created!`, "success");
      selectedConferenceId = data.conference.conference_id;
      try { sessionStorage.setItem("scip_selected_conference", selectedConferenceId); } catch(e) {}
      await fetchConferences();
      await fetchBuilderSites();
    } catch(err) {
      showToast(`Error: ${err.message}`, "error");
    }
  };

  window.handleAssignConference = async function(siteId, conferenceId) {
    try {
      const res = await fetch(`/api/builder/sites/${siteId}/conference`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conference_id: conferenceId || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update conference");
      showToast("Website conference updated", "success");
      await fetchBuilderSites();
    } catch(err) {
      showToast(`Error: ${err.message}`, "error");
    }
  };

  // Fetch and Render Websites Dashboard
  async function fetchBuilderSites() {
    try {
      fetchTemplatesAndRenderWizard();
      await fetchConferences();
      const res = await fetch("/api/builder/sites");
      if (!res.ok) return;
      const data = await res.json();
      userWebsites = data.sites || [];
      applyConferenceFilter();
    } catch (e) {
      console.warn("Failed to load websites:", e);
    }
  }

  function renderBuilderSites(sites) {
    if (!builderSitesGrid) return;

    if (statTotalSites) {
      statTotalSites.textContent = `${sites.length} Website${sites.length === 1 ? '' : 's'}`;
    }

    if (sites.length === 0) {
      const q = (builderSearchSites ? builderSearchSites.value : "").trim();
      if (q) {
        builderSitesGrid.innerHTML = `
          <div class="empty-builder-state">
            <div class="empty-builder-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg></div>
            <h3>No Websites Found</h3>
            <p>No websites in this workspace match "<strong>${escapeHtml(q)}</strong>".</p>
            <button class="btn-secondary" onclick="document.getElementById('builder-search-sites').value=''; applyConferenceFilter();" style="margin-top: 0.75rem;">
              <span>Clear Search Filter</span>
            </button>
          </div>
        `;
      } else {
        const conf = userConferences.find(c => c.conference_id === selectedConferenceId);
        const confTitle = conf ? conf.name : "SciStudio Workspace";
        builderSitesGrid.innerHTML = `
          <div class="empty-builder-state">
            <div class="studio-empty-preview" aria-hidden="true"><div class="studio-preview-top"><i></i><i></i><i></i></div><div class="studio-preview-layout"><div><b></b><b></b><span></span><em></em></div><div class="studio-preview-art"></div></div><div class="studio-preview-tiles"><i></i><i></i><i></i></div></div>
            <span class="studio-empty-kicker">${escapeHtml(confTitle)}</span>
            <h3>Your next conference starts here.</h3>
            <p>Tell us about your event, choose a design, and make it yours in SciStudio.</p>
            <button class="btn-primary-action btn-scistudio-create" onclick="document.getElementById('btn-open-create-site-modal').click()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
              <span>Create Website</span>
            </button>
          </div>
        `;
      }
      return;
    }

    builderSitesGrid.innerHTML = sites.map(site => {
      const isPub = (site.status === "published");
      const url = `/sites/${site.slug}`;
      const viewUrl = isPub ? url : `/api/builder/sites/${encodeURIComponent(site.site_id)}/preview`;
      const updatedDate = site.updated_at ? site.updated_at.split('T')[0] : 'Recently';
      const conf = userConferences.find(c => c.conference_id === site.conference_id);

      return `
        <div class="builder-site-card" data-site-id="${site.site_id}">
          <div class="site-card-top">
            <div class="site-card-title-group">
              <h3 class="builder-site-title" title="${escapeHtml(site.name)}">${escapeHtml(site.name)}</h3>
              <div class="site-slug-pill-wrap">
                <span class="site-slug-icon" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
                <span class="site-slug-text">${url}</span>
                <a href="${viewUrl}" target="_blank" rel="noopener" class="site-slug-link-arrow" title="${isPub ? 'Open published website' : 'Preview draft'}">↗</a>
              </div>
            </div>
            <span class="site-status-badge ${isPub ? 'published' : 'draft'}">
              <span class="badge-dot"></span>
              ${isPub ? 'PUBLISHED' : 'DRAFT'}
            </span>
          </div>

          <div class="site-card-meta-row">
            ${conf 
              ? `<span class="site-conf-tag active"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4"/></svg> ${escapeHtml(conf.name)}</span>`
              : `<span class="site-conf-tag unassigned">No conference</span>`
            }
            <span class="site-date-text">Updated ${updatedDate}</span>
          </div>

          <div class="site-card-conf-row">
            <label for="conf-assign-${site.site_id}" class="site-conf-label">Conference:</label>
            <select id="conf-assign-${site.site_id}" class="site-conf-select" onchange="handleAssignConference('${site.site_id}', this.value)" title="Move site to another conference workspace">
              <option value="">Unassigned</option>
              ${userConferences.map(c => `<option value="${c.conference_id}" ${c.conference_id === site.conference_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>

          <div class="builder-site-actions">
            <button class="btn-card-action edit" onclick="openBuilderStudio('${site.site_id}')" title="Edit in SciStudio visual canvas">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Edit</span>
            </button>
            <a href="${viewUrl}" target="_blank" rel="noopener" class="btn-card-action view" title="${isPub ? 'View published website' : 'Preview draft'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>${isPub ? 'View' : 'Preview'}</span>
            </a>
            <a href="/api/builder/sites/${site.site_id}/export" class="btn-card-action export" title="Download standalone website ZIP package">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>ZIP</span>
            </a>
            <button class="btn-card-action delete" onclick="handleDeleteSite('${site.site_id}', '${escapeHtml(site.name)}')" title="Delete website permanently">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  // Filter / Search Websites
  const btnClearSearch = document.getElementById("btn-clear-search");
  if (builderSearchSites) {
    builderSearchSites.addEventListener("input", () => {
      if (btnClearSearch) {
        btnClearSearch.style.display = builderSearchSites.value ? "block" : "none";
      }
      applyConferenceFilter();
    });
  }
  if (btnClearSearch) {
    btnClearSearch.addEventListener("click", () => {
      if (builderSearchSites) builderSearchSites.value = "";
      btnClearSearch.style.display = "none";
      applyConferenceFilter();
    });
  }

  // Delete Site Handler
  window.handleDeleteSite = async function(siteId, siteName) {
    if (!confirm(`Are you sure you want to permanently delete "${siteName}"?`)) return;
    try {
      const res = await fetch(`/api/builder/sites/${siteId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to delete");
      showToast("Website deleted", "success");
      fetchBuilderSites();
    } catch (e) {
      showToast(`Error: ${e.message}`, "error");
    }
  };

  // Open Studio (Fullscreen Experience)

  // Editor history stores only editable content, never account or session data.
  let studioHistory = [], studioHistoryIndex = -1, studioSaved = '', studioSaving = false;
  const studioSnapshot = () => JSON.stringify({name: currentSite.name, theme_config: currentSite.theme_config, schema_json: currentSite.schema_json});
  function studioStatus() {
    const dirty = currentSite && studioSnapshot() !== studioSaved;
    const label = document.getElementById('studio-save-state');
    if (label) label.textContent = studioSaving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved';
    document.getElementById('studio-undo').disabled = studioHistoryIndex <= 0;
    document.getElementById('studio-redo').disabled = studioHistoryIndex >= studioHistory.length - 1;
    return dirty;
  }
  function studioRecord() {
    if (!currentSite) return;
    const state = studioSnapshot();
    if (studioHistory[studioHistoryIndex] !== state) {
      studioHistory.splice(studioHistoryIndex + 1);
      studioHistory.push(state);
      if (studioHistory.length > 100) studioHistory.shift();
      studioHistoryIndex = studioHistory.length - 1;
    }
    studioStatus();
    renderStudioLayers();
  }
  function studioTravel(direction) {
    const next = studioHistoryIndex + direction;
    if (!currentSite || next < 0 || next >= studioHistory.length) return;
    studioHistoryIndex = next;
    Object.assign(currentSite, JSON.parse(studioHistory[next]));
    studioSiteName.value = currentSite.name;
    const theme = currentSite.theme_config || {};
    themePrimaryColor.value = theme.primary_color || '#38bdf8';
    themeAccentColor.value = theme.accent_color || '#6366f1';
    themeBgPreset.value = theme.bg_color || '#0b0f19';
    studioFont.value = theme.font_family || "Inter, sans-serif";
    labelPrimaryColor.textContent = themePrimaryColor.value;
    labelAccentColor.textContent = themeAccentColor.value;
    renderCanvas();
    const selected = currentSite.schema_json.find(c => c.id === activeComponentId);
    if (selected) renderInspector(selected); else inspectorContent.innerHTML = '<p class="empty-inspector-notice">Select a section to customize it.</p>';
  }
  document.getElementById('studio-undo').onclick = () => studioTravel(-1);
  document.getElementById('studio-redo').onclick = () => studioTravel(1);
  studioSiteName.addEventListener('input', () => {
    if (currentSite) { currentSite.name = studioSiteName.value; studioRecord(); }
  });
  window.addEventListener('beforeunload', event => {
    if (currentSite && studioStatus()) { event.preventDefault(); event.returnValue = ''; }
  });
  document.addEventListener('keydown', event => {
    if (!currentSite || !(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 's') { event.preventDefault(); saveSiteDraft(); }
    if (event.target.closest('input,textarea,[contenteditable="true"]')) return;
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); studioTravel(event.shiftKey ? 1 : -1); }
  });
  document.getElementById('studio-library-search').addEventListener('input', event => {
    const term = event.target.value.toLowerCase();
    document.querySelectorAll('.btn-add-comp').forEach(button => button.hidden = !button.textContent.toLowerCase().includes(term));
  });
  function renderStudioLayers() {
    const list = document.getElementById('studio-layer-list');
    list.replaceChildren();
    (currentSite.schema_json || []).forEach((comp, index) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'studio-layer' + (comp.id === activeComponentId ? ' selected' : '');
      row.draggable = true; row.dataset.layerId = comp.id;
      row.textContent = `⠿  ${String(index + 1).padStart(2, '0')}  ${comp.title || comp.type}${comp.hidden ? ' · Hidden' : ''}`;
      row.onclick = () => { selectComponentForEditing(comp.id); document.querySelectorAll('[data-comp-id]').forEach(el => { if (el.dataset.compId === comp.id) el.scrollIntoView({block:'nearest'}); }); };
      list.append(row);
    });
  }
  window.duplicateStudioSection = id => {
    const index = currentSite.schema_json.findIndex(c => c.id === id);
    if (index < 0) return;
    const copy = JSON.parse(JSON.stringify(currentSite.schema_json[index]));
    copy.id = 'comp_' + crypto.randomUUID(); copy.title = (copy.title || copy.type) + ' copy';
    currentSite.schema_json.splice(index + 1, 0, copy);
    activeComponentId = copy.id; renderCanvas(); renderInspector(copy);
  };
  window.addStudioContentItem = id => {
    const comp = currentSite.schema_json.find(c => c.id === id);
    if (!comp) return;
    comp.data.items ||= []; comp.data.items.push({title:'New item',description:'',image:''});
    renderCanvas(); renderInspector(comp);
  };
  window.updateStudioStyle = (id, key, value) => {
    const comp = currentSite.schema_json.find(c => c.id === id);
    if (!comp) return;
    if (key === 'title') comp.title = value;
    else { comp.studio_style ||= {}; comp.studio_style[key] = value; }
    renderCanvas();
  };
  function studioSectionStyle(comp) {
    const style = comp.studio_style || {}, rules = [];
    for (const [key, css, max] of [['padding','padding',160],['radius','border-radius',80]]) {
      if (style[key] !== undefined && style[key] !== '') rules.push(`${css}:${Math.min(max, Math.max(0, Number(style[key]) || 0))}px`);
    }
    if (/^#[0-9a-f]{6}$/i.test(style.background || '')) rules.push(`background:${style.background}`,`--studio-section-ink:${StudioFormatting.contrast(style.background)}`);
    return rules.join(';');
  }
  function studioAppearanceControls(comp) {
    const style = comp.studio_style || {};
    return `<div class="inspector-card-group studio-appearance"><div class="inspector-group-title">Section appearance</div>
      <label>Section name<input class="inspector-input" value="${escapeHtml(comp.title || comp.type)}" oninput="updateStudioStyle('${comp.id}','title',this.value)"></label>
      <label>Outer spacing (px)<input class="inspector-input" type="range" min="0" max="160" value="${Number(style.padding) || 0}" oninput="this.nextElementSibling.textContent=this.value+' px'" onchange="updateStudioStyle('${comp.id}','padding',this.value)"><output>${style.padding === undefined || style.padding === '' ? 'Default' : Number(style.padding)+' px'}</output></label>
      <label>Corner radius (px)<input class="inspector-input" type="range" min="0" max="80" value="${Number(style.radius) || 0}" oninput="this.nextElementSibling.textContent=this.value+' px'" onchange="updateStudioStyle('${comp.id}','radius',this.value)"><output>${style.radius === undefined || style.radius === '' ? 'Default' : Number(style.radius)+' px'}</output></label>
      <label>Background<input class="inspector-input" type="color" value="${/^#[0-9a-f]{6}$/i.test(style.background || '') ? style.background : '#ffffff'}" oninput="updateStudioStyle('${comp.id}','background',this.value)"></label>
      <button type="button" class="btn-sec-tool" onclick="updateStudioStyle('${comp.id}','background','')">Reset background</button>
      <button type="button" class="btn-sec-tool" onclick="duplicateStudioSection('${comp.id}')">Duplicate section</button></div>`;
  }
  const studioFont = document.getElementById('studio-font');
  studioFont.addEventListener('change', () => { if (currentSite) { currentSite.theme_config ||= {}; currentSite.theme_config.font_family = studioFont.value; renderCanvas(); } });
  let studioDrag = null;
  document.querySelectorAll('.btn-add-comp').forEach(button => button.draggable = true);
  builderStudioView.addEventListener('dragstart', event => {
    const palette = event.target.closest('.btn-add-comp'), layer = event.target.closest('[data-layer-id]'), handle = event.target.closest('[data-drag-section]');
    studioDrag = palette ? {type:palette.dataset.type} : layer ? {id:layer.dataset.layerId} : handle ? {id:handle.dataset.dragSection} : null;
    if (!studioDrag) return;
    event.dataTransfer.setData('text/plain', JSON.stringify(studioDrag));
    event.dataTransfer.effectAllowed = studioDrag.type ? 'copy' : 'move';
  });
  function clearDropMark() { document.querySelectorAll('.studio-drop-before,.studio-drop-after').forEach(el => el.classList.remove('studio-drop-before','studio-drop-after')); }
  builderStudioView.addEventListener('dragover', event => {
    if (!studioDrag || !event.target.closest('#canvas-sections-list,#studio-layer-list')) return;
    event.preventDefault(); clearDropMark();
    const target = event.target.closest('[data-comp-id],[data-layer-id]');
    if (target) target.classList.add(event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? 'studio-drop-after' : 'studio-drop-before');
  });
  builderStudioView.addEventListener('drop', event => {
    if (!studioDrag || !event.target.closest('#canvas-sections-list,#studio-layer-list')) return;
    event.preventDefault();
    const target = event.target.closest('[data-comp-id],[data-layer-id]');
    const targetId = target?.dataset.compId || target?.dataset.layerId;
    const after = target?.classList.contains('studio-drop-after');
    clearDropMark();
    let id = studioDrag.id;
    if (studioDrag.type) { addNewComponent(studioDrag.type); id = activeComponentId; }
    if (id !== targetId) {
      const sections = currentSite.schema_json;
      const from = sections.findIndex(c => c.id === id);
      if (from >= 0) {
        const [moved] = sections.splice(from, 1);
        const to = sections.findIndex(c => c.id === targetId);
        sections.splice(to < 0 ? sections.length : to + (after ? 1 : 0), 0, moved);
        renderCanvas(); selectComponentForEditing(id);
      }
    }
    studioDrag = null;
  });
  builderStudioView.addEventListener('dragend', () => { studioDrag = null; clearDropMark(); });

  window.openBuilderStudio = async function(siteId) {
    try {
      showToast("Loading SciStudio...", "info");
      const res = await fetch(`/api/builder/sites/${siteId}`);
      if (!res.ok) throw new Error("Failed to load site");
      currentSite = await res.json();
      activeComponentId = null;
      studioHistory = []; studioHistoryIndex = -1; studioSaved = studioSnapshot();
      inspectorContent.innerHTML = '<p class="empty-inspector-notice">Select a section to customize its content and appearance.</p>';

      // Enter Fullscreen Studio Mode: hide app sidebar, topbar, status bar
      document.body.classList.add("studio-fullscreen-mode");

      if (builderDashboardView) builderDashboardView.style.display = "none";
      if (builderStudioView) builderStudioView.style.display = "flex";

      if (studioSiteName) studioSiteName.value = currentSite.name || "My Website";
      if (studioSiteStatus) {
        const isPub = (currentSite.status === "published");
        studioSiteStatus.textContent = isPub ? "Published" : "Draft";
        studioSiteStatus.className = `site-status-badge ${isPub ? 'published' : 'draft'}`;
      }

      // Populate Studio User Profile Chip
      const mainUserName = document.getElementById("user-chip-name");
      const studioUserName = document.getElementById("studio-user-name");
      if (mainUserName && studioUserName) {
        studioUserName.textContent = mainUserName.textContent || "Root Administrator";
      }
      const studioUserTier = document.getElementById("studio-user-tier");
      if (studioUserTier) {
        studioUserTier.textContent = "PRO";
      }

      // Studio Sign Out Button Hookup
      const btnStudioSignout = document.getElementById("btn-studio-signout");
      if (btnStudioSignout) {
        btnStudioSignout.onclick = () => {
          if (studioStatus() && !confirm("Sign out and discard unsaved changes?")) return;
          document.body.classList.remove("studio-fullscreen-mode");
          const mainSignOut = document.getElementById("btn-sign-out");
          if (mainSignOut) {
            mainSignOut.click();
          } else {
            renderUnauthenticatedState();
          }
        };
      }

      studioFont.value = currentSite.theme_config?.font_family || "Inter, sans-serif";
      // Initialize Theme Pickers
      const theme = currentSite.theme_config || {};
      if (themePrimaryColor) {
        themePrimaryColor.value = theme.primary_color || "#38bdf8";
        if (labelPrimaryColor) labelPrimaryColor.textContent = themePrimaryColor.value;
      }
      if (themeAccentColor) {
        themeAccentColor.value = theme.accent_color || "#6366f1";
        if (labelAccentColor) labelAccentColor.textContent = themeAccentColor.value;
      }
      if (themeBgPreset) {
        themeBgPreset.value = theme.bg_color || "#0b0f19";
      }

      renderCanvas();
      showToast(`Editing: ${currentSite.name}`, "success");
    } catch (e) {
      showToast(`Studio error: ${e.message}`, "error");
    }
  };

  // Back to Dashboard (Exit Fullscreen Studio)
  if (btnStudioBack) {
    btnStudioBack.addEventListener("click", () => {
      if (studioStatus() && !confirm("Leave the editor and discard unsaved changes?")) return;
      document.body.classList.remove("studio-fullscreen-mode");
      currentSite = null;
      activeComponentId = null;
      if (builderStudioView) builderStudioView.style.display = "none";
      if (builderDashboardView) builderDashboardView.style.display = "block";
      fetchBuilderSites();
    });
  }


  let studioInspectorTab = 'content';
  let studioInsertBefore = null;
  const studioLayoutChoices = [ ['split','Split showcase'], ['conference_program','Event details'], ['centered','Centered'], ['image_left','Image left'], ['image_top','Image first'], ['text_only','Typography'] ];
  const studioGenericTypes = ['about','stats','agenda','sponsors','testimonials','announcement'];
  function studioMiniature(key) {
    return `<span class="studio-miniature miniature-${key}" aria-hidden="true"><i class="mini-copy"><b></b><b></b><em></em></i><i class="mini-image"></i><i class="mini-bottom"></i></span>`;
  }
  function applyInspectorTab() {
    document.querySelectorAll('[data-inspector-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.inspectorTab === studioInspectorTab)));
    inspectorContent.querySelectorAll('[data-settings-pane]').forEach(pane => pane.hidden = pane.dataset.settingsPane !== studioInspectorTab);
  }
  document.querySelectorAll('[data-inspector-tab]').forEach(button => button.addEventListener('click', () => {
    studioInspectorTab = button.dataset.inspectorTab; applyInspectorTab();
  }));
  function organizeStudioInspector(comp) {
    const content = document.createElement('div'); content.dataset.settingsPane = 'content';
    const design = document.createElement('div'); design.dataset.settingsPane = 'design';
    const advanced = document.createElement('div'); advanced.dataset.settingsPane = 'advanced';
    // Keep every existing editor control; move whole groups rather than cloning listeners.
    [...inspectorContent.children].forEach(child => {
      const heading = child.querySelector('.inspector-group-title')?.textContent.trim() || '';
      if (child.classList.contains('studio-appearance')) design.append(child);
      else if (heading === 'Media Display') design.append(child);
      else content.append(child);
    });
    const visualFields = document.createElement('div'); visualFields.className='inspector-card-group';
    const visualHeading = document.createElement('div'); visualHeading.className='inspector-group-title'; visualHeading.textContent='Typography, buttons & images';
    visualFields.append(visualHeading);
    content.querySelectorAll('.inspector-field').forEach(field=>{
      const controls=[...field.querySelectorAll('input,select,button')];
      const handlers=controls.map(control=>(control.getAttribute('onchange') || '')+' '+(control.getAttribute('oninput') || '')+' '+(control.getAttribute('onclick') || '')).join(' ');
      if (/headline_size|headline_weight|headline_gradient|gradient_preset|primary_btn_style|primary_btn_radius|primary_btn_text_color|hero_image_radius|hero_image_shadow|hero_image_aspect|setHeroTextAlign|setPrimaryBtnRadius/.test(handlers)) visualFields.append(field);
    });
    if(visualFields.children.length>1) design.append(visualFields);
    // Replace the existing layout dropdowns with visual design choices.
    const choices = comp.type === 'hero' ? studioLayoutChoices : studioGenericTypes.includes(comp.type) ? [['grid','Card grid'],['list','Editorial list'],['spotlight','Spotlight']] : [];
    if (choices.length) {
      const key = comp.type === 'hero' ? 'layout_variant' : 'design';
      content.querySelectorAll('select').forEach(select => {
        const handler = select.getAttribute('onchange') || '';
        if (handler.includes('setHeroLayoutVariant') || handler.includes("'design'")) select.parentElement.remove();
      });
      const picker = document.createElement('div'); picker.className = 'studio-design-picker';
      const active = comp.data?.[key] || choices[0][0];
      picker.innerHTML = `<p class="studio-settings-help">Choose a layout. Your content stays intact.</p><div class="studio-design-grid">${choices.map(([value,label]) => `<button type="button" data-design="${value}" aria-pressed="${active === value}">${studioMiniature(value)}<span>${label}</span></button>`).join('')}</div>`;
      picker.querySelectorAll('button').forEach(button => button.onclick = () => {
        updateField(comp.id,key,button.dataset.design); renderInspector(comp);
      });
      design.prepend(picker);
    }
    const heading = document.createElement('div'); heading.className = 'studio-selection-heading';
    heading.textContent = comp.title || comp.type;
    advanced.innerHTML = `<p class="studio-settings-help">Section visibility</p><label class="studio-setting-check"><input type="checkbox" ${comp.hidden ? 'checked' : ''}> Hide on the website</label><p class="studio-settings-help">Hidden sections remain in the outline and can be restored.</p><button type="button" class="studio-reset-style">Reset section appearance</button>`;
    advanced.querySelector('input').onchange = event => {
      comp.hidden = event.target.checked; renderCanvas(); renderInspector(comp);
    };
    advanced.querySelector('button').onclick = () => {
      if (!confirm('Reset this section’s spacing, background and corners? Content will be kept.')) return;
      comp.studio_style = {}; renderCanvas(); renderInspector(comp);
    };
    if (comp.type === 'custom') { while (content.firstChild) advanced.append(content.firstChild); content.innerHTML = '<p class="studio-settings-help">Edit this HTML/CSS embed in Advanced.</p>'; }
    inspectorContent.replaceChildren(heading,content,design,advanced);
    applyInspectorTab();
  }
  const studioLibrary = document.createElement('dialog');
  studioLibrary.className = 'studio-library-dialog';
  studioLibrary.innerHTML = `<div class="studio-library-heading"><div><span class="studio-library-eyebrow">BUILD YOUR PAGE</span><h2>Add a section</h2><p>Choose a starting point. Make it yours on the canvas.</p></div><button type="button" class="studio-library-close" aria-label="Close section library">×</button></div><input type="search" class="studio-library-filter" aria-label="Search section library" placeholder="Search sections…"><div class="studio-library-cards"></div>`;
  document.body.append(studioLibrary);
  studioLibrary.querySelector('.studio-library-close').onclick = () => studioLibrary.close();
  studioLibrary.addEventListener('click', event => { if (event.target === studioLibrary) { const r=studioLibrary.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) studioLibrary.close(); } });
  studioLibrary.querySelector('input').oninput = event => {
    const q = event.target.value.toLowerCase();
    studioLibrary.querySelectorAll('[data-library-type]').forEach(card => card.hidden = !card.textContent.toLowerCase().includes(q));
  };
  window.openStudioLibrary = (beforeId = null) => {
    if (!currentSite) return;
    studioInsertBefore = beforeId;
    const cards = studioLibrary.querySelector('.studio-library-cards'); cards.replaceChildren();
    document.querySelectorAll('.btn-add-comp').forEach(source => {
      const button = document.createElement('button'); button.type='button'; button.dataset.libraryType=source.dataset.type;
      const title=source.querySelector('.comp-title')?.textContent || source.dataset.type;
      const description=source.querySelector('.comp-desc')?.textContent || '';
      const visual = source.dataset.type === 'hero' ? 'split' : ['gallery','speakers','pricing'].includes(source.dataset.type) ? 'grid' : 'list';
      button.innerHTML=studioMiniature(visual)+`<strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span>`;
      button.onclick=() => {
        addNewComponent(source.dataset.type);
        const sections=currentSite.schema_json; const index=sections.findIndex(c=>c.id===studioInsertBefore);
        if(index>=0) { const inserted=sections.pop(); sections.splice(index,0,inserted); renderCanvas(); }
        studioLibrary.close(); selectComponentForEditing(activeComponentId);
      };
      cards.append(button);
    });
    studioLibrary.querySelector('input').value=''; studioLibrary.showModal();
    studioLibrary.querySelector('input').focus();
  };
  document.getElementById('studio-zoom').addEventListener('change',fitStudioCanvas);
  for (const [id,cls] of [['studio-left-toggle','studio-left-hidden'],['studio-right-toggle','studio-right-hidden']]) {
    document.getElementById(id).onclick=event=>{
      builderStudioView.classList.remove('studio-panels-hidden');
      document.getElementById('studio-toggle-panels').textContent='Expand canvas';
      document.getElementById('studio-toggle-panels').setAttribute('aria-pressed','false');
      const hidden=builderStudioView.classList.toggle(cls);
      event.currentTarget.setAttribute('aria-pressed',String(!hidden));
      requestAnimationFrame(fitStudioCanvas);
    };
  }
  document.getElementById('btn-device-tablet').onclick=()=>{
    builderCanvasFrame.classList.remove('mobile-view'); builderCanvasFrame.classList.add('tablet-view');
    document.querySelectorAll('.btn-device-toggle').forEach(button=>button.classList.toggle('active',button.id==='btn-device-tablet'));
    fitStudioCanvas();
  };

  let studioQuickTarget=null, studioCopiedStyle=null;
  const studioQuick=document.createElement('div');studioQuick.className='studio-quick-toolbar';studioQuick.hidden=true;
  studioQuick.setAttribute('role','region');studioQuick.setAttribute('aria-label','Selected element controls');document.body.append(studioQuick);
  function studioValue(comp,path) {return path.reduce((obj,key)=>obj?.[key],comp.data);}
  function studioSetValue(comp,path,value) {let obj=comp.data;for(const key of path.slice(0,-1))obj=obj[key];obj[path.at(-1)]=value;}
  function studioAllFields(object,path=[],result=[]) {Object.entries(object||{}).forEach(([key,value])=>{if(typeof value==='string')result.push({path:[...path,key],value});else if(value&&typeof value==='object')studioAllFields(value,[...path,key],result);});return result;}
  function sectionStudioTheme(comp) {
    const theme={...(currentSite.theme_config||{})},bg=comp.studio_style?.background;
    if(/^#[0-9a-f]{6}$/i.test(bg||'')){theme.bg_color=bg;theme.mode=StudioFormatting.contrast(bg)==='#ffffff'?'dark':'light';theme.primary_color=StudioFormatting.contrast(bg,theme.primary_color||'#6658d9');}
    return theme;
  }
  function closeStudioQuick(){studioQuick.hidden=true;studioQuickTarget=null;}
  function positionStudioQuick(node) {
    const r=node.getBoundingClientRect(),width=Math.min(620,window.innerWidth-24);
    studioQuick.style.width=width+'px';studioQuick.style.left=Math.max(12,Math.min(window.innerWidth-width-12,r.left))+'px';
    studioQuick.style.top=Math.max(12,Math.min(window.innerHeight-studioQuick.offsetHeight-12,r.top-studioQuick.offsetHeight-10))+'px';
  }
  function reopenStudioQuick() {
    if(!studioQuickTarget)return;
    const {comp,path,kind}=studioQuickTarget,key=JSON.stringify(path);
    const node=[...canvasSectionsList.querySelectorAll('[data-studio-format-key]')].find(el=>el.dataset.studioFormatKey===key&&el.closest('[data-comp-id]').dataset.compId===comp.id);
    if(node){studioQuickTarget.node=node;positionStudioQuick(node);}else closeStudioQuick();
  }
  function refreshStudioQuick() {renderCanvas();renderInspector(studioQuickTarget.comp);reopenStudioQuick();}
  function applyQuickStyle(patch) {
    if(!studioQuickTarget)return;
    if(patch.href&&!/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(patch.href)){showToast('Use an https:// URL, #section, mailto: or tel: link.','error');return;}
    const {comp,path,kind,start,end}=studioQuickTarget,key=JSON.stringify(path);
    if(kind==='image'){comp.image_formats||={};Object.assign(comp.image_formats[key]||={},patch);}
    else {
      comp.field_formats||={};const format=comp.field_formats[key]||={style:{},runs:[]};
      if(Number.isInteger(start)&&end>start&&!patch.align&&!patch.lineHeight){format.runs.push({start,end,style:patch});format.runs=format.runs.slice(-100);}
      else Object.assign(format.style,patch);
    }
    refreshStudioQuick();
  }
  window.chooseStudioImage = id => {
    const comp=currentSite.schema_json.find(item=>item.id===id);if(!comp)return;
    const node=[...canvasSectionsList.querySelectorAll('[data-comp-id]')].find(item=>item.dataset.compId===id);
    studioQuickTarget={comp,path:['image_url'],node,kind:'image'};
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif';input.onchange=()=>uploadStudioImage(input.files[0]);input.click();
  };
  async function uploadStudioImage(file) {
    if(!studioQuickTarget||!file)return;
    const target=studioQuickTarget;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024){showToast('Choose a PNG, JPG, WebP or GIF under 8 MB.','error');return;}
    try {
      const bitmap=await createImageBitmap(file),ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const url=canvas.toDataURL('image/webp',.85);
      if(url.length>3*1024*1024)throw new Error('Image is too large after compression. Please choose a smaller image.');
      if(!currentSite?.schema_json.includes(target.comp))return;
      studioSetValue(target.comp,target.path,url);renderCanvas();renderInspector(target.comp);reopenStudioQuick();showToast('Image added and optimized. Save to keep your changes.','success');
    }catch(error){showToast(error.message||'Unable to read this image.','error');}
  }
  function openStudioQuick(comp,path,node,kind='text') {
    const linkKeys={primary_btn_text:'primary_btn_url',secondary_btn_text:'secondary_btn_url',cta_label:'cta_url',btn_label:'btn_url'};
    const linkKey=kind==='text'?linkKeys[path.at(-1)]:null;
    const linkPath=linkKey?[...path.slice(0,-1),linkKey]:null;
    studioQuickTarget={comp,path,node,kind,start:null,end:null};
    const key=JSON.stringify(path),style=kind==='image'?(comp.image_formats?.[key]||{}):(comp.field_formats?.[key]?.style||{});
    studioQuick.hidden=false;
    const select=(name,label,values,value)=>`<label>${label}<select data-quick="${name}">${values.map(([v,t])=>`<option value="${v}" ${String(value)===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    studioQuick.innerHTML=`<div class="studio-quick-heading"><strong>${kind==='image'?'Image':linkKey?'Button':'Text'}</strong><span class="studio-quick-scope">${kind==='image'?'Drop an image here to replace':'Whole text · select words to format part'}</span><button type="button" data-action="close" aria-label="Close formatting">×</button></div><div class="studio-quick-controls">${kind==='text'?`
      ${select('font','Font',StudioFormatting.fonts.map(font=>[font,font.split(',')[0]]),style.font||'Inter, sans-serif')}
      <label>Size<input data-quick="size" type="number" min="10" max="120" value="${style.size||Math.round(parseFloat(getComputedStyle(node).fontSize))}"></label>
      <label>Color<input data-quick="color" type="color" value="${style.color||StudioFormatting.contrast(comp.studio_style?.background||currentSite.theme_config?.bg_color||'#ffffff')}"></label>
      <button type="button" data-action="bold" aria-label="Toggle bold"><b>B</b></button><button type="button" data-action="italic" aria-label="Toggle italic"><i>I</i></button><button type="button" data-action="underline" aria-label="Toggle underline"><u>U</u></button>
      ${select('align','Align',[['left','Left'],['center','Center'],['right','Right']],style.align||'left')}
      ${select('lineHeight','Line height',[['1.2','Tight'],['1.5','Normal'],['1.8','Relaxed'],['2','Wide']],String(style.lineHeight||1.5))}
      <button type="button" data-action="edit">Edit text</button><button type="button" data-action="whole">Whole text</button>${linkPath?`<label>Button destination<input data-button-url value="${escapeHtml(studioValue(comp,linkPath)||'#')}" placeholder="https://… or #section"></label>`:`<label>Link<input data-quick="href" value="${escapeHtml(style.href||'')}" placeholder="https://… or #section"></label>`}`:`
      <button type="button" data-action="upload">Upload image</button><input type="file" class="studio-image-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      <label class="studio-image-url">Image URL<input data-image-url value="${String(studioValue(comp,path)).startsWith('data:')?'':escapeHtml(studioValue(comp,path)||'')}" placeholder="https://…"></label>
      ${select('fit','Fit',[['cover','Fill / crop'],['contain','Fit inside']],style.fit||'cover')}
      ${select('position','Focus',[['center','Center'],['top','Top'],['bottom','Bottom'],['left','Left'],['right','Right']],style.position||'center')}
      <label>Height<input data-quick="height" type="number" min="40" max="1200" value="${style.height||Math.round(node.getBoundingClientRect().height)}"></label>
      <label>Corners<input data-quick="radius" type="number" min="0" max="100" value="${style.radius||0}"></label>
      <label>Alt text<input data-quick="alt" value="${escapeHtml(style.alt||node.alt||'')}"></label>`}
      <button type="button" data-action="copy">Copy style</button><button type="button" data-action="paste" ${studioCopiedStyle?.kind===kind?'':'disabled'}>Paste style</button><button type="button" data-action="reset">Reset</button></div>`;
    studioQuick.querySelectorAll('[data-quick]').forEach(control=>control.onchange=()=>applyQuickStyle({[control.dataset.quick]:control.value}));
    studioQuick.querySelectorAll('button').forEach(button=>{
      button.onmousedown=event=>event.preventDefault();
      button.onclick=()=>{
        const action=button.dataset.action,target=studioQuickTarget;if(!target)return;
        const format=target.comp.field_formats?.[key];
        const effective={...(format?.style||{})};
        if(target.end>target.start)for(const run of format?.runs||[])if(run.start<=target.start&&run.end>=target.end)Object.assign(effective,run.style);
        if(action==='close')closeStudioQuick();
        else if(action==='bold')applyQuickStyle({weight:effective.weight==='700'?'400':'700'});
        else if(action==='italic')applyQuickStyle({italic:effective.italic==='italic'?'normal':'italic'});
        else if(action==='underline')applyQuickStyle({decoration:effective.decoration==='underline'?'none':'underline'});
        else if(action==='whole'){target.start=null;target.end=null;studioQuick.querySelector('.studio-quick-scope').textContent='Whole text';}
        else if(action==='edit')target.node.ondblclick?.({preventDefault(){},stopPropagation(){}});
        else if(action==='copy'){studioCopiedStyle={kind,style:structuredClone(kind==='image'?(comp.image_formats?.[key]||{}):effective)};studioQuick.querySelector('[data-action=paste]').disabled=false;showToast('Style copied. Select another element to paste it.','info');}
        else if(action==='paste'&&studioCopiedStyle?.kind===kind)applyQuickStyle(studioCopiedStyle.style);
        else if(action==='reset'){if(kind==='image')delete (comp.image_formats||{})[key];else delete (comp.field_formats||{})[key];refreshStudioQuick();openStudioQuick(comp,path,studioQuickTarget.node,kind);}
        else if(action==='upload')studioQuick.querySelector('.studio-image-file').click();
      };
    });
    if(linkPath)studioQuick.querySelector('[data-button-url]').onchange=event=>{const url=event.target.value.trim();if(!/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(url)){showToast('Use an https:// URL, #section, mailto: or tel: link.','error');return;}studioSetValue(comp,linkPath,url);refreshStudioQuick();};
    if(kind==='image'){
      studioQuick.querySelector('.studio-image-file').onchange=event=>uploadStudioImage(event.target.files[0]);
      studioQuick.querySelector('[data-image-url]').onchange=event=>{const url=event.target.value.trim();if(!/^(https?:\/\/|\/(?!\/))/.test(url)){showToast('Use an https:// image URL or upload an image.','error');return;}studioSetValue(comp,path,url);refreshStudioQuick();};
    }
    positionStudioQuick(node);
    captureStudioSelection();
  }
  function captureStudioSelection(){
    if(!studioQuickTarget||studioQuickTarget.kind!=='text')return;
    const selection=window.getSelection();if(!selection.rangeCount||selection.isCollapsed)return;
    const range=selection.getRangeAt(0),node=studioQuickTarget.node;
    if(!node.contains(range.startContainer)||!node.contains(range.endContainer))return;
    const before=range.cloneRange();before.selectNodeContents(node);before.setEnd(range.startContainer,range.startOffset);
    studioQuickTarget.start=Array.from(before.toString()).length;studioQuickTarget.end=studioQuickTarget.start+Array.from(range.toString()).length;
    studioQuick.querySelector('.studio-quick-scope').textContent='Selected words';
  }
  document.addEventListener('selectionchange',captureStudioSelection);
  document.addEventListener('pointerdown',event=>{if(!studioQuick.hidden&&!studioQuick.contains(event.target)&&!event.target.closest('.studio-inline-text,.studio-edit-image'))closeStudioQuick();});
  window.addEventListener('resize',closeStudioQuick);
  builderCanvasFrame.parentElement.addEventListener('scroll',closeStudioQuick);

  // Find unambiguous leaf text fields; editing never rewrites a section's HTML.
  function wireStudioInlineEditing() {
    canvasSectionsList.querySelectorAll('[data-comp-id]').forEach(wrapper=>{
      const comp=currentSite.schema_json.find(c=>c.id===wrapper.dataset.compId); if(!comp || comp.hidden) return;
      const fields=[];
      function visit(object,path=[]) {
        Object.entries(object || {}).forEach(([key,value])=>{
          if(typeof value==='string' && value.trim() && !/url|image|photo|icon|html|color|variant|style|preset|align|radius|shadow|aspect|design/i.test(key)) fields.push({path:[...path,key],value});
          else if(value && typeof value==='object') visit(value,[...path,key]);
        });
      }
      visit(comp.data);
      wrapper.querySelectorAll('.section-preview-render h1,.section-preview-render h2,.section-preview-render h3,.section-preview-render h4,.section-preview-render p,.section-preview-render span').forEach(node=>{
        if(node.children.length) return;
        const matches=fields.filter(field=>field.value.trim()===node.textContent.trim()); if(matches.length!==1) return;
        node.dataset.studioFormatKey=JSON.stringify(matches[0].path);
        node.onclick=event=>{event.stopPropagation();if(studioQuickTarget?.node!==node)openStudioQuick(comp,matches[0].path,node);captureStudioSelection();};
        node.classList.add('studio-inline-text'); node.tabIndex=0; node.title='Double-click to edit text';
        const startEdit=event=>{
          event.preventDefault(); event.stopPropagation(); if(node.isContentEditable) return;
          selectComponentForEditing(comp.id);
          const before=node.textContent; node.contentEditable='plaintext-only'; node.focus();
          const range=document.createRange(); range.selectNodeContents(node); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
          let cancelled=false;
          node.onkeydown=e=>{ if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();node.blur();saveSiteDraft();} else if(e.key==='Escape'){cancelled=true;node.blur();} else if(e.key==='Enter' && !e.shiftKey){e.preventDefault();node.blur();} e.stopPropagation(); };
          node.onblur=()=>{
            const value=cancelled ? before : node.textContent;
            node.contentEditable='false'; node.onkeydown=null; node.onblur=null;
            let target=comp.data; const path=matches[0].path; for(const key of path.slice(0,-1)) target=target[key];
            target[path.at(-1)]=value; if(value!==before&&comp.field_formats?.[JSON.stringify(path)])comp.field_formats[JSON.stringify(path)].runs=[]; renderCanvas(); renderInspector(comp);reopenStudioQuick();
          };
        };
        node.ondblclick=startEdit;
        node.onkeydown=event=>{if(event.key==='Enter')startEdit(event);};
        const format=comp.field_formats?.[JSON.stringify(matches[0].path)];if(format){node.innerHTML=StudioFormatting.markup(node.textContent,format,/btn_text|btn_label|cta_label/.test(matches[0].path.at(-1))?null:comp.studio_style?.background||currentSite.theme_config?.bg_color);node.querySelectorAll('a').forEach(link=>link.onclick=event=>event.preventDefault());}
      });
      wrapper.querySelectorAll('.section-preview-render img').forEach(image=>{
        const candidates=studioAllFields(comp.data).filter(field=>field.value===image.getAttribute('src'));if(candidates.length!==1)return;
        const path=candidates[0].path,key=JSON.stringify(path);image.dataset.studioFormatKey=key;
        const format=comp.image_formats?.[key];if(format){image.style.cssText+=';'+StudioFormatting.css(format);if(format.alt!==undefined)image.alt=format.alt;}
        image.classList.add('studio-edit-image');image.title='Click to replace or style this image';
        image.onclick=event=>{event.preventDefault();event.stopPropagation();openStudioQuick(comp,path,image,'image');};
        image.ondragover=event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();};
        image.ondrop=event=>{if(event.dataTransfer.files.length){event.preventDefault();event.stopPropagation();openStudioQuick(comp,path,image,'image');uploadStudioImage(event.dataTransfer.files[0]);}};
      });
    });
  }

  // Preserve the selected viewport width; scale the canvas instead of squeezing it.
  function fitStudioCanvas() {
    if (!builderCanvasFrame || !currentSite) return;
    const wrapper = builderCanvasFrame.parentElement;
    if (!wrapper.clientWidth) return;
    const box = getComputedStyle(wrapper);
    const available = wrapper.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
    const width = builderCanvasFrame.classList.contains('mobile-view') ? 380 : builderCanvasFrame.classList.contains('tablet-view') ? 768 : 1440;
    const zoom = document.getElementById('studio-zoom').value;
    const scale = zoom === 'fit' ? Math.min(1, Math.max(0.1, available / width)) : Number(zoom);
    builderCanvasFrame.style.width = width + 'px';
    builderCanvasFrame.style.zoom = String(scale);
    document.getElementById('studio-canvas-scale').textContent = `${width}px · ${Math.round(scale * 100)}%`;
  }
  const canvasResizeObserver = new ResizeObserver(() => fitStudioCanvas());
  if (builderCanvasFrame) canvasResizeObserver.observe(builderCanvasFrame.parentElement);
  document.getElementById('studio-toggle-panels').addEventListener('click', event => {
    const expanded = builderStudioView.classList.toggle('studio-panels-hidden');
    event.currentTarget.setAttribute('aria-pressed', String(expanded));
    event.currentTarget.textContent = expanded ? 'Show panels' : 'Expand canvas';
    requestAnimationFrame(fitStudioCanvas);
  });

  // Device Responsive Switchers
  if (btnDeviceDesktop && btnDeviceMobile && builderCanvasFrame) {
    btnDeviceDesktop.addEventListener("click", () => {
      btnDeviceDesktop.classList.add("active");
      btnDeviceMobile.classList.remove("active");
      builderCanvasFrame.classList.remove("mobile-view", "tablet-view");
      document.getElementById("btn-device-tablet").classList.remove("active");
      fitStudioCanvas();
    });
    btnDeviceMobile.addEventListener("click", () => {
      btnDeviceMobile.classList.add("active");
      btnDeviceDesktop.classList.remove("active");
      builderCanvasFrame.classList.remove("tablet-view");
      document.getElementById("btn-device-tablet").classList.remove("active");
      builderCanvasFrame.classList.add("mobile-view");
      fitStudioCanvas();
    });
  }

  // Theme Controls in Studio Bottom Bar
  if (themePrimaryColor) {
    themePrimaryColor.addEventListener("input", () => {
      if (!currentSite) return;
      if (!currentSite.theme_config) currentSite.theme_config = {};
      currentSite.theme_config.primary_color = themePrimaryColor.value;
      if (labelPrimaryColor) labelPrimaryColor.textContent = themePrimaryColor.value;
      renderCanvas();
    });
  }
  if (themeAccentColor) {
    themeAccentColor.addEventListener("input", () => {
      if (!currentSite) return;
      if (!currentSite.theme_config) currentSite.theme_config = {};
      currentSite.theme_config.accent_color = themeAccentColor.value;
      if (labelAccentColor) labelAccentColor.textContent = themeAccentColor.value;
      renderCanvas();
    });
  }
  if (themeBgPreset) {
    themeBgPreset.addEventListener("change", () => {
      if (!currentSite) return;
      if (!currentSite.theme_config) currentSite.theme_config = {};
      currentSite.theme_config.bg_color = themeBgPreset.value;
      currentSite.theme_config.mode = ["#ffffff", "#f8fafc"].includes(themeBgPreset.value) ? "light" : "dark";
      renderCanvas();
    });
  }

  // Save Site Draft
  async function saveSiteDraft(silent = false) {
    if (!currentSite || studioSaving) return false;
    studioSaving = true; studioStatus();
    const savingSite = currentSite;
    try {
      if (studioSiteName) currentSite.name = studioSiteName.value.trim() || currentSite.name;
      const savedSnapshot = studioSnapshot();
      const res = await fetch(`/api/builder/sites/${currentSite.site_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentSite)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save draft");
      if (currentSite === savingSite) studioSaved = savedSnapshot;
      if (!silent) showToast("Website draft saved successfully!", "success");
      return true;
    } catch (e) {
      if (!silent) showToast(`Save error: ${e.message}`, "error");
      if (silent) throw e;
      return false;
    } finally { studioSaving = false; studioStatus(); }
  }

  if (btnStudioSave) btnStudioSave.addEventListener("click", () => saveSiteDraft(false));

  // Publish Site Live
  if (btnStudioPublish) {
    btnStudioPublish.addEventListener("click", async () => {
      if (!currentSite) return;
      try {
        if (!await saveSiteDraft(true)) return;
        const res = await fetch(`/api/builder/sites/${currentSite.site_id}/publish`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Publish failed");
        currentSite.status = "published";
        if (studioSiteStatus) {
          studioSiteStatus.textContent = "Published";
          studioSiteStatus.className = "site-status-badge published";
        }
        showToast("🚀 Website is LIVE and accessible to the public!", "success");
      } catch (e) {
        showToast(`Publish error: ${e.message}`, "error");
      }
    });
  }

  // Preview Site in New Tab
  if (btnStudioPreview) {
    btnStudioPreview.addEventListener("click", async () => {
      if (!currentSite || studioSaving) return;
      const previewSite = currentSite;
      const previewWindow = window.open('about:blank', '_blank');
      if (!previewWindow) { showToast('Allow popups to open the website preview.', 'info'); return; }
      previewWindow.opener = null;
      if (await saveSiteDraft(false)) previewWindow.location.href = `/api/builder/sites/${encodeURIComponent(previewSite.site_id)}/preview`;
      else previewWindow.close();
    });
  }

  // Export ZIP
  if (btnStudioExport) {
    btnStudioExport.addEventListener("click", async () => {
      if (!currentSite) return;
      if (await saveSiteDraft(false)) window.location.href = `/api/builder/sites/${currentSite.site_id}/export`;
    });
  }

  // Add Component from Left Palette
  document.querySelectorAll(".btn-add-comp").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!currentSite) return;
      const type = btn.getAttribute("data-type");
      addNewComponent(type);
    });
  });

  function addNewComponent(type) {
    if (!currentSite) return;
    if (!currentSite.schema_json) currentSite.schema_json = [];

    const newId = `comp_${type}_${crypto.randomUUID()}`;
    let compData = {};

    if(type==='image'){compData={image_url:'',caption:''};}
    else if (['about','stats','agenda','sponsors','testimonials','announcement'].includes(type)) {
      compData = {section_title: {about:'About the conference',stats:'Our conference in numbers',agenda:'Scientific program',sponsors:'Partners and exhibitors',testimonials:'What participants say',announcement:'Important update'}[type], section_subtitle:'Add your conference details here.', design:'grid', items:[{title:'Add a title',description:'Add your content.',image:''}]};
    } else if (type === "custom") {
      compData = {html: '<section style="padding:40px;font-family:system-ui"><h2>Your custom section</h2><p>Edit this HTML and add your own CSS.</p></section>', height: 300};
    } else if (type === "hero") {
      compData = {
        eyebrow: "🌟 NEW HIGHLIGHT 2026",
        headline: "Innovative Research & Outreach",
        headline_gradient: true,
        gradient_preset: "cyan_blue",
        subheadline: "Join leading researchers, faculty, and industry pioneers for groundbreaking discoveries.",
        primary_btn_text: "Register Today",
        primary_btn_url: "#contact",
        primary_btn_style: "gradient",
        primary_btn_radius: "pill",
        secondary_btn_text: "Explore Tracks",
        secondary_btn_url: "#features",
        hero_image: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=900&auto=format&fit=crop&q=80",
        hero_image_radius: "14px",
        hero_image_shadow: "deep",
        hero_image_aspect: "16/9"
      };
    } else if (type === "features") {
      compData = {
        section_tag: "KEY PILLARS",
        section_title: "Conference Scientific Tracks",
        section_subtitle: "Accelerating discovery across multidisciplinary boundaries.",
        items: [
          { icon: "fa-solid fa-microscope", title: "Laboratory Discoveries", description: "Novel diagnostic tools and biochemical methods." },
          { icon: "fa-solid fa-dna", title: "Precision Genetics", description: "Targeted cellular therapies and molecular markers." },
          { icon: "fa-solid fa-brain", title: "Computational Models", description: "High-throughput modeling and predictive biomarkers." }
        ]
      };
    } else if (type === "speakers") {
      compData = {
        section_tag: "FACULTY",
        section_title: "Distinguished Keynote Speakers",
        section_subtitle: "Pioneering faculty and principal investigators presenting revolutionary work.",
        speakers: [
          {
            name: "Prof. Elena Rostova",
            role: "Chief Scientist & Chair",
            affiliation: "Oxford Genomic Technologies",
            photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
            bio: "Leader in next-generation single-cell analysis and clinical genomics."
          },
          {
            name: "Dr. Marcus Vance",
            role: "Director of Research",
            affiliation: "Stanford Research Institute",
            photo: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&auto=format&fit=crop&q=80",
            bio: "Principal Investigator on ongoing NIH-funded translational programs."
          }
        ]
      };
    } else if (type === "pricing") {
      compData = {
        section_tag: "PASSES & TICKETS",
        section_title: "Registration Options",
        section_subtitle: "Choose the admission tier that best fits your attendance mode.",
        tiers: [
          {
            name: "Academic Pass",
            price: "$199",
            period: "/ delegate",
            featured: false,
            description: "Full access for faculty, students, and postdocs.",
            features: ["All Scientific Sessions", "Poster Hall Admission", "Digital Proceedings"],
            btn_label: "Select Academic",
            btn_url: "#contact"
          },
          {
            name: "Industry Full Pass",
            price: "$499",
            period: "/ delegate",
            featured: true,
            description: "Complete access for commercial, pharma, and biotech teams.",
            features: ["Full Priority Admission", "VIP Networking Lounge", "Access to Raw Datasets", "Gala Reception"],
            btn_label: "Select Industry VIP",
            btn_url: "#contact"
          }
        ]
      };
    } else if (type === "gallery") {
      compData = {
        section_tag: "CAMPUS & VENUE",
        section_title: "Symposium Venue & Posters",
        images: [
          { url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=900&auto=format&fit=crop&q=80", caption: "Grand Science Auditorium" },
          { url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=900&auto=format&fit=crop&q=80", caption: "Biochemical Lab Demo" }
        ]
      };
    } else if (type === "faq") {
      compData = {
        section_tag: "FAQ",
        section_title: "Frequently Asked Questions",
        faqs: [
          { q: "How can I submit an abstract?", a: "Abstract submissions open through the official portal until 60 days before the conference date." },
          { q: "Are CME / CPD credits provided?", a: "Yes, certified educational credits are awarded for all registered attendees upon session completion." }
        ]
      };
    } else if (type === "contact") {
      compData = {
        section_tag: "REGISTRATION",
        section_title: "Connect & Reserve Your Pass",
        section_subtitle: "Contact the symposium secretariat with any questions.",
        email: "symposium2026@conference.org",
        phone: "+1 (555) 329-8472",
        location: "BioTech Innovation Hub, Cambridge, MA",
        btn_text: "Submit Inquiry"
      };
    }

    const newComp = {
      id: newId,
      type: type,
      title: type.toUpperCase(),
      data: compData
    };

    currentSite.schema_json.push(newComp);
    renderCanvas();
    selectComponentForEditing(newId);
    showToast(`Added ${type} section`, "success");
  }

  // RENDER CANVAS WITH DYNAMIC HIGH-CONTRAST LIGHT & DARK MODES
  function renderCanvas() {
    if (!canvasSectionsList || !currentSite) return;
    if (studioQuickTarget && !currentSite.schema_json.includes(studioQuickTarget.comp)) closeStudioQuick();
    studioRecord();
    requestAnimationFrame(fitStudioCanvas);
    const comps = currentSite.schema_json || [];

    if (comps.length === 0) {
      canvasSectionsList.innerHTML = `
        <div style="text-align: center; padding: 5rem 1rem; color: #64748b;">
          <span style="font-size: 2.5rem; display:block; margin-bottom: 0.5rem;">🎨</span>
          <h3 style="color: #cbd5e1; margin-bottom: 0.5rem;">Canvas is Empty</h3>
          <p>Choose a section to start building your page.</p><button type="button" class="studio-add-open" onclick="openStudioLibrary()">+ Add your first section</button>
        </div>
      `;
      return;
    }

    const theme = currentSite.theme_config || {};
    const mode = theme.mode || "dark";
    const isLight = (mode === "light" || theme.bg_color === "#f8fafc" || theme.bg_color === "#ffffff" || theme.bg_color === "#f0fdf4");
    const primary = theme.primary_color || (isLight ? "#2563eb" : "#38bdf8");
    const bg = theme.bg_color || (isLight ? "#f8fafc" : "#0b0f19");

    canvasSectionsList.style.backgroundColor = bg;
    canvasSectionsList.style.fontFamily = theme.font_family || "Inter, sans-serif";
    canvasSectionsList.className = isLight ? "theme-light-canvas" : "theme-dark-canvas";

    canvasSectionsList.innerHTML = comps.map((comp) => {
      const isSelected = (comp.id === activeComponentId);
      return `
        <div class="studio-insert-line"><button type="button" onclick="openStudioLibrary('${comp.id}')" aria-label="Insert section before ${escapeHtml(comp.title || comp.type)}">+ Add section</button></div>
        <div class="canvas-section-wrapper ${comp.hidden ? 'studio-section-hidden' : ''} ${isSelected ? 'active-editing' : ''}" data-comp-id="${comp.id}" onclick="selectComponentForEditing('${comp.id}')">
          <!-- Floating Toolbar -->
          <div class="section-hover-bar" onclick="event.stopPropagation()">
            <button class="btn-sec-tool" draggable="true" data-drag-section="${comp.id}" title="Drag section">⠿</button>
            <button class="btn-sec-tool" onclick="duplicateStudioSection('${comp.id}')" title="Duplicate">Duplicate</button>
            <button class="btn-sec-tool" onclick="moveComponent('${comp.id}', -1)" title="Move Up">⬆</button>
            <button class="btn-sec-tool" onclick="moveComponent('${comp.id}', 1)" title="Move Down">⬇</button>
            <button class="btn-sec-tool" onclick="selectComponentForEditing('${comp.id}')" title="Configure">⚙ Settings</button>
            <label class="studio-section-color" title="Section background · text contrast adjusts automatically"><input type="color" value="${/^#[0-9a-f]{6}$/i.test(comp.studio_style?.background||'')?comp.studio_style.background:'#ffffff'}" onchange="updateStudioStyle('${comp.id}','background',this.value)">Background</label>
            <button class="btn-sec-tool tool-del" onclick="deleteComponent('${comp.id}')" title="Delete">🗑</button>
          </div>

          <!-- Section Render -->
          <div class="section-preview-render ${/^#[0-9a-f]{6}$/i.test(comp.studio_style?.background||'')?'studio-contrast-section':''}" style="pointer-events:none;${studioSectionStyle(comp)}">
            ${comp.hidden ? '<div class="studio-hidden-notice">Hidden section · Select Advanced to restore</div>' : renderComponentHTML(comp, primary)}
          </div>
        </div>
      `;
    }).join("") + '<div class="studio-insert-line last"><button type="button" onclick="openStudioLibrary()">+ Add section</button></div>';
    wireStudioInlineEditing();
  }

  // RENDER INDIVIDUAL COMPONENT WITH PROPER CONTRAST & VECTOR ICONS
  function renderComponentHTML(comp, primary) {
    const d = comp.data || {};
    const t = comp.type;
    if(t==='image') return d.image_url ? `<figure style="margin:0;padding:24px"><img src="${escapeHtml(d.image_url)}" alt="${escapeHtml(d.caption||'')}" style="display:block;width:100%;height:auto;border-radius:12px"><figcaption>${escapeHtml(d.caption||'')}</figcaption></figure>` : `<div class="studio-image-placeholder"><button type="button" onclick="event.stopPropagation();chooseStudioImage('${comp.id}')">+ Upload an image</button><p>PNG, JPG, WebP or GIF · automatically optimized</p></div>`;
    if (['about','stats','agenda','sponsors','testimonials','announcement'].includes(t)) {
      const theme = sectionStudioTheme(comp);
      const light = theme.mode === 'light';
      const design = ['grid','list','spotlight'].includes(d.design) ? d.design : 'grid';
      const safeImage = value => /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp|gif);base64,)/.test(value || '') ? value : '';
      return `<section class="studio-content-section design-${design}" style="--section-ink:${light ? '#18233b' : '#f8fafc'};--section-muted:${light ? '#64748b' : '#a5b4cc'};--section-card:${light ? '#f4f6fb' : '#172033'}"><h2>${escapeHtml(d.section_title || '')}</h2><p>${escapeHtml(d.section_subtitle || '')}</p><div class="studio-content-items">${(d.items || []).map(item => `<article>${safeImage(item.image) ? `<img src="${escapeHtml(safeImage(item.image))}" alt="${escapeHtml(item.title || '')}" loading="lazy">` : ''}<h3>${escapeHtml(item.title || '')}</h3><p>${escapeHtml(item.description || '')}</p></article>`).join('')}</div></section>`;
    }
    if (t === 'custom') return `<iframe title="Custom section preview" sandbox="" srcdoc="${escapeHtml(d.html || '')}" style="display:block;width:100%;height:${Math.min(2000, Math.max(100, Number(d.height) || 300))}px;border:0"></iframe>`;
    const theme = sectionStudioTheme(comp);
    const mode = theme.mode || "dark";
    const isLight = (mode === "light" || theme.bg_color === "#f8fafc" || theme.bg_color === "#ffffff" || theme.bg_color === "#f0fdf4");
    const accent = theme.accent_color || (isLight ? "#0284c7" : "#6366f1");

    // Dynamic contrast colors
    const textTitle = isLight ? "#0f172a" : "#ffffff";
    const textMuted = isLight ? "#475569" : "#94a3b8";
    const cardBg = isLight ? "#ffffff" : "rgba(255, 255, 255, 0.04)";
    const cardBorder = isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.08)";
    const cardShadow = isLight ? "0 4px 16px rgba(0, 0, 0, 0.06)" : "none";
    const navBorder = isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.08)";
    const navBg = isLight ? "rgba(255, 255, 255, 0.95)" : "rgba(11, 15, 25, 0.9)";

    if (t === "navbar") {
      const links = (d.links || []).map(l => `<a href="#" style="color:${isLight ? '#334155' : '#cbd5e1'};font-size:0.88rem;margin-right:1.25rem;font-weight:500;">${escapeHtml(l.label)}</a>`).join("");
      return `
        <div style="padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${navBorder};background:${navBg};">
          <div style="font-weight:800;color:${textTitle};font-size:1.2rem;display:flex;align-items:center;gap:0.5rem;">
            <i class="fa-solid fa-atom" style="color:${primary};font-size:1.15rem;"></i>
            <span>${escapeHtml(d.brand_name || 'Brand')}</span>
          </div>
          <div>${links} <span style="background:${primary};color:#fff;padding:0.45rem 1rem;border-radius:6px;font-size:0.85rem;font-weight:700;">${escapeHtml(d.cta_label || 'Register')}</span></div>
        </div>
      `;
    } else if (t === "hero") {
      // Headline Gradient logic
      let headlineStyle = `font-size:${d.font_size || '2.4rem'};font-weight:800;line-height:1.2;margin:0.6rem 0;`;
      if (d.headline_gradient !== false) {
        let gradStr = "";
        const preset = d.gradient_preset || (isLight ? "navy_blue" : "cyan_blue");
        if (preset === "cyan_blue") gradStr = "linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)";
        else if (preset === "emerald_teal") gradStr = "linear-gradient(135deg, #34d399 0%, #06b6d4 100%)";
        else if (preset === "purple_violet") gradStr = "linear-gradient(135deg, #c084fc 0%, #ec4899 100%)";
        else if (preset === "sunset_amber") gradStr = "linear-gradient(135deg, #fbbf24 0%, #f43f5e 100%)";
        else if (preset === "navy_blue") gradStr = "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)";
        else if (preset === "custom" && d.custom_grad_color1 && d.custom_grad_color2) {
          gradStr = `linear-gradient(135deg, ${d.custom_grad_color1} 0%, ${d.custom_grad_color2} 100%)`;
        } else {
          gradStr = isLight ? "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)" : `linear-gradient(135deg, ${primary} 0%, #818cf8 100%)`;
        }
        headlineStyle += `background:${gradStr};-webkit-background-clip:text;-webkit-text-fill-color:transparent;`;
      } else {
        headlineStyle += `color:${textTitle};`;
      }

      // Button styling
      const btnRadius = d.primary_btn_radius === "pill" ? "9999px" : (d.primary_btn_radius === "sharp" ? "2px" : "8px");
      let btnBg = primary;
      if (d.primary_btn_style === "gradient") {
        btnBg = `linear-gradient(135deg, ${d.primary_btn_bg || primary}, ${accent})`;
      } else if (d.primary_btn_bg) {
        btnBg = d.primary_btn_bg;
      }
      const btnGlow = d.primary_btn_glow ? `box-shadow: 0 0 20px rgba(56, 189, 248, 0.45);` : (isLight ? `box-shadow: 0 4px 14px rgba(37,99,235,0.22);` : "");

      // Check Layout Variant: Conference Program vs Standard Split
      if (d.layout_variant === "conference_program") {
        const eventDate = escapeHtml(d.event_date || "October 14–18, 2026");
        const eventLoc = escapeHtml(d.event_location || "Boston Convention Center, MA");
        const eventFmt = escapeHtml(d.event_format || "Hybrid (In-Person & Live Stream)");
        const cardBorderColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)";
        const metaIconBg = isLight ? "rgba(37,99,235,0.08)" : "rgba(56,189,248,0.12)";
        const metaIconBorder = isLight ? "rgba(37,99,235,0.18)" : "rgba(56,189,248,0.25)";
        const badgeBg = isLight ? "rgba(37,99,235,0.1)" : "rgba(56,189,248,0.15)";
        const badgeColor = isLight ? primary : "#38bdf8";

        return `
          <div class="canvas-hero-program-wrap" style="padding:3.5rem 1.5rem;display:grid;grid-template-columns:1.2fr 0.8fr;gap:2.5rem;align-items:center;">
            <div>
              <span style="font-size:0.75rem;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(d.eyebrow || '')}</span>
              <h1 style="${headlineStyle}">${escapeHtml(d.headline || 'Headline')}</h1>
              <p style="color:${textMuted};font-size:1rem;line-height:1.6;margin-bottom:1.75rem;">${escapeHtml(d.subheadline || '')}</p>
              ${d.secondary_btn_text ? `
                <div style="display:flex;gap:0.75rem;align-items:center;">
                  <span style="border:1px solid ${isLight ? '#cbd5e1' : 'rgba(255,255,255,0.2)'};color:${isLight ? '#0f172a' : '#fff'};background:${isLight ? '#fff' : 'transparent'};padding:0.6rem 1.4rem;border-radius:${btnRadius};font-size:0.9rem;font-weight:600;">${escapeHtml(d.secondary_btn_text)}</span>
                </div>
              ` : ''}
            </div>
            <div>
              <div class="canvas-hero-program-card" style="background:${cardBg};border:1px solid ${cardBorderColor};border-radius:18px;padding:2rem;box-shadow:${cardShadow};position:relative;overflow:hidden;">
                <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg, ${primary}, ${accent});"></div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                  <div style="font-weight:800;font-size:1.05rem;color:${textTitle};display:flex;align-items:center;gap:0.5rem;">
                    <i class="fa-solid fa-calendar-check" style="color:${primary};"></i>
                    <span>Conference Program</span>
                  </div>
                  <span style="background:${badgeBg};color:${badgeColor};font-size:0.72rem;font-weight:700;text-transform:uppercase;padding:0.25rem 0.65rem;border-radius:9999px;border:1px solid ${metaIconBorder};">Official Event</span>
                </div>

                <div style="display:flex;flex-direction:column;gap:1.25rem;margin-bottom:1.75rem;">
                  <!-- Date -->
                  <div style="display:flex;align-items:flex-start;gap:0.9rem;">
                    <div style="width:40px;height:40px;border-radius:10px;background:${metaIconBg};border:1px solid ${metaIconBorder};display:flex;align-items:center;justify-content:center;color:${primary};font-size:1rem;flex-shrink:0;">
                      <i class="fa-regular fa-calendar-days"></i>
                    </div>
                    <div>
                      <div style="font-size:0.72rem;color:${textMuted};text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">Dates & Schedule</div>
                      <div style="font-size:0.96rem;font-weight:700;color:${textTitle};margin-top:0.15rem;">${eventDate}</div>
                    </div>
                  </div>

                  <!-- Location -->
                  <div style="display:flex;align-items:flex-start;gap:0.9rem;">
                    <div style="width:40px;height:40px;border-radius:10px;background:${metaIconBg};border:1px solid ${metaIconBorder};display:flex;align-items:center;justify-content:center;color:${primary};font-size:1rem;flex-shrink:0;">
                      <i class="fa-solid fa-location-dot"></i>
                    </div>
                    <div>
                      <div style="font-size:0.72rem;color:${textMuted};text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">Location & Venue</div>
                      <div style="font-size:0.96rem;font-weight:700;color:${textTitle};margin-top:0.15rem;">${eventLoc}</div>
                    </div>
                  </div>

                  <!-- Format -->
                  <div style="display:flex;align-items:flex-start;gap:0.9rem;">
                    <div style="width:40px;height:40px;border-radius:10px;background:${metaIconBg};border:1px solid ${metaIconBorder};display:flex;align-items:center;justify-content:center;color:${primary};font-size:1rem;flex-shrink:0;">
                      <i class="fa-solid fa-video"></i>
                    </div>
                    <div>
                      <div style="font-size:0.72rem;color:${textMuted};text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">Event Format</div>
                      <div style="font-size:0.96rem;font-weight:700;color:${textTitle};margin-top:0.15rem;">${eventFmt}</div>
                    </div>
                  </div>
                </div>

                <!-- Registration Button -->
                <div style="display:block;text-align:center;">
                  <span style="display:block;background:${btnBg};color:${d.primary_btn_text_color || '#fff'};padding:0.85rem 1.5rem;border-radius:${btnRadius};font-weight:700;font-size:0.95rem;${btnGlow};text-align:center;">${escapeHtml(d.primary_btn_text || 'Register for Conference')}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      // Image styling
      const imgRadius = d.hero_image_radius || "14px";
      const imgShadow = (d.hero_image_shadow === "none") ? "none" : (d.hero_image_shadow === "deep" ? "0 20px 45px rgba(0,0,0,0.5)" : "0 10px 25px rgba(0,0,0,0.35)");
      const imgAspect = (d.hero_image_aspect && d.hero_image_aspect !== "auto") ? `aspect-ratio:${d.hero_image_aspect};object-fit:cover;` : "object-fit:cover;";

      const isCentered = (d.text_align === "center" || ["centered", "image_top", "text_only"].includes(d.layout_variant));

      return `
        <div class="studio-hero-layout hero-design-${["centered","image_left","image_top","text_only"].includes(d.layout_variant) ? d.layout_variant : "split"}" style="padding:3.5rem 1.5rem;${isCentered ? 'text-align:center;' : 'display:grid;grid-template-columns:1.2fr 0.8fr;gap:2.5rem;align-items:center;'}">
          <div style="${isCentered ? 'max-width:800px;margin:0 auto 2rem auto;' : ''}">
            <span style="font-size:0.75rem;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(d.eyebrow || '')}</span>
            <h1 style="${headlineStyle}">${escapeHtml(d.headline || 'Headline')}</h1>
            <p style="color:${textMuted};font-size:1rem;line-height:1.6;margin-bottom:1.75rem;">${escapeHtml(d.subheadline || '')}</p>
            <div style="display:flex;gap:0.75rem;${isCentered ? 'justify-content:center;' : ''}align-items:center;flex-wrap:wrap;">
              <span style="background:${btnBg};color:${d.primary_btn_text_color || '#fff'};padding:0.75rem 1.6rem;border-radius:${btnRadius};font-weight:700;font-size:0.92rem;${btnGlow}">${escapeHtml(d.primary_btn_text || 'Action')}</span>
              <span style="border:1px solid ${isLight ? '#cbd5e1' : 'rgba(255,255,255,0.2)'};color:${isLight ? '#0f172a' : '#fff'};background:${isLight ? '#fff' : 'transparent'};padding:0.75rem 1.6rem;border-radius:${btnRadius};font-size:0.92rem;font-weight:600;">${escapeHtml(d.secondary_btn_text || 'Learn More')}</span>
            </div>
          </div>
          <div style="${isCentered ? 'max-width:750px;margin:0 auto;' : ''}">
            <img src="${escapeHtml(d.hero_image || '')}" style="width:100%;border-radius:${imgRadius};box-shadow:${imgShadow};${imgAspect}" onerror="this.style.display='none'">
          </div>
        </div>
      `;
    } else if (t === "features") {
      const items = (d.items || []).map(i => {
        const iconClass = i.icon || "fa-solid fa-microscope";
        const iconColor = i.icon_color || primary;
        return `
          <div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:14px;padding:1.6rem;box-shadow:${cardShadow};">
            <div style="width:50px;height:50px;border-radius:12px;background:${isLight ? 'rgba(37,99,235,0.08)' : 'rgba(56,189,248,0.12)'};border:1px solid ${isLight ? 'rgba(37,99,235,0.18)' : 'rgba(56,189,248,0.25)'};display:flex;align-items:center;justify-content:center;margin-bottom:1.15rem;">
              ${renderVectorIcon(iconClass, iconColor)}
            </div>
            <h4 style="color:${textTitle};font-size:1.05rem;font-weight:700;margin-bottom:0.45rem;">${escapeHtml(i.title || '')}</h4>
            <p style="color:${textMuted};font-size:0.88rem;line-height:1.55;">${escapeHtml(i.description || '')}</p>
          </div>
        `;
      }).join("");
      return `
        <div style="padding:3.5rem 1.5rem;text-align:center;">
          <span style="font-size:0.75rem;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(d.section_tag || '')}</span>
          <h2 style="color:${textTitle};font-size:2rem;font-weight:800;margin:0.4rem 0 0.6rem 0;">${escapeHtml(d.section_title || '')}</h2>
          <p style="color:${textMuted};font-size:0.95rem;max-width:600px;margin:0 auto 2.5rem auto;line-height:1.6;">${escapeHtml(d.section_subtitle || '')}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.5rem;text-align:left;">
            ${items}
          </div>
        </div>
      `;
    } else if (t === "speakers") {
      const spk = (d.speakers || []).map(s => `
        <div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:14px;overflow:hidden;box-shadow:${cardShadow};">
          <img src="${escapeHtml(s.photo || '')}" style="width:100%;height:180px;object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80'">
          <div style="padding:1.15rem;">
            <h4 style="color:${textTitle};font-size:1.05rem;font-weight:700;">${escapeHtml(s.name || '')}</h4>
            <div style="color:${primary};font-size:0.82rem;font-weight:600;margin-top:2px;">${escapeHtml(s.role || '')}</div>
            <div style="color:${textMuted};font-size:0.78rem;margin-bottom:0.6rem;">${escapeHtml(s.affiliation || '')}</div>
            <p style="color:${textMuted};font-size:0.8rem;line-height:1.5;">${escapeHtml(s.bio || '')}</p>
          </div>
        </div>
      `).join("");
      return `
        <div style="padding:3.5rem 1.5rem;text-align:center;">
          <span style="font-size:0.75rem;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(d.section_tag || '')}</span>
          <h2 style="color:${textTitle};font-size:2rem;font-weight:800;margin:0.4rem 0 0.6rem 0;">${escapeHtml(d.section_title || '')}</h2>
          <p style="color:${textMuted};font-size:0.95rem;max-width:600px;margin:0 auto 2.5rem auto;line-height:1.6;">${escapeHtml(d.section_subtitle || '')}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1.5rem;text-align:left;">
            ${spk}
          </div>
        </div>
      `;
    } else if (t === "pricing") {
      const tiers = (d.tiers || []).map(ti => `
        <div style="background:${cardBg};border:1.5px solid ${ti.featured ? primary : cardBorder};border-radius:14px;padding:1.75rem;text-align:center;box-shadow:${ti.featured ? (isLight ? '0 10px 25px rgba(37,99,235,0.15)' : '0 0 25px rgba(56,189,248,0.25)') : cardShadow};position:relative;">
          ${ti.featured ? `<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:${primary};color:#fff;font-size:0.7rem;font-weight:800;padding:2px 10px;border-radius:9999px;letter-spacing:1px;">RECOMMENDED</div>` : ''}
          <h4 style="color:${textTitle};font-size:1.15rem;font-weight:700;">${escapeHtml(ti.name || '')}</h4>
          <div style="font-size:2.2rem;font-weight:800;color:${textTitle};margin:0.5rem 0;">${escapeHtml(ti.price || '')} <small style="font-size:0.8rem;color:${textMuted};font-weight:500;">${escapeHtml(ti.period || '')}</small></div>
          <p style="color:${textMuted};font-size:0.82rem;margin-bottom:1.25rem;line-height:1.5;">${escapeHtml(ti.description || '')}</p>
          <ul style="list-style:none;text-align:left;color:${isLight ? '#334155' : '#cbd5e1'};font-size:0.85rem;margin-bottom:1.75rem;">
            ${(ti.features || []).map(f => `<li style="margin-bottom:0.45rem;display:flex;align-items:center;gap:0.45rem;"><i class="fa-solid fa-check" style="color:${primary};font-size:0.75rem;"></i><span>${escapeHtml(f)}</span></li>`).join('')}
          </ul>
          <span style="background:${ti.featured ? `linear-gradient(135deg, ${accent}, ${primary})` : (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)')};color:${ti.featured ? '#fff' : textTitle};border:1px solid ${cardBorder};padding:0.65rem 1rem;border-radius:8px;display:block;font-weight:700;font-size:0.88rem;">${escapeHtml(ti.btn_label || 'Select Pass')}</span>
        </div>
      `).join("");
      return `
        <div style="padding:3.5rem 1.5rem;text-align:center;">
          <span style="font-size:0.75rem;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(d.section_tag || '')}</span>
          <h2 style="color:${textTitle};font-size:2rem;font-weight:800;margin:0.4rem 0 0.6rem 0;">${escapeHtml(d.section_title || '')}</h2>
          <p style="color:${textMuted};font-size:0.95rem;max-width:600px;margin:0 auto 2.5rem auto;line-height:1.6;">${escapeHtml(d.section_subtitle || '')}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.5rem;">
            ${tiers}
          </div>
        </div>
      `;
    } else if (t === "gallery") {
      const imgs = (d.images || []).map(img => `
        <div style="border-radius:12px;overflow:hidden;height:160px;position:relative;box-shadow:${cardShadow};">
          <img src="${escapeHtml(img.url || '')}" style="width:100%;height:100%;object-fit:cover;">
          <div style="position:absolute;bottom:0;left:0;right:0;padding:0.5rem;background:rgba(0,0,0,0.7);font-size:0.75rem;color:#fff;backdrop-filter:blur(4px);">${escapeHtml(img.caption || '')}</div>
        </div>
      `).join("");
      return `
        <div style="padding:3.5rem 1.5rem;text-align:center;">
          <span style="font-size:0.75rem;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(d.section_tag || '')}</span>
          <h2 style="color:${textTitle};font-size:2rem;font-weight:800;margin:0.4rem 0 0.6rem 0;">${escapeHtml(d.section_title || '')}</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.25rem;margin-top:2rem;">
            ${imgs}
          </div>
        </div>
      `;
    } else if (t === "faq") {
      const faqs = (d.faqs || []).map(f => `
        <div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;padding:1.15rem 1.35rem;margin-bottom:0.75rem;text-align:left;box-shadow:${cardShadow};">
          <div style="font-weight:700;color:${textTitle};font-size:0.95rem;display:flex;justify-content:space-between;align-items:center;">
            <span>${escapeHtml(f.q)}</span>
            <i class="fa-solid fa-chevron-down" style="color:${primary};font-size:0.75rem;"></i>
          </div>
          <div style="color:${textMuted};font-size:0.85rem;margin-top:0.45rem;line-height:1.6;">${escapeHtml(f.a)}</div>
        </div>
      `).join("");
      return `
        <div style="padding:3.5rem 1.5rem;text-align:center;">
          <span style="font-size:0.75rem;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(d.section_tag || '')}</span>
          <h2 style="color:${textTitle};font-size:2rem;font-weight:800;margin:0.4rem 0 0.6rem 0;">${escapeHtml(d.section_title || '')}</h2>
          <div style="max-width:650px;margin:2rem auto 0 auto;">
            ${faqs}
          </div>
        </div>
      `;
    } else if (t === "contact") {
      return `
        <div style="padding:3rem 1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem;background:${cardBg};border:1px solid ${cardBorder};border-radius:16px;margin:2rem 1.5rem;box-shadow:${cardShadow};">
          <div>
            <span style="font-size:0.75rem;font-weight:700;color:${primary};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(d.section_tag || 'CONTACT')}</span>
            <h3 style="color:${textTitle};font-size:1.6rem;font-weight:800;margin:0.4rem 0 0.75rem 0;">${escapeHtml(d.section_title || 'Get in Touch')}</h3>
            <p style="color:${textMuted};font-size:0.88rem;margin-bottom:1.5rem;line-height:1.6;">${escapeHtml(d.section_subtitle || '')}</p>
            <div style="font-size:0.85rem;line-height:2;">
              <div style="display:flex;align-items:center;gap:0.75rem;"><i class="fa-solid fa-envelope" style="color:${primary};width:16px;"></i> <span style="color:${textTitle};">${escapeHtml(d.email || '')}</span></div>
              <div style="display:flex;align-items:center;gap:0.75rem;"><i class="fa-solid fa-phone" style="color:${primary};width:16px;"></i> <span style="color:${textTitle};">${escapeHtml(d.phone || '')}</span></div>
              <div style="display:flex;align-items:center;gap:0.75rem;"><i class="fa-solid fa-location-dot" style="color:${primary};width:16px;"></i> <span style="color:${textTitle};">${escapeHtml(d.location || '')}</span></div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.75rem;justify-content:center;">
            <input type="text" placeholder="Your Full Name" style="background:${isLight ? '#f8fafc' : '#0f172a'};border:1px solid ${cardBorder};padding:0.65rem 0.85rem;border-radius:8px;color:${textTitle};font-size:0.85rem;" disabled>
            <input type="email" placeholder="Academic / Institutional Email" style="background:${isLight ? '#f8fafc' : '#0f172a'};border:1px solid ${cardBorder};padding:0.65rem 0.85rem;border-radius:8px;color:${textTitle};font-size:0.85rem;" disabled>
            <textarea placeholder="Message / Abstract Inquiry" style="background:${isLight ? '#f8fafc' : '#0f172a'};border:1px solid ${cardBorder};padding:0.65rem 0.85rem;border-radius:8px;color:${textTitle};font-size:0.85rem;min-height:70px;" disabled></textarea>
            <button style="background:${primary};color:#fff;border:none;padding:0.75rem;border-radius:8px;font-weight:700;font-size:0.88rem;cursor:default;">${escapeHtml(d.btn_text || 'Submit Inquiry')}</button>
          </div>
        </div>
      `;
    } else if (t === "footer") {
      return `
        <div style="padding:2.5rem 1.5rem;text-align:center;border-top:1px solid ${cardBorder};background:${isLight ? '#ffffff' : 'rgba(0,0,0,0.3)'};">
          <div style="font-weight:800;color:${textTitle};font-size:1.15rem;margin-bottom:0.5rem;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
            <i class="fa-solid fa-atom" style="color:${primary};"></i>
            <span>${escapeHtml(d.brand_name || 'Conference 2026')}</span>
          </div>
          <p style="color:${textMuted};font-size:0.82rem;">${escapeHtml(d.copyright || '© 2026 All Rights Reserved.')}</p>
        </div>
      `;
    }
    return `<div style="padding:1.5rem;color:${textMuted};">${escapeHtml(comp.title)}</div>`;
  }

  // Component Reordering & Deletion
  window.moveComponent = function(compId, dir) {
    if (!currentSite || !currentSite.schema_json) return;
    const comps = currentSite.schema_json;
    const idx = comps.findIndex(c => c.id === compId);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= comps.length) return;

    const temp = comps[idx];
    comps[idx] = comps[targetIdx];
    comps[targetIdx] = temp;

    renderCanvas();
    showToast("Section reordered", "info");
  };

  window.deleteComponent = function(compId) {
    if (!currentSite || !currentSite.schema_json) return;
    if (!confirm("Remove this section from the page?")) return;
    currentSite.schema_json = currentSite.schema_json.filter(c => c.id !== compId);
    if (activeComponentId === compId) {
      activeComponentId = null;
      if (inspectorContent) {
        inspectorContent.innerHTML = `
          <div class="empty-inspector-notice">
            <span style="font-size: 2.2rem; display:block; margin-bottom: 0.5rem;">👈</span>
            <p>Click any block on the canvas to configure its typography, text gradient, buttons, images, and FontAwesome icons.</p>
          </div>
        `;
      }
    }
    renderCanvas();
    showToast("Section removed", "info");
  };

  // Select Component for Property Inspector
  window.selectComponentForEditing = function(compId) {
    activeComponentId = compId;
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !inspectorContent) return;

    // Highlight on canvas
    document.querySelectorAll(".canvas-section-wrapper").forEach(el => {
      el.classList.toggle("active-editing", el.getAttribute("data-comp-id") === compId);
    });

    renderInspector(comp);
    renderStudioLayers();
  };

  // COMPREHENSIVE BLOCK INSPECTOR CONTROLS
  function renderInspector(comp) {
    if (!inspectorContent) return;
    const d = comp.data || {};
    const t = comp.type;

    let html = `
      <div style="margin-bottom: 1.15rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-size: 0.72rem; font-weight: 800; color: #38bdf8; text-transform: uppercase;">${t.toUpperCase()} BLOCK</span>
          <h3 style="font-size: 1.1rem; color: #283752; margin: 0.15rem 0 0 0;">${escapeHtml(comp.title)}</h3>
        </div>
        <div style="display:flex; gap:0.35rem;">
          <button class="btn-sec-tool" onclick="moveComponent('${comp.id}', -1)" title="Move Up">⬆</button>
          <button class="btn-sec-tool" onclick="moveComponent('${comp.id}', 1)" title="Move Down">⬇</button>
          <button class="btn-sec-tool tool-del" onclick="deleteComponent('${comp.id}')" title="Delete">🗑</button>
        </div>
      </div>
    `;

    if (t === "hero") {
      html += `


        <!-- Section 1: Typography & Headline -->
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-heading"></i>
            <span>Typography & Headline</span>
          </div>

          <div class="inspector-field">
            <label>Eyebrow Badge</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.eyebrow || '')}" oninput="updateField('${comp.id}', 'eyebrow', this.value)">
          </div>

          <div class="inspector-field">
            <label>Main Headline</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.headline || '')}" oninput="updateField('${comp.id}', 'headline', this.value)">
          </div>

          <!-- Headline Gradient Toggle -->
          <label class="inspector-toggle-label">
            <input type="checkbox" ${d.headline_gradient !== false ? 'checked' : ''} onchange="updateField('${comp.id}', 'headline_gradient', this.checked)">
            <span>✨ Apply Vibrant Text Gradient</span>
          </label>

          <div class="inspector-field" style="margin-top:0.5rem;">
            <label>Gradient Theme Preset</label>
            <select class="inspector-select" onchange="updateField('${comp.id}', 'gradient_preset', this.value)">
              <option value="cyan_blue" ${(d.gradient_preset === 'cyan_blue' || !d.gradient_preset) ? 'selected' : ''}>Cyan & Royal Blue (Tech / Bio)</option>
              <option value="emerald_teal" ${d.gradient_preset === 'emerald_teal' ? 'selected' : ''}>Emerald & Teal (Biotech / Green)</option>
              <option value="purple_violet" ${d.gradient_preset === 'purple_violet' ? 'selected' : ''}>Violet & Pink (Neuro / Genomics)</option>
              <option value="sunset_amber" ${d.gradient_preset === 'sunset_amber' ? 'selected' : ''}>Sunset & Amber (Energy / High-Tech)</option>
              <option value="navy_blue" ${d.gradient_preset === 'navy_blue' ? 'selected' : ''}>Deep Navy & Blue (Clean Light Mode)</option>
              <option value="custom" ${d.gradient_preset === 'custom' ? 'selected' : ''}>🎨 Custom Two-Color Gradient</option>
            </select>
          </div>

          ${d.gradient_preset === 'custom' ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:0.4rem;">
              <div>
                <label style="font-size:0.72rem; color:#94a3b8;">Start Color</label>
                <input type="color" class="inspector-input" style="padding:2px; height:36px;" value="${d.custom_grad_color1 || '#38bdf8'}" onchange="updateField('${comp.id}', 'custom_grad_color1', this.value)">
              </div>
              <div>
                <label style="font-size:0.72rem; color:#94a3b8;">End Color</label>
                <input type="color" class="inspector-input" style="padding:2px; height:36px;" value="${d.custom_grad_color2 || '#818cf8'}" onchange="updateField('${comp.id}', 'custom_grad_color2', this.value)">
              </div>
            </div>
          ` : ''}

          ${d.layout_variant !== 'conference_program' ? `
          <div class="inspector-field" style="margin-top:0.75rem;">
            <label>Layout Alignment</label>
            <div class="segmented-control">
              <button class="segmented-btn ${(d.text_align !== 'center') ? 'active' : ''}" onclick="setHeroTextAlign('${comp.id}', 'left')">Left Align (Split Grid)</button>
              <button class="segmented-btn ${(d.text_align === 'center') ? 'active' : ''}" onclick="setHeroTextAlign('${comp.id}', 'center')">Center Align</button>
            </div>
          </div>
          ` : ''}

          <div class="inspector-field">
            <label>Subheadline</label>
            <textarea class="inspector-input" oninput="updateField('${comp.id}', 'subheadline', this.value)">${escapeHtml(d.subheadline || '')}</textarea>
          </div>
        </div>

        ${d.layout_variant === 'conference_program' ? `
        <!-- Section: Conference Program Details -->
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-calendar-check"></i>
            <span>Conference Program Details</span>
          </div>

          <div class="inspector-field">
            <label>Dates & Schedule</label>
            <input type="text" class="inspector-input" placeholder="e.g. October 14–18, 2026" value="${escapeHtml(d.event_date || 'October 14–18, 2026')}" oninput="updateField('${comp.id}', 'event_date', this.value)">
          </div>

          <div class="inspector-field">
            <label>Location & Venue</label>
            <input type="text" class="inspector-input" placeholder="e.g. Boston Convention Center, MA" value="${escapeHtml(d.event_location || 'Boston Convention Center, MA')}" oninput="updateField('${comp.id}', 'event_location', this.value)">
          </div>

          <div class="inspector-field">
            <label>Event Format</label>
            <input type="text" class="inspector-input" placeholder="e.g. Hybrid (In-Person & Live Stream)" value="${escapeHtml(d.event_format || 'Hybrid (In-Person & Live Stream)')}" oninput="updateField('${comp.id}', 'event_format', this.value)">
          </div>
        </div>
        ` : ''}

        <!-- Section 2: Call-to-Action Buttons -->
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-square-check"></i>
            <span>Primary & Secondary Buttons</span>
          </div>

          <div class="inspector-field">
            <label>Primary Button Label</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.primary_btn_text || 'Register Today')}" oninput="updateField('${comp.id}', 'primary_btn_text', this.value)">
          </div>

          <div class="inspector-field">
            <label>Primary Button Destination (URL / Anchor)</label>
            <input type="text" class="inspector-input" placeholder="#pricing or https://..." value="${escapeHtml(d.primary_btn_url || '#pricing')}" oninput="updateField('${comp.id}', 'primary_btn_url', this.value)">
          </div>

          <div class="inspector-field">
            <label>Primary Button Style</label>
            <select class="inspector-select" onchange="updateField('${comp.id}', 'primary_btn_style', this.value)">
              <option value="gradient" ${(d.primary_btn_style === 'gradient' || !d.primary_btn_style) ? 'selected' : ''}>Vibrant Gradient</option>
              <option value="solid" ${d.primary_btn_style === 'solid' ? 'selected' : ''}>Solid Custom Color</option>
            </select>
          </div>

          ${d.primary_btn_style === 'solid' ? `
            <div class="inspector-field">
              <label>Button Background Color</label>
              <input type="color" class="inspector-input" style="padding:2px; height:36px;" value="${d.primary_btn_bg || '#0284c7'}" onchange="updateField('${comp.id}', 'primary_btn_bg', this.value)">
            </div>
          ` : `
            <div class="inspector-field">
              <label>Button Gradient Scheme</label>
              <select class="inspector-select" onchange="updateField('${comp.id}', 'primary_btn_grad', this.value)">
                <option value="cyan_indigo" ${(d.primary_btn_grad === 'cyan_indigo' || !d.primary_btn_grad) ? 'selected' : ''}>Cyan & Indigo</option>
                <option value="emerald_teal" ${d.primary_btn_grad === 'emerald_teal' ? 'selected' : ''}>Emerald & Teal</option>
                <option value="violet_pink" ${d.primary_btn_grad === 'violet_pink' ? 'selected' : ''}>Violet & Pink</option>
                <option value="sunset" ${d.primary_btn_grad === 'sunset' ? 'selected' : ''}>Sunset Flame</option>
              </select>
            </div>
          `}

          <div class="inspector-field">
            <label>Button Shape</label>
            <div class="segmented-control">
              <button class="segmented-btn ${(d.primary_btn_radius === 'pill' || !d.primary_btn_radius) ? 'active' : ''}" onclick="setPrimaryBtnRadius('${comp.id}', 'pill')">Pill</button>
              <button class="segmented-btn ${d.primary_btn_radius === 'rounded' ? 'active' : ''}" onclick="setPrimaryBtnRadius('${comp.id}', 'rounded')">Rounded</button>
              <button class="segmented-btn ${d.primary_btn_radius === 'sharp' ? 'active' : ''}" onclick="setPrimaryBtnRadius('${comp.id}', 'sharp')">Sharp</button>
            </div>
          </div>

          <label class="inspector-toggle-label" style="margin-top:0.6rem;">
            <input type="checkbox" ${d.primary_btn_glow ? 'checked' : ''} onchange="updateField('${comp.id}', 'primary_btn_glow', this.checked)">
            <span>Add High-Glow Shadow Effect</span>
          </label>

          <div class="inspector-field" style="margin-top:0.75rem;">
            <label>Secondary Button Label</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.secondary_btn_text || 'Explore Faculty')}" oninput="updateField('${comp.id}', 'secondary_btn_text', this.value)">
          </div>

          <div class="inspector-field">
            <label>Secondary Button Link</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.secondary_btn_url || '#features')}" oninput="updateField('${comp.id}', 'secondary_btn_url', this.value)">
          </div>
        </div>

        <!-- Section 3: Hero Image & Media -->
        ${d.layout_variant !== 'conference_program' ? `
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-image"></i>
            <span>Hero Image & Media</span>
          </div>

          <div class="inspector-field">
            <label>Image URL</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.hero_image || '')}" oninput="updateField('${comp.id}', 'hero_image', this.value)">
          </div>

          <div class="inspector-field">
            <label>Quick Scientific Stock Presets</label>
            <div class="stock-preset-pills">
              ${SCIENTIFIC_STOCK_IMAGES.map(img => `
                <button type="button" class="btn-stock-pill" onclick="setHeroStockImage('${comp.id}', '${img.url}')">${img.label}</button>
              `).join('')}
            </div>
          </div>

          <div class="inspector-field" style="margin-top:0.75rem;">
            <label>Image Border Radius</label>
            <select class="inspector-select" onchange="updateField('${comp.id}', 'hero_image_radius', this.value)">
              <option value="14px" ${(d.hero_image_radius === '14px' || !d.hero_image_radius) ? 'selected' : ''}>Modern Rounded (14px)</option>
              <option value="24px" ${d.hero_image_radius === '24px' ? 'selected' : ''}>Soft Pill (24px)</option>
              <option value="0px" ${d.hero_image_radius === '0px' ? 'selected' : ''}>Sharp Edges (0px)</option>
            </select>
          </div>

          <div class="inspector-field">
            <label>Shadow Effect</label>
            <select class="inspector-select" onchange="updateField('${comp.id}', 'hero_image_shadow', this.value)">
              <option value="deep" ${(d.hero_image_shadow === 'deep' || !d.hero_image_shadow) ? 'selected' : ''}>Deep 3D Shadow</option>
              <option value="ambient" ${d.hero_image_shadow === 'ambient' ? 'selected' : ''}>Ambient Glow</option>
              <option value="none" ${d.hero_image_shadow === 'none' ? 'selected' : ''}>Flat (No Shadow)</option>
            </select>
          </div>

          <div class="inspector-field">
            <label>Aspect Ratio</label>
            <select class="inspector-select" onchange="updateField('${comp.id}', 'hero_image_aspect', this.value)">
              <option value="16/9" ${(d.hero_image_aspect === '16/9' || !d.hero_image_aspect) ? 'selected' : ''}>16:9 Widescreen</option>
              <option value="4/3" ${d.hero_image_aspect === '4/3' ? 'selected' : ''}>4:3 Classic</option>
              <option value="1/1" ${d.hero_image_aspect === '1/1' ? 'selected' : ''}>1:1 Square</option>
              <option value="auto" ${d.hero_image_aspect === 'auto' ? 'selected' : ''}>Auto Height</option>
            </select>
          </div>
        </div>
        ` : `
        <div class="inspector-card-group" style="opacity: 0.85;">
          <div class="inspector-group-title">
            <i class="fa-solid fa-circle-info"></i>
            <span>Media Display</span>
          </div>
          <p style="font-size:0.8rem; color:#94a3b8; line-height:1.45; margin:0;">
            In <strong>Conference Program</strong> layout, the media column displays the structured program card with event date, location, format, and registration CTA. To customize standalone media or stock photography, switch back to <strong>Split Showcase</strong>.
          </p>
        </div>
        `}
      `;
    } else if (t === "features") {
      html += `
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-list-check"></i>
            <span>Section Header</span>
          </div>
          <div class="inspector-field">
            <label>Section Tag</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_tag || '')}" oninput="updateField('${comp.id}', 'section_tag', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Title</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_title || '')}" oninput="updateField('${comp.id}', 'section_title', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Subtitle</label>
            <textarea class="inspector-input" oninput="updateField('${comp.id}', 'section_subtitle', this.value)">${escapeHtml(d.section_subtitle || '')}</textarea>
          </div>
        </div>

        <div class="inspector-card-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <div class="inspector-group-title" style="margin:0;">
              <i class="fa-solid fa-cubes"></i>
              <span>Feature Cards (${(d.items || []).length})</span>
            </div>
            <button type="button" class="btn-stock-pill" style="border-color:#38bdf8; color:#38bdf8;" onclick="addFeatureItem('${comp.id}')">+ Add Card</button>
          </div>

          <div class="dynamic-items-container">
            ${(d.items || []).map((item, idx) => `
              <div class="dynamic-sub-card">
                <button class="btn-del-subitem" onclick="deleteSubItem('${comp.id}', 'items', ${idx})" title="Delete Card">&times;</button>
                
                <!-- FontAwesome / Lumina Icon Selector -->
                <label style="font-size:0.72rem; color:#94a3b8; margin-bottom:0.3rem; display:block;">Vector Icon (FontAwesome)</label>
                <div class="icon-picker-row">
                  <div class="icon-preview-box">
                    ${renderVectorIcon(item.icon || 'fa-solid fa-microscope')}
                  </div>
                  <div style="flex:1;">
                    <select class="inspector-select" onchange="updateSubField('${comp.id}', 'items', ${idx}, 'icon', this.value)">
                      ${SCIENTIFIC_ICONS.map(ic => `
                        <option value="${ic.val}" ${item.icon === ic.val ? 'selected' : ''}>${ic.label}</option>
                      `).join('')}
                    </select>
                  </div>
                </div>

                <div class="inspector-field" style="margin-top:0.4rem;">
                  <label style="font-size:0.72rem; color:#94a3b8;">Custom Icon Class (Optional)</label>
                  <input type="text" class="inspector-input" placeholder="e.g. fa-solid fa-dna" value="${escapeHtml(item.icon || '')}" oninput="updateSubField('${comp.id}', 'items', ${idx}, 'icon', this.value)">
                </div>

                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Feature Title</label>
                  <input type="text" class="inspector-input" placeholder="Card Title" value="${escapeHtml(item.title || '')}" oninput="updateSubField('${comp.id}', 'items', ${idx}, 'title', this.value)">
                </div>

                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Card Description</label>
                  <textarea class="inspector-input" style="min-height:55px;" placeholder="Description..." oninput="updateSubField('${comp.id}', 'items', ${idx}, 'description', this.value)">${escapeHtml(item.description || '')}</textarea>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (t === "speakers") {
      html += `
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-users"></i>
            <span>Faculty Header</span>
          </div>
          <div class="inspector-field">
            <label>Section Tag</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_tag || '')}" oninput="updateField('${comp.id}', 'section_tag', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Title</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_title || '')}" oninput="updateField('${comp.id}', 'section_title', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Subtitle</label>
            <textarea class="inspector-input" oninput="updateField('${comp.id}', 'section_subtitle', this.value)">${escapeHtml(d.section_subtitle || '')}</textarea>
          </div>
        </div>

        <div class="inspector-card-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <div class="inspector-group-title" style="margin:0;">
              <i class="fa-solid fa-id-card"></i>
              <span>Faculty Members (${(d.speakers || []).length})</span>
            </div>
            <button type="button" class="btn-stock-pill" style="border-color:#38bdf8; color:#38bdf8;" onclick="addSpeakerItem('${comp.id}')">+ Add Speaker</button>
          </div>

          <div class="dynamic-items-container">
            ${(d.speakers || []).map((spk, idx) => `
              <div class="dynamic-sub-card">
                <button class="btn-del-subitem" onclick="deleteSubItem('${comp.id}', 'speakers', ${idx})" title="Delete Speaker">&times;</button>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Full Name & Degree</label>
                  <input type="text" class="inspector-input" placeholder="e.g. Dr. Jane Smith, MD, PhD" value="${escapeHtml(spk.name || '')}" oninput="updateSubField('${comp.id}', 'speakers', ${idx}, 'name', this.value)">
                </div>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Title / Role</label>
                  <input type="text" class="inspector-input" placeholder="e.g. Chair of Immunology" value="${escapeHtml(spk.role || '')}" oninput="updateSubField('${comp.id}', 'speakers', ${idx}, 'role', this.value)">
                </div>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Affiliation / Institute</label>
                  <input type="text" class="inspector-input" placeholder="e.g. Harvard Medical School" value="${escapeHtml(spk.affiliation || '')}" oninput="updateSubField('${comp.id}', 'speakers', ${idx}, 'affiliation', this.value)">
                </div>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Photo URL</label>
                  <input type="text" class="inspector-input" value="${escapeHtml(spk.photo || '')}" oninput="updateSubField('${comp.id}', 'speakers', ${idx}, 'photo', this.value)">
                  <div class="stock-preset-pills">
                    ${SPEAKER_AVATAR_PRESETS.map(av => `
                      <button type="button" class="btn-stock-pill" onclick="setSpeakerAvatar('${comp.id}', ${idx}, '${av.url}')">${av.label}</button>
                    `).join('')}
                  </div>
                </div>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Short Bio</label>
                  <textarea class="inspector-input" style="min-height:50px;" oninput="updateSubField('${comp.id}', 'speakers', ${idx}, 'bio', this.value)">${escapeHtml(spk.bio || '')}</textarea>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (t === "pricing") {
      html += `
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-ticket"></i>
            <span>Tickets & Pricing Header</span>
          </div>
          <div class="inspector-field">
            <label>Section Tag</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_tag || '')}" oninput="updateField('${comp.id}', 'section_tag', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Title</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_title || '')}" oninput="updateField('${comp.id}', 'section_title', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Subtitle</label>
            <textarea class="inspector-input" oninput="updateField('${comp.id}', 'section_subtitle', this.value)">${escapeHtml(d.section_subtitle || '')}</textarea>
          </div>
        </div>

        <div class="inspector-card-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <div class="inspector-group-title" style="margin:0;">
              <i class="fa-solid fa-credit-card"></i>
              <span>Pass Tiers (${(d.tiers || []).length})</span>
            </div>
            <button type="button" class="btn-stock-pill" style="border-color:#38bdf8; color:#38bdf8;" onclick="addPricingItem('${comp.id}')">+ Add Tier</button>
          </div>

          <div class="dynamic-items-container">
            ${(d.tiers || []).map((ti, idx) => `
              <div class="dynamic-sub-card">
                <button class="btn-del-subitem" onclick="deleteSubItem('${comp.id}', 'tiers', ${idx})" title="Delete Tier">&times;</button>
                <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:0.5rem;">
                  <div>
                    <label style="font-size:0.72rem; color:#94a3b8;">Tier Name</label>
                    <input type="text" class="inspector-input" value="${escapeHtml(ti.name || '')}" oninput="updateSubField('${comp.id}', 'tiers', ${idx}, 'name', this.value)">
                  </div>
                  <div>
                    <label style="font-size:0.72rem; color:#94a3b8;">Price</label>
                    <input type="text" class="inspector-input" value="${escapeHtml(ti.price || '')}" oninput="updateSubField('${comp.id}', 'tiers', ${idx}, 'price', this.value)">
                  </div>
                </div>

                <div class="inspector-field" style="margin-top:0.4rem;">
                  <label style="font-size:0.72rem; color:#94a3b8;">Sub-label / Period</label>
                  <input type="text" class="inspector-input" placeholder="/ delegate" value="${escapeHtml(ti.period || '')}" oninput="updateSubField('${comp.id}', 'tiers', ${idx}, 'period', this.value)">
                </div>

                <label class="inspector-toggle-label" style="margin-top:0.4rem;">
                  <input type="checkbox" ${ti.featured ? 'checked' : ''} onchange="updateSubField('${comp.id}', 'tiers', ${idx}, 'featured', this.checked)">
                  <span>Highlight as Recommended / Featured</span>
                </label>

                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Button Label</label>
                  <input type="text" class="inspector-input" value="${escapeHtml(ti.btn_label || 'Select Pass')}" oninput="updateSubField('${comp.id}', 'tiers', ${idx}, 'btn_label', this.value)">
                </div>

                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Included Features (1 per line)</label>
                  <textarea class="inspector-input" style="min-height:60px;" oninput="updateTierFeatures('${comp.id}', ${idx}, this.value)">${(ti.features || []).join('\n')}</textarea>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (t === "gallery") {
      html += `
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-images"></i>
            <span>Photo Gallery</span>
          </div>
          <div class="inspector-field">
            <label>Section Tag</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_tag || '')}" oninput="updateField('${comp.id}', 'section_tag', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Title</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_title || '')}" oninput="updateField('${comp.id}', 'section_title', this.value)">
          </div>
        </div>

        <div class="inspector-card-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <div class="inspector-group-title" style="margin:0;">
              <span>Images (${(d.images || []).length})</span>
            </div>
            <button type="button" class="btn-stock-pill" style="border-color:#38bdf8; color:#38bdf8;" onclick="addGalleryItem('${comp.id}')">+ Add Photo</button>
          </div>

          <div class="dynamic-items-container">
            ${(d.images || []).map((img, idx) => `
              <div class="dynamic-sub-card">
                <button class="btn-del-subitem" onclick="deleteSubItem('${comp.id}', 'images', ${idx})">&times;</button>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Image URL</label>
                  <input type="text" class="inspector-input" value="${escapeHtml(img.url || '')}" oninput="updateSubField('${comp.id}', 'images', ${idx}, 'url', this.value)">
                  <div class="stock-preset-pills">
                    ${SCIENTIFIC_STOCK_IMAGES.map(stk => `
                      <button type="button" class="btn-stock-pill" onclick="setGalleryStockImage('${comp.id}', ${idx}, '${stk.url}')">${stk.label}</button>
                    `).join('')}
                  </div>
                </div>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Caption</label>
                  <input type="text" class="inspector-input" value="${escapeHtml(img.caption || '')}" oninput="updateSubField('${comp.id}', 'images', ${idx}, 'caption', this.value)">
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (t === "faq") {
      html += `
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-circle-question"></i>
            <span>FAQ Header</span>
          </div>
          <div class="inspector-field">
            <label>Section Tag</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_tag || '')}" oninput="updateField('${comp.id}', 'section_tag', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Title</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_title || '')}" oninput="updateField('${comp.id}', 'section_title', this.value)">
          </div>
        </div>

        <div class="inspector-card-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <div class="inspector-group-title" style="margin:0;">
              <span>Questions & Answers (${(d.faqs || []).length})</span>
            </div>
            <button type="button" class="btn-stock-pill" style="border-color:#38bdf8; color:#38bdf8;" onclick="addFaqItem('${comp.id}')">+ Add FAQ</button>
          </div>

          <div class="dynamic-items-container">
            ${(d.faqs || []).map((faq, idx) => `
              <div class="dynamic-sub-card">
                <button class="btn-del-subitem" onclick="deleteSubItem('${comp.id}', 'faqs', ${idx})">&times;</button>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Question</label>
                  <input type="text" class="inspector-input" value="${escapeHtml(faq.q || '')}" oninput="updateSubField('${comp.id}', 'faqs', ${idx}, 'q', this.value)">
                </div>
                <div class="inspector-field">
                  <label style="font-size:0.72rem; color:#94a3b8;">Answer</label>
                  <textarea class="inspector-input" style="min-height:55px;" oninput="updateSubField('${comp.id}', 'faqs', ${idx}, 'a', this.value)">${escapeHtml(faq.a || '')}</textarea>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (t === "contact") {
      html += `
        <div class="inspector-card-group">
          <div class="inspector-group-title">
            <i class="fa-solid fa-envelope"></i>
            <span>Contact & RSVP Details</span>
          </div>
          <div class="inspector-field">
            <label>Section Tag</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_tag || '')}" oninput="updateField('${comp.id}', 'section_tag', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Title</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.section_title || '')}" oninput="updateField('${comp.id}', 'section_title', this.value)">
          </div>
          <div class="inspector-field">
            <label>Section Subtitle</label>
            <textarea class="inspector-input" oninput="updateField('${comp.id}', 'section_subtitle', this.value)">${escapeHtml(d.section_subtitle || '')}</textarea>
          </div>
          <div class="inspector-field">
            <label>Contact Email</label>
            <input type="email" class="inspector-input" value="${escapeHtml(d.email || '')}" oninput="updateField('${comp.id}', 'email', this.value)">
          </div>
          <div class="inspector-field">
            <label>Phone / Office</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.phone || '')}" oninput="updateField('${comp.id}', 'phone', this.value)">
          </div>
          <div class="inspector-field">
            <label>Campus / Venue Location</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.location || '')}" oninput="updateField('${comp.id}', 'location', this.value)">
          </div>
          <div class="inspector-field">
            <label>Submit Button Text</label>
            <input type="text" class="inspector-input" value="${escapeHtml(d.btn_text || 'Submit Inquiry')}" oninput="updateField('${comp.id}', 'btn_text', this.value)">
          </div>
        </div>
      `;
    }

    if (['about','stats','agenda','sponsors','testimonials','announcement'].includes(t)) {
      html += `<div class="inspector-field"><label>Section design</label><select class="inspector-select" onchange="updateField('${comp.id}','design',this.value)">${[['grid','Card grid'],['list','Editorial list'],['spotlight','Centered spotlight']].map(([value,label]) => `<option value="${value}" ${(d.design || 'grid') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
      for (const [key,label] of [['section_title','Heading'],['section_subtitle','Introduction']]) html += `<div class="inspector-field"><label>${label}</label><textarea class="inspector-input" oninput="updateField('${comp.id}','${key}',this.value)">${escapeHtml(d[key] || '')}</textarea></div>`;
      html += (d.items || []).map((item,index) => `<div class="inspector-card-group"><div class="inspector-group-title">Item ${index+1}</div>${[['title','Title / name / number'],['description','Description / quote / session details'],['image','Image or logo URL (optional)']].map(([key,label]) => `<div class="inspector-field"><label>${label}</label><textarea class="inspector-input" oninput="updateSubField('${comp.id}','items',${index},'${key}',this.value)">${escapeHtml(item[key] || '')}</textarea></div>`).join('')}<button type="button" class="btn-sec-tool" onclick="deleteSubItem('${comp.id}','items',${index})">Remove item</button></div>`).join('');
      html += `<button type="button" class="btn-sec-tool" onclick="addStudioContentItem('${comp.id}')">+ Add item</button>`;
    }
    if(t==='image')html+=`<button class="studio-add-open" type="button" onclick="chooseStudioImage('${comp.id}')">Upload / replace image</button><div class="inspector-field"><label>Caption</label><input class="inspector-input" value="${escapeHtml(d.caption||'')}" oninput="updateField('${comp.id}','caption',this.value)"></div>`;
    if (t === 'navbar' || t === 'footer') {
      const fields = t === 'navbar' ? [['brand_name','Brand name'],['cta_label','Button label'],['cta_url','Button link']] : [['brand_name','Brand name'],['tagline','Short introduction'],['copyright','Copyright text']];
      html += fields.map(([key,label]) => `<div class="inspector-field"><label>${label}</label><input class="inspector-input" value="${escapeHtml(d[key] || '')}" oninput="updateField('${comp.id}','${key}',this.value)"></div>`).join('');
    }
    if (t === 'custom') html += `<div class="inspector-field"><label>HTML and CSS (scripts disabled)</label><textarea class="inspector-input studio-code-input" spellcheck="false" oninput="updateField('${comp.id}','html',this.value)">${escapeHtml(d.html || '')}</textarea><label>Embed height (px)</label><input type="number" class="inspector-input" min="100" max="2000" value="${Number(d.height) || 300}" onchange="updateField('${comp.id}','height',this.value)"></div>`;
    if (t === 'hero') html = `<div class="inspector-card-group"><label class="control-label">Hero design</label><select class="inspector-select" onchange="setHeroLayoutVariant('${comp.id}',this.value)">${[['split','Split showcase'],['conference_program','Conference program'],['centered','Centered spotlight'],['image_left','Image on left'],['image_top','Image first'],['text_only','Minimal typography']].map(([value,label]) => `<option value="${value}" ${(d.layout_variant || 'split') === value ? 'selected' : ''}>${label}</option>`).join('')}</select><p class="panel-section-subtitle">Switch designs without losing your content.</p></div>` + html;
    inspectorContent.innerHTML = studioAppearanceControls(comp) + html;
    organizeStudioInspector(comp);
  }

  // Real-Time Field Update Handlers
  window.updateField = function(compId, field, val) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp) return;
    if (!comp.data) comp.data = {};
    comp.data[field] = val;
    renderCanvas();
    if (field === 'headline_gradient' || field === 'gradient_preset' || field === 'primary_btn_style' || field === 'layout_variant') {
      renderInspector(comp);
    }
  };

  window.setHeroLayoutVariant = function(compId, variant) {
    window.updateField(compId, 'layout_variant', variant);
  };

  window.updateSubField = function(compId, arrName, idx, field, val) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data || !comp.data[arrName] || !comp.data[arrName][idx]) return;
    comp.data[arrName][idx][field] = val;
    renderCanvas();
    if (field === 'icon') {
      renderInspector(comp);
    }
  };

  window.setHeroStockImage = function(compId, url) {
    window.updateField(compId, 'hero_image', url);
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (comp) renderInspector(comp);
  };

  window.setHeroTextAlign = function(compId, align) {
    window.updateField(compId, 'text_align', align);
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (comp) renderInspector(comp);
  };

  window.setPrimaryBtnRadius = function(compId, radius) {
    window.updateField(compId, 'primary_btn_radius', radius);
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (comp) renderInspector(comp);
  };

  window.setSpeakerAvatar = function(compId, idx, url) {
    window.updateSubField(compId, 'speakers', idx, 'photo', url);
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (comp) renderInspector(comp);
  };

  window.setGalleryStockImage = function(compId, idx, url) {
    window.updateSubField(compId, 'images', idx, 'url', url);
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (comp) renderInspector(comp);
  };

  window.updateTierFeatures = function(compId, idx, textVal) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data || !comp.data.tiers || !comp.data.tiers[idx]) return;
    comp.data.tiers[idx].features = textVal.split('\n').map(s => s.trim()).filter(Boolean);
    renderCanvas();
  };

  window.deleteSubItem = function(compId, arrName, idx) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data || !comp.data[arrName]) return;
    comp.data[arrName].splice(idx, 1);
    renderCanvas();
    renderInspector(comp);
  };

  window.addFeatureItem = function(compId) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data) return;
    if (!comp.data.items) comp.data.items = [];
    comp.data.items.push({ icon: "fa-solid fa-microscope", title: "New Feature", description: "Describe this key offering." });
    renderCanvas();
    renderInspector(comp);
  };

  window.addSpeakerItem = function(compId) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data) return;
    if (!comp.data.speakers) comp.data.speakers = [];
    comp.data.speakers.push({
      name: "Dr. Jane Doe, PhD",
      role: "Lead Investigator",
      affiliation: "Academic Medical Center",
      photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
      bio: "Pioneering novel biochemical pathways and clinical trials."
    });
    renderCanvas();
    renderInspector(comp);
  };

  window.addPricingItem = function(compId) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data) return;
    if (!comp.data.tiers) comp.data.tiers = [];
    comp.data.tiers.push({
      name: "Standard Pass",
      price: "$299",
      period: "/ delegate",
      featured: false,
      description: "Access to all conference sessions.",
      features: ["Full Session Access", "Conference Materials", "Digital Badge"],
      btn_label: "Select Pass",
      btn_url: "#contact"
    });
    renderCanvas();
    renderInspector(comp);
  };

  window.addGalleryItem = function(compId) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data) return;
    if (!comp.data.images) comp.data.images = [];
    comp.data.images.push({
      url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=900&auto=format&fit=crop&q=80",
      caption: "Main Auditorium Hall"
    });
    renderCanvas();
    renderInspector(comp);
  };

  window.addFaqItem = function(compId) {
    if (!currentSite || !currentSite.schema_json) return;
    const comp = currentSite.schema_json.find(c => c.id === compId);
    if (!comp || !comp.data) return;
    if (!comp.data.faqs) comp.data.faqs = [];
    comp.data.faqs.push({ q: "What is the conference schedule?", a: "The detailed schedule will be shared with all registered delegates." });
    renderCanvas();
    renderInspector(comp);
  };

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Hook into tab switching:
  navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (target === "builder" && tab.getAttribute("target") !== "_blank") {
        fetchBuilderSites();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // URL Routing Initialization (/dashboard, /websitebuilder, /nih, etc.)
  // ---------------------------------------------------------------------------
  function initBrowserRouting() {
    const p = window.location.pathname.toLowerCase();
    let targetTab = "pipeline";
    if (p.includes("scistudio") || p.includes("websitebuilder") || p.includes("builder")) {
      targetTab = "builder";
      if (p.includes("websitebuilder") || p.includes("builder")) {
        try { window.history.replaceState({ tab: "builder" }, "", "/scistudio"); } catch(e) {}
      }
    } else if (p.includes("nih")) {
      targetTab = "nih";
    } else if (p.includes("explorer")) {
      targetTab = "explorer";
    } else if (p.includes("datasets")) {
      targetTab = "datasets";
    } else {
      try {
        const savedTab = sessionStorage.getItem("scip_active_tab");
        if (savedTab && ["pipeline", "nih", "explorer", "datasets", "builder"].includes(savedTab)) {
          targetTab = savedTab;
        }
      } catch (e) {}
    }
    switchTab(targetTab, false);
  }

  window.addEventListener("popstate", (e) => {
    if (e.state && e.state.tab) {
      switchTab(e.state.tab, false);
    } else {
      initBrowserRouting();
    }
  });

  checkAuthSession();
  setInterval(checkAuthSession, 4000);
});

