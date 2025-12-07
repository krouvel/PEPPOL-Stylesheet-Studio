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
    entry.textContent = `[${time}] ${message}`;
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
