/**
 * Levoit ESPHome Card
 * Custom Home Assistant Lovelace card designed for tuct/levoit ESPHome purifiers.
 * Zero-dependency Web Component with visual editor, entity auto-discovery,
 * and Dracula / adaptive Home Assistant themes.
 *
 * https://github.com/wakuwakumiwaku/levoit-esphome-card
 * License: MIT
 */

const CARD_VERSION = "1.0.0";

const AQI_LEVELS = [
  { max: 1, label: "Very Good", color: "#50fa7b" },
  { max: 2, label: "Good",      color: "#8be9fd" },
  { max: 3, label: "Moderate",  color: "#f1fa8c" },
  { max: 4, label: "Poor",      color: "#ffb86c" },
  { max: 99, label: "Very Poor", color: "#ff5555" },
];

function aqiFromPm25(pm) {
  if (pm === null || Number.isNaN(pm)) return null;
  if (pm <= 12) return 1;
  if (pm <= 35) return 2;
  if (pm <= 55) return 3;
  if (pm <= 150) return 4;
  return 5;
}

function getAqiInfo(aqiVal, pm25Val) {
  const level = (aqiVal !== null && !Number.isNaN(aqiVal))
    ? Math.max(1, Math.min(5, Math.round(aqiVal)))
    : aqiFromPm25(pm25Val);
  if (!level) return { label: "No Sensor", color: "#6272a4" };
  return AQI_LEVELS.find((l) => level <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class LevoitEsphomeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._rendered = false;
  }

  static getConfigElement() {
    return document.createElement("levoit-esphome-card-editor");
  }

  static getStubConfig(hass) {
    const fans = hass
      ? Object.keys(hass.states).filter((id) => id.startsWith("fan."))
      : [];
    const levoitFan = fans.find((id) => /levoit|core|vital|everest/i.test(id)) || fans[0] || "fan.levoit_core300s_fan";
    return {
      entity: levoitFan,
      theme: "dracula",
      show_cadr: true,
      show_filter: true,
      show_timer: true,
      compact: false,
    };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Please specify a fan `entity` (e.g. fan.core300spaup_fan).");
    }
    this._config = {
      theme: "dracula",
      show_cadr: true,
      show_filter: true,
      show_timer: true,
      compact: false,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config.compact ? 3 : 5;
  }

  /**
   * Auto-discover sibling tuct/levoit entities from the fan entity prefix.
   * Example: fan.core300spaup_fan -> prefix "core300spaup"
   */
  _resolveEntities() {
    const states = this._hass?.states || {};
    const fanId = this._config.entity;
    const base = fanId.replace(/^fan\./, "").replace(/_fan$/, "");

    const findEntity = (overrideKey, domain, patterns) => {
      if (this._config[overrideKey]) return this._config[overrideKey];
      const prefix = `${domain}.${base}_`;
      const candidates = Object.keys(states).filter((id) => id.startsWith(prefix));
      for (const rx of patterns) {
        const match = candidates.find((id) => rx.test(id.slice(prefix.length)));
        if (match) return match;
      }
      return null;
    };

    return {
      fan: fanId,
      pm25: findEntity("pm25_entity", "sensor", [/pm_?2[_.]?5/i, /aq.*pm/i]),
      aqi: findEntity("aqi_entity", "sensor", [/^aqi$/i, /air_quality/i]),
      cadr: findEntity("cadr_entity", "sensor", [/cadr/i]),
      filter: findEntity("filter_entity", "sensor", [/filter.*life/i, /^filter$/i, /filter_percent/i]),
      filterLow: findEntity("filter_low_entity", "binary_sensor", [/filter_low/i]),
      display: findEntity("display_entity", "switch", [/^display$/i]),
      childLock: findEntity("child_lock_entity", "switch", [/child_lock/i]),
      operatingMode: findEntity("operating_mode_entity", "select", [/fan_operating_mode/i, /operating_mode/i]),
      autoMode: findEntity("auto_mode_entity", "select", [/^auto_mode$/i]),
      timer: findEntity("timer_entity", "number", [/^timer/i]),
      timerRemaining: findEntity("timer_remaining_entity", "text_sensor", [/timer_remaining/i]),
      error: findEntity("error_entity", "text_sensor", [/^error$/i]),
      model: findEntity("model_entity", "text_sensor", [/^model$/i]),
    };
  }

  _state(entityId) {
    if (!entityId || !this._hass?.states) return null;
    return this._hass.states[entityId] || null;
  }

  _num(entityId) {
    const st = this._state(entityId);
    if (!st || st.state === "unavailable" || st.state === "unknown" || st.state === "NA") {
      return null;
    }
    const n = Number(st.state);
    return Number.isNaN(n) ? null : n;
  }

  _callService(domain, service, data) {
    if (!this._hass) return;
    this._hass.callService(domain, service, data);
  }

  _styles() {
    const isDracula = this._config.theme !== "auto";
    return `
      :host {
        display: block;
        --lec-bg: ${isDracula ? "#282a36" : "var(--ha-card-background, var(--card-background-color, #1e1e2e))"};
        --lec-surface: ${isDracula ? "#343746" : "var(--secondary-background-color, rgba(127,127,127,0.12))"};
        --lec-surface-hover: ${isDracula ? "#44475a" : "var(--divider-color, rgba(127,127,127,0.22))"};
        --lec-border: ${isDracula ? "rgba(189, 147, 249, 0.22)" : "var(--ha-card-border-color, rgba(127,127,127,0.18))"};
        --lec-text: ${isDracula ? "#f8f8f2" : "var(--primary-text-color, #f8f8f2)"};
        --lec-muted: ${isDracula ? "#9ea7c8" : "var(--secondary-text-color, #9ea7c8)"};
        --lec-accent: ${isDracula ? "#bd93f9" : "var(--primary-color, #bd93f9)"};
        --lec-cyan: #8be9fd;
        --lec-green: #50fa7b;
        --lec-yellow: #f1fa8c;
        --lec-orange: #ffb86c;
        --lec-red: #ff5555;
        --lec-pink: #ff79c6;
        --lec-radius: 16px;
        font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      }

      ha-card, .card {
        background: var(--lec-bg);
        color: var(--lec-text);
        border: 1px solid var(--lec-border);
        border-radius: var(--lec-radius);
        padding: 16px;
        box-sizing: border-box;
        box-shadow: ${isDracula ? "0 8px 24px rgba(0, 0, 0, 0.35)" : "var(--ha-card-box-shadow, none)"};
        transition: border-color 0.2s ease;
      }

      .card.compact {
        padding: 12px 14px;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .title-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .fan-badge {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: var(--lec-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--lec-muted);
        transition: background 0.2s, color 0.2s;
      }

      .fan-badge.on {
        background: rgba(189, 147, 249, 0.18);
        color: var(--lec-accent);
      }

      .fan-badge svg {
        width: 22px;
        height: 22px;
      }

      .fan-badge.spin-slow svg { animation: spin 3.2s linear infinite; }
      .fan-badge.spin-med svg  { animation: spin 1.7s linear infinite; }
      .fan-badge.spin-fast svg { animation: spin 0.85s linear infinite; }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      .title-text {
        min-width: 0;
      }

      .name {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .subtitle {
        font-size: 12px;
        color: var(--lec-muted);
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 2px;
      }

      .aqi-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
      }

      .aqi-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
      }

      .power-btn {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid var(--lec-border);
        background: var(--lec-surface);
        color: var(--lec-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.18s ease;
      }

      .power-btn:hover {
        background: var(--lec-surface-hover);
        color: var(--lec-text);
      }

      .power-btn.on {
        background: var(--lec-accent);
        border-color: var(--lec-accent);
        color: #282a36;
        box-shadow: 0 0 14px rgba(189, 147, 249, 0.45);
      }

      .metrics {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 16px;
        align-items: center;
        background: var(--lec-surface);
        border-radius: 14px;
        padding: 12px 14px;
        margin-bottom: 14px;
      }

      .gauge {
        position: relative;
        width: 82px;
        height: 82px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .gauge svg {
        width: 82px;
        height: 82px;
        transform: rotate(-90deg);
      }

      .gauge-center {
        position: absolute;
        text-align: center;
        line-height: 1.1;
      }

      .gauge-val {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }

      .gauge-unit {
        font-size: 10px;
        color: var(--lec-muted);
        margin-top: 2px;
      }

      .stats {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }

      .stat-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 12px;
        gap: 8px;
      }

      .stat-label {
        color: var(--lec-muted);
      }

      .stat-val {
        font-weight: 600;
        color: var(--lec-text);
      }

      .filter-bar {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.28);
        overflow: hidden;
        margin-top: 4px;
      }

      .filter-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 0.35s ease;
      }

      .error-banner {
        background: rgba(255, 85, 85, 0.16);
        border: 1px solid rgba(255, 85, 85, 0.45);
        color: var(--lec-red);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 12px;
      }

      .section-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: var(--lec-muted);
        margin: 0 0 6px 2px;
      }

      .segmented {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: 6px;
        margin-bottom: 12px;
      }

      .seg-btn {
        border: 1px solid transparent;
        background: var(--lec-surface);
        color: var(--lec-muted);
        border-radius: 10px;
        padding: 8px 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }

      .seg-btn:hover {
        background: var(--lec-surface-hover);
        color: var(--lec-text);
      }

      .seg-btn.active {
        background: rgba(189, 147, 249, 0.22);
        border-color: var(--lec-accent);
        color: var(--lec-text);
      }

      .seg-btn.cyan.active {
        background: rgba(139, 233, 253, 0.18);
        border-color: var(--lec-cyan);
        color: var(--lec-cyan);
      }

      .quick-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .chip-btn {
        flex: 1 1 0;
        min-width: 78px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid transparent;
        background: var(--lec-surface);
        color: var(--lec-muted);
        border-radius: 10px;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .chip-btn:hover {
        background: var(--lec-surface-hover);
        color: var(--lec-text);
      }

      .chip-btn.active {
        background: rgba(255, 121, 198, 0.16);
        border-color: var(--lec-pink);
        color: var(--lec-pink);
      }

      .chip-btn.green.active {
        background: rgba(80, 250, 123, 0.16);
        border-color: var(--lec-green);
        color: var(--lec-green);
      }

      .chip-btn svg {
        width: 15px;
        height: 15px;
        flex-shrink: 0;
      }
    `;
  }

  _render() {
    if (!this.shadowRoot || !this._config.entity) return;

    const e = this._resolveEntities();
    const fanSt = this._state(e.fan);

    if (!fanSt) {
      this.shadowRoot.innerHTML = `
        <style>${this._styles()}</style>
        <div class="card">
          <div class="error-banner">Entity not found: ${escapeHtml(this._config.entity)}</div>
        </div>`;
      return;
    }

    const isOn = fanSt.state === "on";
    const pct = Number(fanSt.attributes?.percentage ?? 0);
    const step = Number(fanSt.attributes?.percentage_step ?? 33.3333);
    const speedCount = Math.max(1, Math.min(5, Math.round(100 / step)));
    const currentSpeed = isOn && pct > 0 ? Math.max(1, Math.round(pct / step)) : 0;

    const name = this._config.name || fanSt.attributes?.friendly_name?.replace(/\s+Fan$/i, "") || "Levoit Purifier";
    const pm25 = this._num(e.pm25);
    const aqi = this._num(e.aqi);
    const cadr = this._num(e.cadr);
    const filterPct = this._num(e.filter);
    const filterLow = this._state(e.filterLow)?.state === "on";
    const displayOn = this._state(e.display)?.state === "on";
    const childLockOn = this._state(e.childLock)?.state === "on";
    const opModeSt = this._state(e.operatingMode);
    const autoModeSt = this._state(e.autoMode);
    const timerNum = this._num(e.timer);
    const timerRem = this._state(e.timerRemaining)?.state;
    const errorTxt = this._state(e.error)?.state;
    const hasError = errorTxt && errorTxt.toLowerCase() !== "ok" && errorTxt !== "unknown" && errorTxt !== "unavailable";

    const aqiInfo = getAqiInfo(aqi, pm25);
    const spinClass = !isOn ? "" : currentSpeed >= 3 ? "spin-fast" : currentSpeed === 2 ? "spin-med" : "spin-slow";

    // SVG gauge ring (circumference for r=34 is ~213.6)
    const radius = 34;
    const circ = 2 * Math.PI * radius;
    const pmFraction = pm25 !== null ? Math.min(1, Math.max(0.08, pm25 / 100)) : 0;
    const dashOffset = circ * (1 - pmFraction);

    const filterColor = filterLow || (filterPct !== null && filterPct < 10)
      ? "#ff5555"
      : filterPct !== null && filterPct < 25
      ? "#ffb86c"
      : "#50fa7b";

    const opOptions = opModeSt?.attributes?.options || (fanSt.attributes?.preset_modes || []);
    const activeOp = opModeSt?.state || fanSt.attributes?.preset_mode || "";

    const autoOptions = autoModeSt?.attributes?.options || [];
    const activeAuto = autoModeSt?.state || "";

    const speedButtons = Array.from({ length: speedCount }, (_, i) => {
      const lvl = i + 1;
      const lvlPct = Math.min(100, Math.round(lvl * step));
      const active = isOn && currentSpeed === lvl && (!activeOp || activeOp === "Manual");
      return `<button class="seg-btn ${active ? "active" : ""}" data-action="speed" data-pct="${lvlPct}">Speed ${lvl}</button>`;
    }).join("");

    const modeButtons = opOptions.map((opt) => {
      const active = isOn && activeOp === opt;
      return `<button class="seg-btn cyan ${active ? "active" : ""}" data-action="mode" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
    }).join("");

    const autoButtons = (isOn && activeOp === "Auto" && autoOptions.length > 0)
      ? `<div class="section-label">Auto Profile</div>
         <div class="segmented">
           ${autoOptions.map((opt) => `<button class="seg-btn ${activeAuto === opt ? "active" : ""}" data-action="automode" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join("")}
         </div>`
      : "";

    const statusText = isOn
      ? (activeOp && activeOp !== "Manual" ? activeOp : `Speed ${currentSpeed || 1}`)
      : "Standby";

    const timerLabel = (timerRem && timerRem !== "Off" && timerRem !== "unknown" && timerRem !== "unavailable")
      ? timerRem
      : (timerNum && timerNum > 0 ? `${timerNum}m` : "Timer");

    const showMetrics = pm25 !== null || (this._config.show_cadr && cadr !== null) || (this._config.show_filter && filterPct !== null);

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="card ${this._config.compact ? "compact" : ""}">
        <div class="header">
          <div class="title-wrap">
            <div class="fan-badge ${isOn ? "on" : ""} ${spinClass}">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z"/>
              </svg>
            </div>
            <div class="title-text">
              <div class="name">${escapeHtml(name)}</div>
              <div class="subtitle">
                <span>${escapeHtml(statusText)}</span>
                ${pm25 !== null || aqi !== null ? `
                  <span class="aqi-pill" style="color:${aqiInfo.color}">
                    <span class="aqi-dot" style="background:${aqiInfo.color}"></span>
                    ${escapeHtml(aqiInfo.label)}
                  </span>` : ""}
              </div>
            </div>
          </div>
          <button class="power-btn ${isOn ? "on" : ""}" data-action="power" title="Toggle Power">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13"/>
            </svg>
          </button>
        </div>

        ${hasError ? `<div class="error-banner">⚠ Purifier Error: ${escapeHtml(errorTxt)}</div>` : ""}

        ${showMetrics ? `
          <div class="metrics">
            ${pm25 !== null ? `
              <div class="gauge">
                <svg viewBox="0 0 82 82">
                  <circle cx="41" cy="41" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
                  <circle cx="41" cy="41" r="${radius}" fill="none" stroke="${aqiInfo.color}" stroke-width="6"
                    stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${dashOffset.toFixed(1)}"/>
                </svg>
                <div class="gauge-center">
                  <div class="gauge-val" style="color:${aqiInfo.color}">${Math.round(pm25)}</div>
                  <div class="gauge-unit">µg/m³</div>
                </div>
              </div>` : `<div></div>`}
            <div class="stats">
              ${this._config.show_cadr && cadr !== null ? `
                <div class="stat-row">
                  <span class="stat-label">Airflow (CADR)</span>
                  <span class="stat-val">${Math.round(cadr)} m³/h</span>
                </div>` : ""}
              ${aqi !== null ? `
                <div class="stat-row">
                  <span class="stat-label">AQI Index</span>
                  <span class="stat-val" style="color:${aqiInfo.color}">${Math.round(aqi)} / 4</span>
                </div>` : ""}
              ${this._config.show_filter && filterPct !== null ? `
                <div>
                  <div class="stat-row">
                    <span class="stat-label">${filterLow ? "⚠ Filter Low" : "Filter Life"}</span>
                    <span class="stat-val" style="color:${filterColor}">${Math.round(filterPct)}%</span>
                  </div>
                  <div class="filter-bar">
                    <div class="filter-fill" style="width:${Math.max(0, Math.min(100, filterPct))}%; background:${filterColor};"></div>
                  </div>
                </div>` : ""}
            </div>
          </div>` : ""}

        ${!this._config.compact ? `<div class="section-label">Fan Speed</div>` : ""}
        <div class="segmented">${speedButtons}</div>

        ${opOptions.length > 0 ? `
          ${!this._config.compact ? `<div class="section-label">Mode</div>` : ""}
          <div class="segmented">${modeButtons}</div>` : ""}

        ${autoButtons}

        <div class="quick-row">
          ${e.display ? `
            <button class="chip-btn green ${displayOn ? "active" : ""}" data-action="display">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z"/></svg>
              Display
            </button>` : ""}
          ${e.childLock ? `
            <button class="chip-btn ${childLockOn ? "active" : ""}" data-action="lock">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg>
              Lock
            </button>` : ""}
          ${this._config.show_timer && e.timer ? `
            <button class="chip-btn green ${timerNum > 0 ? "active" : ""}" data-action="timer" title="Click to add +60 min (cycles off after 4h)">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z"/></svg>
              ${escapeHtml(timerLabel)}
            </button>` : ""}
        </div>
      </div>
    `;

    this._bindEvents(e, { isOn, timerNum });
  }

  _bindEvents(e, state) {
    this.shadowRoot.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "power") {
          this._callService("fan", state.isOn ? "turn_off" : "turn_on", { entity_id: e.fan });
        } else if (action === "speed") {
          const pct = Number(btn.dataset.pct);
          this._callService("fan", "set_percentage", { entity_id: e.fan, percentage: pct });
        } else if (action === "mode") {
          const opt = btn.dataset.opt;
          if (e.operatingMode) {
            this._callService("select", "select_option", { entity_id: e.operatingMode, option: opt });
          } else {
            this._callService("fan", "set_preset_mode", { entity_id: e.fan, preset_mode: opt });
          }
        } else if (action === "automode" && e.autoMode) {
          this._callService("select", "select_option", { entity_id: e.autoMode, option: btn.dataset.opt });
        } else if (action === "display" && e.display) {
          this._callService("switch", "toggle", { entity_id: e.display });
        } else if (action === "lock" && e.childLock) {
          this._callService("switch", "toggle", { entity_id: e.childLock });
        } else if (action === "timer" && e.timer) {
          const steps = [0, 60, 120, 240];
          const cur = state.timerNum || 0;
          const next = steps.find((s) => s > cur) ?? 0;
          this._callService("number", "set_value", { entity_id: e.timer, value: next });
        }
      });
    });
  }
}

class LevoitEsphomeCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _emit(newConfig) {
    this._config = newConfig;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _render() {
    if (!this.shadowRoot) return;
    const fans = this._hass
      ? Object.keys(this._hass.states).filter((id) => id.startsWith("fan.")).sort()
      : [];

    this.shadowRoot.innerHTML = `
      <style>
        .editor { display: flex; flex-direction: column; gap: 12px; padding: 8px 0; font-family: inherit; }
        label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; }
        input, select { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color, #44475a); background: var(--card-background-color, #282a36); color: var(--primary-text-color, #f8f8f2); font-size: 13px; }
        .row { display: flex; gap: 14px; flex-wrap: wrap; }
        .check { flex-direction: row; align-items: center; gap: 6px; font-weight: 400; }
      </style>
      <div class="editor">
        <label>
          Fan Entity (auto-discovers all Levoit sensors & controls)
          <select id="entity">
            ${fans.length
              ? fans.map((id) => `<option value="${escapeHtml(id)}" ${this._config.entity === id ? "selected" : ""}>${escapeHtml(id)}</option>`).join("")
              : `<option value="${escapeHtml(this._config.entity || "")}">${escapeHtml(this._config.entity || "fan.levoit_core300s_fan")}</option>`}
          </select>
        </label>
        <label>
          Custom Name (optional)
          <input id="name" type="text" placeholder="Auto from entity" value="${escapeHtml(this._config.name || "")}" />
        </label>
        <label>
          Theme
          <select id="theme">
            <option value="dracula" ${this._config.theme !== "auto" ? "selected" : ""}>Dracula (Dark)</option>
            <option value="auto" ${this._config.theme === "auto" ? "selected" : ""}>Auto (Match Home Assistant)</option>
          </select>
        </label>
        <div class="row">
          <label class="check"><input id="show_cadr" type="checkbox" ${this._config.show_cadr !== false ? "checked" : ""}/> Show CADR</label>
          <label class="check"><input id="show_filter" type="checkbox" ${this._config.show_filter !== false ? "checked" : ""}/> Show Filter %</label>
          <label class="check"><input id="show_timer" type="checkbox" ${this._config.show_timer !== false ? "checked" : ""}/> Show Timer</label>
          <label class="check"><input id="compact" type="checkbox" ${this._config.compact ? "checked" : ""}/> Compact</label>
        </div>
      </div>
    `;

    const bind = (id, prop, isCheck = false) => {
      const el = this.shadowRoot.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => {
        const next = { ...this._config, [prop]: isCheck ? el.checked : el.value };
        if (!isCheck && prop === "name" && !el.value) delete next.name;
        this._emit(next);
      });
    };
    bind("entity", "entity");
    bind("name", "name");
    bind("theme", "theme");
    bind("show_cadr", "show_cadr", true);
    bind("show_filter", "show_filter", true);
    bind("show_timer", "show_timer", true);
    bind("compact", "compact", true);
  }
}

if (!customElements.get("levoit-esphome-card")) {
  customElements.define("levoit-esphome-card", LevoitEsphomeCard);
}
if (!customElements.get("levoit-esphome-card-editor")) {
  customElements.define("levoit-esphome-card-editor", LevoitEsphomeCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "levoit-esphome-card")) {
  window.customCards.push({
    type: "levoit-esphome-card",
    name: "Levoit ESPHome Card",
    description: "Dracula-styled, auto-discovering Lovelace card for tuct/levoit ESPHome air purifiers.",
    preview: true,
  });
}

console.info(`%c LEVOIT-ESPHOME-CARD %c v${CARD_VERSION} `, "color:#282a36;background:#bd93f9;font-weight:700", "color:#f8f8f2;background:#44475a;font-weight:700");
