const TS_CONFIG = {
  CHANNEL_ID: "YOUR_CHANNEL_ID",
  READ_KEY: "YOUR_READ_KEY",
  WRITE_KEY: "YOUR_WRITE_KEY",
  USER_KEY: "COLE_AQUI_USER_KEY",
};

const UI_CONSTANTS = {
  COLORS: {
    TEMP_LINE: "#ef4444",
    TEMP_BG: "rgba(239, 68, 68, 0.1)",
    HUM_LINE: "#06b6d4",
    HUM_BG: "rgba(6, 182, 212, 0.1)",

    VOLT_LINE: "#f59e0b",
    VOLT_BG: "rgba(245, 158, 11, 0.1)",
    CURR_LINE: "#8b5cf6",
    CURR_BG: "rgba(139, 92, 246, 0.1)",
    POW_LINE: "#10b981",
    POW_BG: "rgba(16, 185, 129, 0.1)",

    ONLINE: "#10b981",
    OFFLINE: "#ef4444",
  },
};

const AppState = {
  charts: { temp: null, hum: null, volt: null, curr: null, power: null },
  history: {
    feeds: [],
    currentPage: 1,
    itemsPerPage: 10,
  },
  isMqttConnected: false,
};

const Utils = {
  formatValue: (val) => parseFloat(val).toFixed(1),

  formatTime: (dateStr) =>
    new Date(dateStr).toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    }),

  formatChartDate: (dateStr) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const hour = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month} ${hour}:${min}`;
  },

  formatInputDate: (dateObj) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(
      dateObj.getDate()
    )}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  },

  formatFullDate: (dateStr) => new Date(dateStr).toLocaleString("pt-PT"),

  getApiUrl: (endpoint, params = "") =>
    `https://api.thingspeak.com/channels/${TS_CONFIG.CHANNEL_ID}/${endpoint}?api_key=${TS_CONFIG.READ_KEY}${params}`,

  getKeyToUse: () =>
    TS_CONFIG.USER_KEY && !TS_CONFIG.USER_KEY.includes("COLE_AQUI")
      ? TS_CONFIG.USER_KEY
      : TS_CONFIG.WRITE_KEY,

  showToast: (message, type = "info") => {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "info-circle";
    if (type === "success") icon = "check-circle";
    if (type === "error") icon = "exclamation-circle";
    if (type === "warning") icon = "exclamation-triangle";

    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },
};

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  DashboardModule.initCharts();
  UIModule.initPCBViewer();
  UIModule.initDatePickers();
  UIModule.setupGeneralUI();
  UIModule.setupDiagramModals();

  AuthModule.init();

  CodeModule.init();
  UIModule.openTechTab();
  UIModule.setupRegisterInteractions();

  StatusModule.startMonitoring();
  HistoryModule.setupControls();
  DashboardModule.setupControls();

  DashboardModule.loadLastAvailableDay();

  MqttModule.init();

  UIModule.setupArchitectureSwitch();

  TechDeckModule.init();

  FluxosModule.init();
}

const StatusModule = {
  startMonitoring: function () {
    this.checkDeviceHealth();
    setInterval(() => this.checkDeviceHealth(), 30000);
  },

  checkDeviceHealth: async function () {
    const ui = {
      statusText: document.getElementById("ts-status-text"),
      statusDot: document.getElementById("ts-status-dot"),
      statusPill: document.getElementById("dashboard-status-pill"),
      navDot: document.getElementById("nav-status-dot"),
      navText: document.getElementById("nav-status-text"),
    };

    try {
      const req = await fetch(Utils.getApiUrl("feeds.json", "&results=1"));
      const data = await req.json();

      if (data.feeds.length > 0) {
        const lastEntryDate = new Date(data.feeds[0].created_at);
        const now = new Date();
        const diffMinutes = (now - lastEntryDate) / 60000;
        const isOnline = diffMinutes < 2;

        this.updateStatusUI(ui, isOnline);
        DashboardModule.updateCards(data.feeds[0]);
      }
    } catch (e) {
      console.error("Erro Status Check:", e);
      if (ui.statusText) ui.statusText.innerText = "Erro Rede";
      if (ui.statusDot)
        ui.statusDot.style.backgroundColor = UI_CONSTANTS.COLORS.OFFLINE;
    }
  },

  updateStatusUI: function (ui, isOnline) {
    const label = isOnline ? "Online" : "Offline";
    const color = isOnline
      ? UI_CONSTANTS.COLORS.ONLINE
      : UI_CONSTANTS.COLORS.OFFLINE;
    const pillBg = isOnline
      ? "rgba(16, 185, 129, 0.1)"
      : "rgba(239, 68, 68, 0.1)";
    const pillBorder = isOnline
      ? "rgba(16, 185, 129, 0.2)"
      : "rgba(239, 68, 68, 0.2)";

    if (ui.statusPill) {
      ui.statusPill.style.background = pillBg;
      ui.statusPill.style.borderColor = pillBorder;
    }
    if (ui.statusText) {
      ui.statusText.innerText = label;
      ui.statusText.style.color = isOnline ? "var(--success)" : "var(--danger)";
    }
    if (ui.statusDot) {
      ui.statusDot.style.backgroundColor = color;
      ui.statusDot.style.boxShadow = isOnline
        ? "0 0 0 2px rgba(16, 185, 129, 0.2)"
        : "none";
    }

    if (ui.navDot) {
      ui.navDot.style.backgroundColor = color;
      ui.navDot.style.boxShadow = isOnline
        ? "0 0 0 2px rgba(16, 185, 129, 0.2)"
        : "none";
    }
    if (ui.navText) {
      ui.navText.innerText = label;
    }
  },
};

const DashboardModule = {
  liveTimer: null,
  lastEntryId: 0,

  setupControls: function () {
    document
      .getElementById("btn-chart-filter")
      ?.addEventListener("click", () => {
        this.stopLiveUpdate();
        const start = document.getElementById("chart-start").value;
        const end = document.getElementById("chart-end").value;
        if (!start && !end) {
          Utils.showToast("Selecione um intervalo.", "warning");
          return;
        }
        let params = "";
        if (start) params += `&start=${start}%2000:00:00`;
        if (end) params += `&end=${end}%2023:59:59`;
        const sLabel = start
          ? new Date(start).toLocaleDateString("pt-PT")
          : "...";
        const eLabel = end ? new Date(end).toLocaleDateString("pt-PT") : "...";
        this.loadCustomChartData(
          params,
          `Visualizando: De ${sLabel} a ${eLabel}`,
          false
        );
      });

    document.getElementById("btn-chart-all")?.addEventListener("click", () => {
      document.getElementById("chart-start").value = "";
      document.getElementById("chart-end").value = "";
      this.loadCustomChartData(
        "&results=8000",
        "Visualizando: Tempo Real (Histórico)",
        true
      );
    });
  },

  initCharts: function () {
    const ctxTemp = document.getElementById("chart-temp")?.getContext("2d");
    const ctxHum = document.getElementById("chart-hum")?.getContext("2d");
    const ctxVolt = document.getElementById("chart-voltage")?.getContext("2d");
    const ctxCurr = document.getElementById("chart-current")?.getContext("2d");
    const ctxPower = document.getElementById("chart-power")?.getContext("2d");

    const createConfig = (
      label,
      colorLine,
      colorBg,
      minY = null,
      maxY = null
    ) => ({
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: label,
            data: [],
            borderColor: colorLine,
            backgroundColor: colorBg,
            borderWidth: 2,
            tension: 0.3,
            fill: "start",
            pointRadius: 2,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: "top" },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 10,
              maxRotation: 0,
              autoSkip: true,
            },

            bounds: "data",
            grid: {
              display: false,
            },
          },
          y: {
            beginAtZero: true,
            min: minY !== null ? minY : undefined,
            max: maxY !== null ? maxY : undefined,
          },
        },
        interaction: { mode: "nearest", axis: "x", intersect: false },
      },
    });

    if (ctxTemp)
      AppState.charts.temp = new Chart(
        ctxTemp,
        createConfig(
          "Temperatura (°C)",
          UI_CONSTANTS.COLORS.TEMP_LINE,
          UI_CONSTANTS.COLORS.TEMP_BG,
          -20,
          40
        )
      );

    if (ctxHum)
      AppState.charts.hum = new Chart(
        ctxHum,
        createConfig(
          "Humidade (%)",
          UI_CONSTANTS.COLORS.HUM_LINE,
          UI_CONSTANTS.COLORS.HUM_BG,
          0,
          100
        )
      );

    if (ctxVolt)
      AppState.charts.volt = new Chart(
        ctxVolt,
        createConfig(
          "Tensão Solar (mV)",
          UI_CONSTANTS.COLORS.VOLT_LINE,
          UI_CONSTANTS.COLORS.VOLT_BG,
          0,
          10000
        )
      );

    if (ctxCurr)
      AppState.charts.curr = new Chart(
        ctxCurr,
        createConfig(
          "Corrente (mA)",
          UI_CONSTANTS.COLORS.CURR_LINE,
          UI_CONSTANTS.COLORS.CURR_BG,
          0,
          400
        )
      );

    if (ctxPower)
      AppState.charts.power = new Chart(
        ctxPower,
        createConfig(
          "Potência Gerada (mW)",
          UI_CONSTANTS.COLORS.POW_LINE,
          UI_CONSTANTS.COLORS.POW_BG,
          0,
          2000
        )
      );
  },

  loadLastAvailableDay: async function () {
    try {
      const reqLast = await fetch(Utils.getApiUrl("feeds.json", "&results=1"));
      const dataLast = await reqLast.json();

      if (dataLast.feeds && dataLast.feeds.length > 0) {
        const lastDate = dataLast.feeds[0].created_at.split("T")[0];

        const startInput = document.getElementById("chart-start");
        if (startInput && startInput._flatpickr) {
          startInput._flatpickr.setDate(lastDate);
        }

        const params = `&start=${lastDate}%2000:00:00`;
        await this.loadCustomChartData(
          params,
          `Visualizando: Últimos dados (${lastDate})`,
          true
        );
      } else {
        Utils.showToast("O canal está vazio.", "info");
      }
    } catch (e) {
      console.error("Erro ao procurar último dia com dados:", e);
      Utils.showToast("Erro ao carregar dados iniciais.", "error");
    }
  },

  loadCustomChartData: async function (
    queryParams,
    manualLabel = null,
    enableLive = false
  ) {
    this.stopLiveUpdate();
    try {
      const req = await fetch(Utils.getApiUrl("feeds.json", queryParams));
      const data = await req.json();
      if (data.feeds.length > 0) {
        this.lastEntryId = data.feeds[data.feeds.length - 1].entry_id;
        this.updateChartsData(data.feeds);
        const feedback = document.getElementById("chart-feedback-text");
        if (feedback)
          feedback.innerHTML =
            manualLabel || `Visualizando: ${data.feeds.length} pontos`;
        if (enableLive) {
          this.startLiveUpdate();
          if (feedback)
            feedback.innerHTML +=
              ' <span style="color:#10b981; font-weight:bold; font-size:0.8em;">(Ao Vivo <i class="fas fa-circle fa-xs"></i>)</span>';
        }
      } else {
        Utils.showToast("Sem dados para este período.", "warning");
      }
    } catch (e) {
      console.error("Erro Chart Load:", e);
      Utils.showToast("Erro ao carregar gráfico.", "error");
    }
  },

  updateChartsData: function (feeds) {
    if (!AppState.charts.temp) return;

    const labels = feeds.map((f) => Utils.formatChartDate(f.created_at));

    const dataTemp = feeds.map((f) => parseFloat(f.field1 || 0));
    const dataHum = feeds.map((f) => parseFloat(f.field2 || 0));
    const dataVolt = feeds.map((f) => parseFloat(f.field3 || 0));
    const dataCurr = feeds.map((f) => parseFloat(f.field4 || 0));
    const dataPower = feeds.map((f) => parseFloat(f.field5 || 0));

    const setChart = (chart, lbls, vals) => {
      if (chart) {
        chart.data.labels = lbls;
        chart.data.datasets[0].data = vals;
        chart.update();
      }
    };

    setChart(AppState.charts.temp, labels, dataTemp);
    setChart(AppState.charts.hum, labels, dataHum);
    setChart(AppState.charts.volt, labels, dataVolt);
    setChart(AppState.charts.curr, labels, dataCurr);
    setChart(AppState.charts.power, labels, dataPower);
  },

  updateCards: function (feed) {
    const tempEl = document.getElementById("ts-temp");
    const humEl = document.getElementById("ts-hum");
    const lastUpdateEl = document.getElementById("ts-last-update");
    if (tempEl) tempEl.innerText = `${Utils.formatValue(feed.field1)} °C`;
    if (humEl) humEl.innerText = `${Utils.formatValue(feed.field2)} %`;

    const voltEl = document.getElementById("ts-voltage");
    const currEl = document.getElementById("ts-current");
    const powEl = document.getElementById("ts-power");
    if (voltEl) voltEl.innerText = `${feed.field3} mV`;
    if (currEl) currEl.innerText = `${feed.field4} mA`;
    if (powEl) powEl.innerText = `${feed.field5} mW`;

    if (lastUpdateEl)
      lastUpdateEl.innerText = new Date(feed.created_at).toLocaleTimeString(
        "pt-PT"
      );
  },

  startLiveUpdate: function () {
    this.liveTimer = setInterval(async () => {
      await this.fetchNewPoint();
    }, 15000);
  },
  stopLiveUpdate: function () {
    if (this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
  },
  fetchNewPoint: async function () {
    try {
      const req = await fetch(Utils.getApiUrl("feeds.json", "&results=1"));
      const data = await req.json();
      if (data.feeds.length > 0) {
        const feed = data.feeds[0];
        if (feed.entry_id > this.lastEntryId) {
          this.lastEntryId = feed.entry_id;
          this.addPointToChart(feed);
          this.updateCards(feed);
        }
      }
    } catch (e) {
      console.error("Erro Live Update:", e);
    }
  },

  addPointToChart: function (feed) {
    const label = Utils.formatChartDate(feed.created_at);

    const valTemp = parseFloat(feed.field1 || 0);
    const valHum = parseFloat(feed.field2 || 0);
    const valVolt = parseFloat(feed.field3 || 0);
    const valCurr = parseFloat(feed.field4 || 0);
    const valPower = parseFloat(feed.field5 || 0);

    const pushData = (chart, lbl, val) => {
      if (!chart) return;
      chart.data.labels.push(lbl);
      chart.data.datasets[0].data.push(val);

      if (chart.data.labels.length > 8000) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update("none");
    };

    pushData(AppState.charts.temp, label, valTemp);
    pushData(AppState.charts.hum, label, valHum);
    pushData(AppState.charts.volt, label, valVolt);
    pushData(AppState.charts.curr, label, valCurr);
    pushData(AppState.charts.power, label, valPower);
  },
};

const HistoryModule = {
  setupControls: function () {
    document
      .getElementById("btn-load-history")
      ?.addEventListener("click", () => this.loadData());

    document.getElementById("btn-hist-all")?.addEventListener("click", () => {
      const startEl = document.getElementById("hist-start");
      const endEl = document.getElementById("hist-end");
      if (startEl && startEl._flatpickr) startEl._flatpickr.clear();
      if (endEl && endEl._flatpickr) endEl._flatpickr.clear();
      this.loadData(8000);
    });

    document
      .getElementById("btn-download-csv")
      ?.addEventListener("click", () => {
        const start = document.getElementById("hist-start").value;
        const end = document.getElementById("hist-end").value;
        let params = "&results=8000";
        if (start) params = `&start=${start}%2000:00:00`;
        if (end) params += `&end=${end}%2023:59:59`;
        window.open(Utils.getApiUrl("feeds.csv", params), "_blank");
      });

    document
      .getElementById("btn-delete-all")
      ?.addEventListener("click", async () => {
        if (confirm("Apagar TUDO? Irreversível.")) await this.deleteData("all");
      });

    document
      .getElementById("btn-prev-page")
      ?.addEventListener("click", () => this.changePage(-1));
    document
      .getElementById("btn-next-page")
      ?.addEventListener("click", () => this.changePage(1));
  },

  loadData: async function (limitOverride = null) {
    const tbody = document.getElementById("history-table-body");
    const start = document.getElementById("hist-start").value;
    const end = document.getElementById("hist-end").value;
    const order = document.getElementById("hist-order").value;

    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-state"><i class="fas fa-spinner fa-spin"></i> A carregar...</td></tr>';

    try {
      const limit = typeof limitOverride === "number" ? limitOverride : 2000;
      let params = `&results=${limit}`;
      if (start) params += `&start=${start}%2000:00:00`;
      if (end) params += `&end=${end}%2023:59:59`;

      const req = await fetch(Utils.getApiUrl("feeds.json", params));
      const data = await req.json();

      AppState.history.feeds =
        order === "desc" ? data.feeds.reverse() : data.feeds;
      AppState.history.currentPage = 1;
      this.renderTable();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger); text-align:center;">Erro: ${e.message}</td></tr>`;
    }
  },

  renderTable: function () {
    const { feeds, currentPage, itemsPerPage } = AppState.history;
    const tbody = document.getElementById("history-table-body");
    tbody.innerHTML = "";

    if (feeds.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="empty-state">Sem dados.</td></tr>';
      this.updatePaginationUI(0);
      return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const pageItems = feeds.slice(start, start + itemsPerPage);

    pageItems.forEach((f) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
    <td><span class="pin-chip">#${f.entry_id}</span></td>
    <td>${Utils.formatFullDate(f.created_at)}</td>
    
    <td style="font-weight:600; color:${UI_CONSTANTS.COLORS.TEMP_LINE};">
      ${Utils.formatValue(f.field1)}
    </td>
    <td style="font-weight:600; color:${UI_CONSTANTS.COLORS.HUM_LINE};">
      ${Utils.formatValue(f.field2)}
    </td>
    
    <td style="font-weight:600; color:${UI_CONSTANTS.COLORS.VOLT_LINE};">
      ${f.field3}
    </td>
    <td style="font-weight:600; color:${UI_CONSTANTS.COLORS.CURR_LINE};">
      ${f.field4}
    </td>
    <td style="font-weight:600; color:${UI_CONSTANTS.COLORS.POW_LINE};">
      ${f.field5}
    </td>
`;
      tbody.appendChild(tr);
    });
    this.updatePaginationUI(Math.ceil(feeds.length / itemsPerPage));
  },

  updatePaginationUI: function (totalPages) {
    const btnPrev = document.getElementById("btn-prev-page");
    const btnNext = document.getElementById("btn-next-page");
    const indicator = document.getElementById("page-indicator");

    if (!btnPrev || !btnNext) return;
    btnPrev.disabled = AppState.history.currentPage === 1;
    btnNext.disabled =
      AppState.history.currentPage === totalPages || totalPages === 0;
    indicator.innerText =
      totalPages === 0
        ? "Sem dados"
        : `Página ${AppState.history.currentPage} de ${totalPages}`;
  },

  changePage: function (delta) {
    const totalPages = Math.ceil(
      AppState.history.feeds.length / AppState.history.itemsPerPage
    );
    const newPage = AppState.history.currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
      AppState.history.currentPage = newPage;
      this.renderTable();
    }
  },

  deleteData: async function (type, id = null) {
    let endpoint = type === "all" ? "feeds.json" : `feeds/${id}.json`;
    const url = `https://api.thingspeak.com/channels/${
      TS_CONFIG.CHANNEL_ID
    }/${endpoint}?api_key=${Utils.getKeyToUse()}`;
    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (response.ok) {
        if (type === "all") {
          Utils.showToast("Limpo com sucesso.", "success");
          AppState.history.feeds = [];
          this.renderTable();
        }
        return true;
      }
    } catch (error) {
      Utils.showToast("Erro: " + error.message, "error");
    }
    return false;
  },
};

const MqttModule = {
  client: null,
  currentMode: -1,
  deviceWatchdog: null,
  isDeviceOnline: false,

  config: {
    broker: "broker.hivemq.com",
    port: 8884,
    topicData: "solar_7016/dados",
    topicCmd: "solar_7016/comando",
  },

  init: function () {
    const clientId = "web_" + parseInt(Math.random() * 10000);
    this.client = new Paho.MQTT.Client(
      this.config.broker,
      this.config.port,
      clientId
    );

    this.client.onConnectionLost = this.onConnectionLost.bind(this);
    this.client.onMessageArrived = this.onMessageArrived.bind(this);

    this.connect();
    window.MqttApp = this;
  },

  connect: function () {
    this.updateBrokerStatus(false);
    this.client.connect({
      onSuccess: this.onConnect.bind(this),
      onFailure: (e) => {
        console.error("Erro Conexão:", e);
        this.updateBrokerStatus(false);
        this.updateDeviceStatus(false);
      },
      useSSL: true,
      timeout: 15,
      keepAliveInterval: 30,
      mqttVersion: 4,
    });
  },

  onConnect: function () {
    AppState.isMqttConnected = true;
    this.client.subscribe(this.config.topicData);
    this.updateBrokerStatus(true);
    Utils.showToast("Conectado ao Broker MQTT.", "success");
  },

  onConnectionLost: function (responseObject) {
    AppState.isMqttConnected = false;
    this.updateBrokerStatus(false);
    this.updateDeviceStatus(false);
    if (responseObject.errorCode !== 0) {
      setTimeout(() => this.connect(), 5000);
    }
  },

  onMessageArrived: function (message) {
    this.heartbeat();

    try {
      const d = JSON.parse(message.payloadString);

      if (d.mod !== undefined) {
        if (this.currentMode !== d.mod) {
          this.currentMode = d.mod;
          this.updateMachineState(this.currentMode);
        }
      }

      if (d.t) this.setText("mqtt-temp", d.t + " °C");
      if (d.h) this.setText("mqtt-hum", d.h + " %");

      if (d.ang) {
        this.setText("mqtt-angH", d.ang[0] + "°");
        this.setText("mqtt-angV", d.ang[1] + "°");
      }

      if (d.raw) {
        this.setText("mqtt-raw-se", d.raw[0]);
        this.setText("mqtt-raw-sd", d.raw[1]);
        this.setText("mqtt-raw-ie", d.raw[2]);
        this.setText("mqtt-raw-id", d.raw[3]);
      }
      if (d.cal) {
        this.setText("mqtt-cal-se", d.cal[0]);
        this.setText("mqtt-cal-sd", d.cal[1]);
        this.setText("mqtt-cal-ie", d.cal[2]);
        this.setText("mqtt-cal-id", d.cal[3]);
      }

      if (d.sol_v !== undefined) this.setText("mqtt-sol-v", d.sol_v + " mV");
      if (d.sol_i !== undefined) this.setText("mqtt-sol-i", d.sol_i + " mA");
      if (d.sol_p !== undefined) this.setText("mqtt-sol-p", d.sol_p + " mW");
    } catch (e) {
      console.error("Erro MQTT Parse:", e);
    }
  },

  updateMachineState: function (mode) {
    const el = {
      pauseAlert: document.getElementById("system-paused-alert"),
      nightAlert: document.getElementById("night-mode-alert"),
      btnAuto: document.getElementById("btn-mode-auto"),
      btnManual: document.getElementById("btn-mode-manual"),
      dpad: document.getElementById("dpad-container"),
      autoView: document.getElementById("dpad-auto-view"),
      modeContainer: document.getElementById("mode-selector-container"),
      sunIcon:
        document.querySelector("#dpad-auto-view .fa-sun") ||
        document.querySelector("#dpad-auto-view .fa-moon"),
      statusMsg: document.querySelector("#dpad-auto-view .status-msg"),
      statusSub: document.querySelector("#dpad-auto-view .status-submsg"),
    };

    if (el.pauseAlert) el.pauseAlert.classList.add("hidden");
    if (el.nightAlert) el.nightAlert.classList.add("hidden");
    if (el.modeContainer) el.modeContainer.classList.remove("disabled");

    switch (mode) {
      case 0:
        if (el.pauseAlert) el.pauseAlert.classList.remove("hidden");
        if (el.modeContainer) el.modeContainer.classList.add("disabled");
        if (el.dpad) el.dpad.classList.add("disabled");
        break;

      case 1:
        this.setButtonActive(el.btnAuto, el.btnManual);
        if (el.dpad) el.dpad.classList.add("hidden");
        if (el.autoView) {
          el.autoView.classList.remove("hidden", "night-state");
          if (el.sunIcon) el.sunIcon.className = "fas fa-sun";
          if (el.statusMsg)
            el.statusMsg.innerText = "Controlo Automático Ativo";
          if (el.statusSub)
            el.statusSub.innerText =
              "O PID está a ajustar os eixos com base nos LDRs";
        }
        break;

      case 2:
        this.setButtonActive(el.btnManual, el.btnAuto);
        if (el.dpad) {
          el.dpad.classList.remove("hidden", "disabled");
        }
        if (el.autoView) el.autoView.classList.add("hidden");
        break;

      case 3:
        this.setButtonActive(el.btnAuto, el.btnManual);
        if (el.nightAlert) el.nightAlert.classList.remove("hidden");
        if (el.dpad) el.dpad.classList.add("hidden");

        if (el.autoView) {
          el.autoView.classList.remove("hidden");
          el.autoView.classList.add("night-state");
          if (el.sunIcon) el.sunIcon.className = "fas fa-moon night-icon-clean";
          if (el.statusMsg)
            el.statusMsg.innerHTML =
              '<i class="fas fa-stars"></i> Repouso Noturno';
          if (el.statusSub)
            el.statusSub.innerText =
              "Sistema estacionado (5º/45º). Aguardando o nascer do sol.";
        }
        break;
    }
  },

  setButtonActive: function (activeBtn, inactiveBtn) {
    if (activeBtn) activeBtn.classList.add("active");
    if (inactiveBtn) inactiveBtn.classList.remove("active");
  },

  heartbeat: function () {
    this.isDeviceOnline = true;
    this.updateDeviceStatus(true);
    if (this.deviceWatchdog) clearTimeout(this.deviceWatchdog);

    this.deviceWatchdog = setTimeout(() => {
      this.isDeviceOnline = false;
      this.updateDeviceStatus(false);
    }, 6000);
  },

  updateBrokerStatus: function (isOnline) {
    const dot = document.getElementById("broker-dot");
    const pill = document.getElementById("broker-pill");
    if (dot && pill) {
      dot.style.backgroundColor = isOnline ? "#10b981" : "#ef4444";
      pill.style.borderColor = isOnline
        ? "rgba(16, 185, 129, 0.3)"
        : "rgba(239, 68, 68, 0.3)";
      pill.style.background = isOnline
        ? "rgba(16, 185, 129, 0.05)"
        : "rgba(239, 68, 68, 0.05)";
    }
  },

  updateDeviceStatus: function (isOnline) {
    const dot = document.getElementById("device-dot");
    const pill = document.getElementById("device-pill");
    if (dot && pill) {
      dot.style.backgroundColor = isOnline ? "#10b981" : "#cbd5e1";
      pill.style.borderColor = isOnline ? "rgba(16, 185, 129, 0.3)" : "#e2e8f0";
      dot.style.boxShadow = isOnline
        ? "0 0 0 2px rgba(16, 185, 129, 0.2)"
        : "none";
    }
  },

  send: function (cmd) {
    if (!this.client || !this.client.isConnected()) return;
    const message = new Paho.MQTT.Message(cmd);
    message.destinationName = this.config.topicCmd;
    this.client.send(message);
  },

  setMode: function (mode) {
    if (!AppState.isMqttConnected) {
      Utils.showToast("Sem conexão ao Broker MQTT!", "error");
      return;
    }

    if (!this.isDeviceOnline) {
      Utils.showToast(
        "Dispositivo OFFLINE. Aguarde sincronização...",
        "warning"
      );
      return;
    }

    this.send(mode);

    const optimisticState = mode === "M" ? 2 : 1;
    this.currentMode = optimisticState;
    this.updateMachineState(optimisticState);
  },

  move: function (dir) {
    if (!AppState.isMqttConnected) return;

    if (!this.isDeviceOnline) {
      Utils.showToast("Dispositivo OFFLINE.", "warning");
      return;
    }

    if (this.currentMode === 2) {
      this.send(dir);
    }
  },

  setText: function (id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  },
};

const UIModule = {
  setupArchitectureSwitch: function () {
    window.switchArchitecture = function (mode) {
      const viewWifi = document.getElementById("arch-view-wifi");
      const viewBt = document.getElementById("arch-view-bt");
      const btnWifi = document.getElementById("tab-wifi");
      const btnBt = document.getElementById("tab-bt");

      if (mode === "wifi") {
        viewWifi.style.display = "flex";
        viewBt.style.display = "none";
        btnWifi.classList.add("active");
        btnBt.classList.remove("active");
        viewWifi.classList.remove("fade-in");
        void viewWifi.offsetWidth;
        viewWifi.classList.add("fade-in");
      } else {
        viewWifi.style.display = "none";
        viewBt.style.display = "flex";
        btnBt.classList.add("active");
        btnWifi.classList.remove("active");
        viewBt.classList.remove("fade-in");
        void viewBt.offsetWidth;
        viewBt.classList.add("fade-in");
      }
    };
  },

  initDatePickers: function () {
    const commonConfig = {
      locale: "pt",
      disableMobile: "true",
      altInput: true,
      altFormat: "d/m/Y",
      dateFormat: "Y-m-d",
      enableTime: false,
    };

    flatpickr("#chart-start", commonConfig);
    flatpickr("#chart-end", commonConfig);

    flatpickr("#hist-start", commonConfig);
    flatpickr("#hist-end", commonConfig);
  },

  setupGeneralUI: function () {
    document.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const codeBlock = document.getElementById(targetId);
        if (codeBlock) {
          navigator.clipboard.writeText(codeBlock.innerText);
          const originalHtml = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
          setTimeout(() => (btn.innerHTML = originalHtml), 2000);
        }
      });
    });

    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        const targetId = this.getAttribute("href");
        if (targetId === "#") window.scrollTo({ top: 0, behavior: "smooth" });
        else
          document
            .querySelector(targetId)
            ?.scrollIntoView({ behavior: "smooth" });
      });
    });

    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.style.animationPlayState = "running";
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".fade-in").forEach((s) => {
      s.style.animationPlayState = "paused";
      obs.observe(s);
    });

    const toggle = document.querySelector(".mobile-toggle");
    const navLinks = document.querySelector(".nav-links");
    if (toggle && navLinks) {
      toggle.addEventListener("click", () => {
        navLinks.classList.toggle("active");
        toggle.querySelector("i").className = navLinks.classList.contains(
          "active"
        )
          ? "fas fa-times"
          : "fas fa-bars";
      });
      navLinks.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          navLinks.classList.remove("active");
          toggle.querySelector("i").className = "fas fa-bars";
        });
      });
    }
  },

  initPCBViewer: function () {
    const viewer = document.querySelector("#pcb-viewer");
    if (!viewer) return;
    document.getElementById("btn-view-top")?.addEventListener("click", () => {
      viewer.cameraOrbit = "0deg 90deg 105%";
      viewer.autoRotate = false;
    });
    document.getElementById("btn-view-iso")?.addEventListener("click", () => {
      viewer.cameraOrbit = "45deg 55deg 105%";
      viewer.autoRotate = true;
    });
  },

  openTechTab: function (evt, tabName) {
    window.openTechTab = function (evt, tabName) {
      if (!evt) {
        const firstBtn = document.querySelector(".console-tab");
        if (firstBtn) firstBtn.click();
        return;
      }

      const contents = document.getElementsByClassName("console-content");
      for (let i = 0; i < contents.length; i++)
        contents[i].classList.remove("active");

      const tabs = document.getElementsByClassName("console-tab");
      for (let i = 0; i < tabs.length; i++) tabs[i].classList.remove("active");

      const target = document.getElementById(tabName);
      const btn = evt.currentTarget;

      if (target && btn) {
        target.classList.add("active");
        btn.classList.add("active");

        if (tabName === "tab-irq" && window.mermaid) {
          const lazyGraph = target.querySelector(".mermaid-lazy");
          if (lazyGraph) {
            lazyGraph.classList.remove("mermaid-lazy");
            lazyGraph.classList.add("mermaid");
            setTimeout(() => window.mermaid.run({ nodes: [lazyGraph] }), 50);
          }
        }
      }
    };
  },

  setupRegisterInteractions: function () {
    const bitBoxes = document.querySelectorAll(".bit-box");
    bitBoxes.forEach((box) => {
      box.addEventListener("mouseenter", (e) => {
        const desc = e.target.getAttribute("data-desc");
        const parent = e.target.closest(".register-map");
        const panel = parent.querySelector(".bit-desc-panel");
        if (panel && desc) {
          panel.innerText = desc;
          panel.style.background = "#0f172a";
        }
      });
      box.addEventListener("mouseleave", (e) => {
        const parent = e.target.closest(".register-map");
        const panel = parent.querySelector(".bit-desc-panel");
        if (panel) {
          panel.innerText = "Passe o rato num bit...";
          panel.style.background = "#1e293b";
        }
      });
    });
  },

  setupDiagramModals: function () {
    const modal = document.getElementById("diagram-modal");
    const modalBody = document.getElementById("modal-body-content");
    const modalContent = modal?.querySelector(".modal-content");
    const titleEl = document.getElementById("modal-title");
    const closeBtn = modal?.querySelector(".modal-close-btn");

    if (!modal || !modalBody) return;

    let state = {
      scale: 1,
      panning: false,
      pointX: 0,
      pointY: 0,
      startX: 0,
      startY: 0,
      isMediaMode: false,
    };
    let ticking = false;

    const updateVisuals = () => {
      const target = modalBody.firstElementChild;
      if (target) {
        target.style.transform = `translate3d(${state.pointX}px, ${state.pointY}px, 0) scale(${state.scale})`;
      }
      ticking = false;
    };

    const requestUpdate = () => {
      if (!ticking) {
        requestAnimationFrame(updateVisuals);
        ticking = true;
      }
    };

    const manualZoom = (delta) => {
      let newScale = state.scale + delta;

      if (state.isMediaMode) {
        if (newScale < 1) newScale = 1;
        if (newScale > 3.0) newScale = 3.0;
      } else {
        if (newScale < 0.4) newScale = 0.4;
        if (newScale > 5.0) newScale = 5.0;
      }

      state.scale = newScale;

      if (state.isMediaMode && state.scale === 1) {
        state.pointX = 0;
        state.pointY = 0;
      }

      requestUpdate();
    };

    const resetZoom = () => {
      state = {
        scale: 1,
        panning: false,
        pointX: 0,
        pointY: 0,
        startX: 0,
        startY: 0,
        isMediaMode: state.isMediaMode,
      };
      requestUpdate();
    };

    const ensureZoomControls = () => {
      if (modal.querySelector(".zoom-controls")) return;
      const header = modal.querySelector(".modal-header-custom");
      if (header) {
        const div = document.createElement("div");
        div.className = "zoom-controls";
        div.innerHTML = `
                <button class="zoom-btn" id="btn-zoom-out" title="Diminuir"><i class="fas fa-minus"></i></button>
                <button class="zoom-btn" id="btn-zoom-reset" title="Enquadrar"><i class="fas fa-compress"></i></button>
                <button class="zoom-btn" id="btn-zoom-in" title="Aumentar"><i class="fas fa-plus"></i></button>
            `;
        header.insertBefore(div, header.lastElementChild);

        document.getElementById("btn-zoom-in").onclick = () => manualZoom(0.2);
        document.getElementById("btn-zoom-out").onclick = () =>
          manualZoom(-0.2);
        document.getElementById("btn-zoom-reset").onclick = () => resetZoom();
      }
    };

    const closeModal = () => {
      modal.classList.remove("active");

      if (modalContent) modalContent.classList.remove("media-sized");

      document.body.style.overflow = "";
      setTimeout(() => {
        modalBody.innerHTML = "";
        modalBody.className = "modal-body";
        resetZoom();
      }, 300);
    };

    const openSchematic = (imgId, title, isDark = false) => {
      const sourceImg = document.getElementById(imgId);
      if (!sourceImg) return;

      state.isMediaMode = false;
      ensureZoomControls();

      if (titleEl) titleEl.innerText = title;

      modalBody.innerHTML = "";
      modalBody.classList.remove("media-mode");
      modalBody.classList.remove("schematic-dark");

      if (modalContent) modalContent.classList.remove("media-sized");

      if (isDark) {
        modalBody.classList.add("schematic-dark");
      }

      const imgClone = sourceImg.cloneNode(true);
      imgClone.classList.add("crisp-rendering");
      imgClone.removeAttribute("id");

      modalBody.appendChild(imgClone);
      modal.classList.add("active");
      document.body.style.overflow = "hidden";

      resetZoom();
    };

    const openMedia = (imgId, title) => {
      const sourceImg = document.getElementById(imgId);
      if (!sourceImg) return;

      state.isMediaMode = true;
      ensureZoomControls();

      if (titleEl) titleEl.innerText = title;
      modalBody.innerHTML = "";
      modalBody.classList.add("media-mode");

      if (modalContent) modalContent.classList.add("media-sized");

      const imgClone = sourceImg.cloneNode(true);
      imgClone.removeAttribute("id");
      imgClone.className = "";

      modalBody.appendChild(imgClone);
      modal.classList.add("active");
      document.body.style.overflow = "hidden";
      resetZoom();
    };

    document
      .getElementById("btn-expand-schematic-1")
      ?.addEventListener("click", () => {
        openSchematic(
          "schematic-img-1",
          "Esquemático Eletrónico (Circuito)",
          false
        );
      });

    document
      .getElementById("btn-expand-schematic-2")
      ?.addEventListener("click", () => {
        openSchematic("schematic-img-2", "Esquemático da PCB (Layout)", true);
      });

    document.getElementById("btn-exp-f1")?.addEventListener("click", () => {
      openMedia("foto1-img", "Seguidor - Vista Frontal");
    });
    document.getElementById("btn-exp-f2")?.addEventListener("click", () => {
      openMedia("foto2-img", "Seguidor - Vista Traseira");
    });
    document.getElementById("btn-exp-f3")?.addEventListener("click", () => {
      openMedia("foto3-img", "Breadboard e Ligações");
    });
    document.getElementById("btn-exp-g1")?.addEventListener("click", () => {
      openMedia("gif1-img", "Animação: Movimento do Seguidor");
    });

    modalBody.addEventListener(
      "wheel",
      (e) => {
        if (!modal.classList.contains("active")) return;
        e.preventDefault();
        const direction = e.deltaY > 0 ? -0.1 : 0.1;
        manualZoom(direction);
      },
      { passive: false }
    );

    modalBody.addEventListener("mousedown", (e) => {
      if (!modal.classList.contains("active")) return;
      if (state.isMediaMode && state.scale <= 1) return;

      e.preventDefault();
      state.panning = true;
      state.startX = e.clientX - state.pointX;
      state.startY = e.clientY - state.pointY;
      modalBody.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
      if (!state.panning) return;
      state.pointX = e.clientX - state.startX;
      state.pointY = e.clientY - state.startY;
      requestUpdate();
    });

    window.addEventListener("mouseup", () => {
      state.panning = false;
      modalBody.style.cursor = "";
    });

    if (closeBtn) closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("active"))
        closeModal();
    });
  },
};

const CodeModule = {
  ProjectFiles: {
    "main.c": { lang: "c", url: "main.c", folder: "firmware" },
    "esp8266.ino": {
      lang: "cpp",
      url: "esp8266/esp8266.ino",
      folder: "esp8266",
    },
    "app_ponte.py": {
      lang: "python",
      url: "app_ponte.py",
      folder: "iot-gateway",
    },
  },
  currentFile: "main.c",

  init: function () {
    this.setupInteractions();
    this.loadFileToEditor(this.currentFile);
  },

  setupInteractions: function () {
    document.querySelectorAll(".file-item, .tab").forEach((item) => {
      item.addEventListener("click", () => {
        const fname = item.getAttribute("data-file");
        document
          .querySelectorAll(".file-item, .tab")
          .forEach((el) =>
            el.classList.toggle(
              "active",
              el.getAttribute("data-file") === fname
            )
          );
        this.loadFileToEditor(fname);
      });
    });
    document.getElementById("btn-copy-curr")?.addEventListener("click", () => {
      navigator.clipboard.writeText(
        document.getElementById("vscode-code-content").innerText
      );
    });
  },

  loadFileToEditor: async function (fileName) {
    const codeBlock = document.getElementById("vscode-code-content");
    this.currentFile = fileName;
    const fileData = this.ProjectFiles[fileName];

    const btnDl = document.getElementById("btn-download-exe");
    if (btnDl)
      btnDl.style.display = fileName === "app_ponte.py" ? "flex" : "none";

    codeBlock.style.opacity = "0.5";
    let content = "";
    try {
      const req = await fetch(fileData.url);
      content = req.ok
        ? await req.text()
        : "// Erro leitura: Ficheiro não encontrado";
    } catch (e) {
      content = "// Erro conexão: Não foi possível carregar o código.";
    }

    codeBlock.removeAttribute("data-highlighted");
    codeBlock.className = `language-${fileData.lang}`;
    codeBlock.textContent = content;

    document.getElementById("status-lang").innerText =
      fileData.lang === "c" ? "C" : fileData.lang === "cpp" ? "C++" : "Python";
    document.getElementById("current-filename").innerText = fileName;
    document.getElementById("current-folder").innerText = fileData.folder;

    setTimeout(() => {
      if (window.hljs) hljs.highlightElement(codeBlock);
      codeBlock.style.opacity = "1";
    }, 0);
  },
};

const AuthModule = {
  ADMIN_HASH: "Y2hhbmdlLW1l" // base64("change-me"): demo-only client-side lock,

  isAuthenticated: false,

  init: function () {
    const protectedSelectors = [".control-panel-card", ".data-log-section"];

    this.lockUI(protectedSelectors);

    document.getElementById("auth-pass")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.login();
    });
  },

  lockUI: function (selectors) {
    selectors.forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) {
        el.classList.add("locked-area");
        if (el.querySelector(".lock-overlay")) return;

        const overlay = document.createElement("div");
        overlay.className = "lock-overlay";
        overlay.onclick = (e) => {
          e.stopPropagation();
          this.openModal();
        };
        overlay.innerHTML = `
          <div class="lock-icon-btn"><i class="fas fa-lock"></i></div>
          <span class="lock-text">Área Protegida</span>
        `;
        el.appendChild(overlay);
      }
    });
  },

  unlockUI: function () {
    document.querySelectorAll(".locked-area").forEach((el) => {
      el.classList.remove("locked-area");
      const overlay = el.querySelector(".lock-overlay");
      if (overlay) {
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 300);
      }
    });

    this.isAuthenticated = true;
    this.closeModal();
    Utils.showToast("Acesso de Administrador Concedido.", "success");
  },

  openModal: function () {
    if (this.isAuthenticated) return;
    const modal = document.getElementById("auth-modal");
    if (modal) {
      modal.classList.add("active");
      setTimeout(() => document.getElementById("auth-pass").focus(), 100);
    }
  },

  closeModal: function () {
    document.getElementById("auth-modal")?.classList.remove("active");
    document.getElementById("auth-error")?.classList.add("hidden");
    document.getElementById("auth-pass").value = "";
  },

  login: async function () {
    const input = document.getElementById("auth-pass").value;
    const errorMsg = document.getElementById("auth-error");

    const hash = this.simpleEncode(input);

    if (hash === this.ADMIN_HASH) {
      this.unlockUI();
    } else {
      errorMsg.classList.remove("hidden");
      const inputEl = document.getElementById("auth-pass");
      inputEl.style.borderColor = "var(--danger)";
      setTimeout(() => (inputEl.style.borderColor = ""), 500);
    }
  },

  simpleEncode: function (message) {
    return btoa(message);
  },
};

const TechDeckModule = {
  init: function () {
    const tabs = document.querySelectorAll(".deck-tab");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".deck-tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".deck-content")
          .forEach((c) => c.classList.remove("active"));

        tab.classList.add("active");

        const targetId = tab.getAttribute("data-target");
        document.getElementById(targetId).classList.add("active");
      });
    });
  },
};

UIModule.switchDiagram = function (tabId, btnElement) {
  document
    .querySelectorAll(".diag-tab-btn")
    .forEach((b) => b.classList.remove("active"));
  btnElement.classList.add("active");

  document
    .querySelectorAll(".diagram-pane")
    .forEach((p) => p.classList.remove("active"));

  const target = document.getElementById(tabId);
  if (target) {
    target.classList.add("active");

    requestAnimationFrame(() => {
      DiagramZoom.autoFit();
    });
  }
};

const DiagramZoom = {
  state: {
    scale: 1,
    pointX: 0,
    pointY: 0,
    panning: false,
    startX: 0,
    startY: 0,
  },
  viewport: null,

  init: function () {
    this.viewport = document.getElementById("diagram-viewport");
    if (!this.viewport) return;

    this.viewport.addEventListener("mousedown", (e) => this.startPan(e));
    window.addEventListener("mousemove", (e) => this.pan(e));
    window.addEventListener("mouseup", () => this.endPan());

    this.viewport.addEventListener(
      "wheel",
      (e) => {
        if (e.target.closest("#diagram-viewport")) {
          e.preventDefault();
          const direction = e.deltaY > 0 ? -0.1 : 0.1;
          this.zoom(direction);
        }
      },
      { passive: false }
    );
  },

  getActivePane: function () {
    return document.querySelector(".diagram-pane.active");
  },

  updateTransform: function () {
    const pane = this.getActivePane();
    if (pane) {
      pane.style.transform = `translate(${this.state.pointX}px, ${this.state.pointY}px) scale(${this.state.scale})`;
    }
  },

  zoom: function (delta) {
    const pane = this.getActivePane();
    if (!pane) return;

    const oldScale = this.state.scale;
    let newScale = oldScale + delta;

    newScale = Math.min(Math.max(newScale, 0.1), 5.0);
    if (newScale === oldScale) return;

    const viewRect = this.viewport.getBoundingClientRect();
    const centerX = viewRect.width / 2;
    const centerY = viewRect.height / 2;

    const graphPointX = (centerX - this.state.pointX) / oldScale;
    const graphPointY = (centerY - this.state.pointY) / oldScale;

    const newPointX = centerX - graphPointX * newScale;
    const newPointY = centerY - graphPointY * newScale;

    this.state.scale = newScale;
    this.state.pointX = newPointX;
    this.state.pointY = newPointY;

    this.updateTransform();
  },

  autoFit: function () {
    const pane = this.getActivePane();
    if (!pane) return;
    const svg = pane.querySelector("svg");
    if (!svg) return;

    let graphW = 0,
      graphH = 0;
    const viewBox = svg.getAttribute("viewBox");

    if (viewBox) {
      const parts = viewBox.split(/\s+|,/).map(parseFloat);
      if (parts.length === 4) {
        graphW = parts[2];
        graphH = parts[3];
      }
    }

    if (!graphW || !graphH) {
      try {
        const bbox = svg.getBBox();
        graphW = bbox.width;
        graphH = bbox.height;
      } catch (e) {}
    }

    if (!graphW || !graphH) {
      setTimeout(() => this.autoFit(), 50);
      return;
    }

    const viewW = this.viewport.clientWidth || 800;
    const viewH = this.viewport.clientHeight || 600;

    const padding = 0.9;
    const scaleX = viewW / graphW;
    const scaleY = viewH / graphH;

    let finalScale = Math.min(scaleX, scaleY) * padding;

    finalScale = Math.min(Math.max(finalScale, 0.2), 1.5);

    const posX = (viewW - graphW * finalScale) / 2;
    const posY = (viewH - graphH * finalScale) / 2;

    this.state = {
      scale: finalScale,
      panning: false,
      pointX: posX,
      pointY: posY,
      startX: 0,
      startY: 0,
    };

    this.updateTransform();
  },

  reset: function () {
    this.autoFit();
  },

  startPan: function (e) {
    if (e.target.closest(".diagram-controls")) return;
    e.preventDefault();
    this.state.panning = true;
    this.state.startX = e.clientX - this.state.pointX;
    this.state.startY = e.clientY - this.state.pointY;
    this.viewport.style.cursor = "grabbing";
  },

  pan: function (e) {
    if (!this.state.panning) return;
    e.preventDefault();
    this.state.pointX = e.clientX - this.state.startX;
    this.state.pointY = e.clientY - this.state.startY;
    this.updateTransform();
  },

  endPan: function () {
    this.state.panning = false;
    this.viewport.style.cursor = "grab";
  },
};

document.addEventListener("DOMContentLoaded", () => {
  DiagramZoom.init();
});

const FluxosModule = {
  init: async function () {
    const navContainer = document.getElementById("dynamic-nav");
    const diagContainer = document.getElementById("dynamic-diagrams-container");

    if (!navContainer || !diagContainer) return;

    try {
      const response = await fetch("fluxos.txt");
      if (!response.ok) throw new Error("Não foi possível carregar fluxos.txt");

      const text = await response.text();
      const regexHeader = /^(\d+\s-\s.+:)/gm;

      let match;
      const sections = [];
      let lastIndex = 0;
      let lastHeader = null;

      while ((match = regexHeader.exec(text)) !== null) {
        if (lastHeader) {
          sections.push({
            title: lastHeader.trim().replace(":", ""),
            code: text.substring(lastIndex, match.index).trim(),
          });
        }
        lastHeader = match[0];
        lastIndex = regexHeader.lastIndex;
      }

      if (lastHeader) {
        sections.push({
          title: lastHeader.trim().replace(":", ""),
          code: text.substring(lastIndex).trim(),
        });
      }

      this.renderUI(sections, navContainer, diagContainer);
    } catch (error) {
      console.error("Erro Fluxos:", error);
      navContainer.innerHTML = `<span style="padding:20px; color:var(--danger)">Erro: ${error.message}</span>`;
    }
  },

  renderUI: function (sections, navEl, diagEl) {
    navEl.innerHTML = "";
    diagEl.innerHTML = "";

    sections.forEach((section, index) => {
      const diagId = `dyn-diag-${index}`;
      const isActive = index === 0 ? "active" : "";

      const btnLabel = section.title.replace(/^\d+\s-\s/, "");

      const btn = document.createElement("button");
      btn.className = `diag-tab-btn ${isActive}`;
      btn.innerHTML = `<i class="fas fa-project-diagram"></i> ${btnLabel}`;

      btn.onclick = function () {
        UIModule.switchDiagram(diagId, this);
      };

      navEl.appendChild(btn);

      const pane = document.createElement("div");
      pane.id = diagId;
      pane.className = `diagram-pane ${isActive}`;

      const pre = document.createElement("pre");
      pre.className = "mermaid";
      pre.textContent = section.code;

      pane.appendChild(pre);
      diagEl.appendChild(pane);
    });

    if (window.mermaid) {
      window.mermaid
        .run({
          nodes: document.querySelectorAll(".diagram-pane .mermaid"),
        })
        .then(() => {
          setTimeout(() => {
            DiagramZoom.autoFit();
          }, 100);
        });
    }
  },
};

function openDocTab(tabId) {
  const panels = document.querySelectorAll(".doc-panel");
  panels.forEach((panel) => panel.classList.remove("active"));

  const btns = document.querySelectorAll(".doc-nav-btn");
  btns.forEach((btn) => btn.classList.remove("active"));

  const target = document.getElementById(tabId);
  if (target) {
    target.classList.add("active");

    if (window.MathJax) {
      requestAnimationFrame(() => {
        window.MathJax.typesetPromise([target]);
      });
    }
  }

  btns.forEach((btn) => {
    if (
      btn.getAttribute("onclick") &&
      btn.getAttribute("onclick").includes(tabId)
    ) {
      btn.classList.add("active");
    }
  });
}
