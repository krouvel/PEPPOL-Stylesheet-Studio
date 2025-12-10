// app-core.js
// Core globals, storage keys, logging, theme helpers, generic utils

const STORAGE_KEYS = {
    xml: "peppol_xml_content",
    xslt: "peppol_xslt_content",
    html: "peppol_html_result",
    autoUpdate: "peppol_auto_update",
    layout: "peppol_layout_mode",
    xsltVersion: "peppol_xslt_version",
    configVisible: "peppol_config_visible",
    xmlCollapsed: "peppol_xml_collapsed",
    xsltCollapsed: "peppol_xslt_collapsed",
    logVisible: "peppol_log_visible",
    previewZoom: "peppol_preview_zoom",
    theme: "peppol_theme",
    docInfoCollapsed: "peppol_docinfo_collapsed"
};

let xmlEditor, xsltEditor;
let xmlViewMode = "text"; // "text" | "tree"
let xmlTreeContainer = null;
let xmlTreePathLabel = null;
let xmlTreeSelectedItem = null;
let xmlTreeRenderTimeout = null;
const XML_PANEL_HEIGHT_KEY = "peppol_xml_panel_height";
const XSLT_PANEL_HEIGHT_KEY = "peppol_xslt_panel_height";
const LOG_PANEL_HEIGHT_KEY = "peppol_log_panel_height";
let lastHtml = "";
let autoUpdate = true;
let transformTimeout = null;

let previewZoom = 1.0;
const PREVIEW_ZOOM_MIN = 0.25;
const PREVIEW_ZOOM_MAX = 3.0;
const PREVIEW_ZOOM_STEP = 0.1;

const XML_XSLT_HINT_ITEMS = [
    // Common HTML tags
    "html", "head", "body", "div", "span", "p", "h1", "h2", "h3", "table", "tr", "td", "th",
    "ul", "ol", "li", "img", "a", "style",
    // Common attributes
    "id", "class", "style", "src", "href", "alt", "width", "height", "title",
    // XSLT tags
    "xsl:stylesheet", "xsl:transform", "xsl:template", "xsl:value-of", "xsl:for-each",
    "xsl:if", "xsl:choose", "xsl:when", "xsl:otherwise", "xsl:apply-templates",
    "xsl:text", "xsl:call-template", "xsl:param", "xsl:variable", "xsl:output",
    // XSLT attributes
    "match", "select", "name", "mode", "test", "value", "version", "xmlns:xsl"
];

function addLog(message, level = "info") {
  const panel = document.getElementById("log-panel");
  if (!panel) return;

  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;

  const time = new Date().toLocaleTimeString();

  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  timeSpan.textContent = `[${time}] `;

  const msgSpan = document.createElement("span");
  msgSpan.className = "log-message";
  msgSpan.textContent = message;

  entry.appendChild(timeSpan);
  entry.appendChild(msgSpan);

  // ---- Try to detect line/column from Saxon (and similar) messages ----
  let source = null;
  let line = null;
  let column = null;

  // Example:
  // [1:41:28 AM] Error on line 9 column 5 of stylesheet.xslt:
  const m1 = message.match(
    /Error on line\s+(\d+)\s+column\s+(\d+)\s+of\s+([^\s:]+)\s*:/i
  );
  if (m1) {
    line = parseInt(m1[1], 10);
    column = parseInt(m1[2], 10);
    const file = m1[3].toLowerCase();
    if (file.endsWith(".xslt")) {
      source = "xslt";
    } else if (file.endsWith(".xml")) {
      source = "xml";
    }
  }

  // Example:
  // ... stylesheet.xslt; lineNumber: 9; columnNumber: 5; ...
  if (!source || !line) {
    const m2 = message.match(/lineNumber:\s*(\d+);\s*columnNumber:\s*(\d+)/i);
    if (m2) {
      line = parseInt(m2[1], 10);
      column = parseInt(m2[2], 10);
      if (/stylesheet\.xslt/i.test(message) || /\.xslt\b/i.test(message)) {
        source = "xslt";
      } else if (/input\.xml/i.test(message) || /\.xml\b/i.test(message)) {
        source = "xml";
      }
    }
  }

  // If we found a source + line → make entry clickable
  if (source && line) {
    entry.classList.add("log-entry-clickable");
    entry.dataset.source = source; // "xml" or "xslt"
    entry.dataset.line = String(line);
    if (column) {
      entry.dataset.column = String(column);
    }

    entry.title = `Click to jump to ${source.toUpperCase()} line ${line}`;

    entry.addEventListener("click", () => {
      if (typeof jumpToEditorLocation === "function") {
        const ln = parseInt(entry.dataset.line, 10);
        const col = entry.dataset.column
          ? parseInt(entry.dataset.column, 10)
          : undefined;
        jumpToEditorLocation(entry.dataset.source, ln, col);
      }
    });
  }

  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;
}

function buildTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
        d.getFullYear().toString() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        "_" +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        pad(d.getSeconds())
    );
}

function downloadText(filename, text) {
    const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Generic helper: remember a resizable panel height in localStorage
function setupPanelHeightPersistence(options) {
  if (!options || !options.element || !options.storageKey) return;

  const el = options.element;
  const mirrors = Array.isArray(options.mirrorElements)
    ? options.mirrorElements.filter(Boolean)
    : [];
  const minHeight = typeof options.minHeight === "number" ? options.minHeight : 80;
  const maxHeight = typeof options.maxHeight === "number" ? options.maxHeight : 2000;
  const refreshFn = typeof options.refreshFn === "function" ? options.refreshFn : null;
  const key = options.storageKey;

  // Apply stored height on load
  let storedHeight = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const h = parseInt(raw, 10);
      if (h && h >= minHeight && h <= maxHeight) {
        storedHeight = h;
      }
    }
  } catch (e) {
    // ignore storage errors
  }

  if (storedHeight) {
    el.style.height = storedHeight + "px";
    mirrors.forEach((m) => {
      m.style.height = storedHeight + "px";
    });
    if (refreshFn) {
      // Let layout settle first
      setTimeout(refreshFn, 0);
    }
  }

  // Nothing more we can do without ResizeObserver
  if (!window.ResizeObserver) return;

  const ro = new ResizeObserver((entries) => {
    let maxObserved = null;

    entries.forEach((entry) => {
      const h = Math.round(entry.contentRect.height);
      if (!h || h < minHeight || h > maxHeight) return;
      if (maxObserved === null || h > maxObserved) {
        maxObserved = h;
      }
    });

    if (!maxObserved) return;

    try {
      localStorage.setItem(key, String(maxObserved));
    } catch (e) {
      // ignore storage errors
    }
  });

  ro.observe(el);
  mirrors.forEach((m) => {
    ro.observe(m);
  });
}

// THEME: for now we force light mode and disable toggle (WIP)
function applyTheme(theme) {
    const body = document.body;
    const themeToggle = document.getElementById("themeToggle");
    if (theme === "dark") {
        body.classList.add("theme-dark");
        if (themeToggle) themeToggle.checked = true;
    } else {
        body.classList.remove("theme-dark");
        if (themeToggle) themeToggle.checked = false;
    }
}

function initTheme() {
    const body = document.body;
    const themeToggle = document.getElementById("themeToggle");

    // Always light for now
    body.classList.remove("theme-dark");
    if (themeToggle) {
        themeToggle.checked = false;
        themeToggle.disabled = true;
    }

    try {
        localStorage.setItem(STORAGE_KEYS.theme, "light");
    } catch (e) {
        // ignore
    }
}

function setTheme(theme) {
    applyTheme(theme);
    try {
        localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch (e) {
        // ignore
    }
}
