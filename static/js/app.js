// ------- Persistent storage keys -------

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
    previewZoom: "peppol_preview_zoom"
};

let xmlEditor, xsltEditor;
let lastHtml = "";
let autoUpdate = true;
let transformTimeout = null;

let previewZoom = 1.0;
const PREVIEW_ZOOM_MIN = 0.25;
const PREVIEW_ZOOM_MAX = 3.0;
const PREVIEW_ZOOM_STEP = 0.1;

// Simple list for XML/XSLT / HTML hints when pressing Ctrl+Space
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

document.addEventListener("DOMContentLoaded", () => {
    initEditors();
    initUI();
    restoreState();
    initConfigPanelVisibility();
    initLogPanelVisibility();
    restorePreviewZoom();
    addLog("Application initialized.", "info");

    if (xmlEditor.getValue().trim() && xsltEditor.getValue().trim()) {
        scheduleTransform();
    }
});

// Disable Ctrl+S / Cmd+S so browser "Save page" doesn't pop up
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        addLog("Ctrl+S is disabled in this app.", "info");
    }
});


// ------- Editors (CodeMirror) -------

function initEditors() {
    const xmlTextarea = document.getElementById("xmlEditor");
    const xsltTextarea = document.getElementById("xsltEditor");

    const commonOptions = {
        mode: "application/xml",
        lineNumbers: true,
        theme: "eclipse",
        autoCloseTags: true
    };

    xmlEditor = CodeMirror.fromTextArea(xmlTextarea, commonOptions);
    xsltEditor = CodeMirror.fromTextArea(xsltTextarea, commonOptions);

    // CTRL + SPACE → suggestions helper
    const hintKeymap = {
        "Ctrl-Space": function (cm) {
            CodeMirror.showHint(cm, xmlXsltHint, { completeSingle: true });
        }
    };
    xmlEditor.setOption("extraKeys", hintKeymap);
    xsltEditor.setOption("extraKeys", hintKeymap);

    xmlEditor.on("change", () => {
        saveState();
        if (autoUpdate) scheduleTransform();
    });

    xsltEditor.on("change", () => {
        autoDetectXsltVersion();
        saveState();
        if (autoUpdate) scheduleTransform();
    });

    // Refresh CodeMirror when user resizes editor elements (via CSS resize)
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            xmlEditor.refresh();
            xsltEditor.refresh();
        });
        ro.observe(xmlEditor.getWrapperElement());
        ro.observe(xsltEditor.getWrapperElement());
    }
}


// ------- UI wiring -------

function initUI() {
    const autoUpdateCheckbox = document.getElementById("autoUpdateCheckbox");
    const generateBtn = document.getElementById("generateBtn");
    const toggleLayoutBtn = document.getElementById("toggleLayoutBtn");
    const exportXmlBtn = document.getElementById("exportXmlBtn");
    const exportXsltBtn = document.getElementById("exportXsltBtn");
    const exportHtmlBtn = document.getElementById("exportHtmlBtn");
    const xsltVersionSelect = document.getElementById("xsltVersionSelect");
    const clearEditorsBtn = document.getElementById("clearEditorsBtn");
    const loadSampleBtn = document.getElementById("loadSampleBtn");
    const loadSaxonSampleBtn = document.getElementById("loadSaxonSampleBtn");
    const imageInsertMode = document.getElementById("imageInsertMode");
    const imageFileInput = document.getElementById("imageFileInput");
    const insertImageBtn = document.getElementById("insertImageBtn");
    const goTopBtn = document.getElementById("goTopBtn");
    const toggleConfigPanelBtn = document.getElementById("toggleConfigPanelBtn");
    const toggleLogPanelBtn = document.getElementById("toggleLogPanelBtn");
    const collapseXmlBtn = document.getElementById("collapseXmlBtn");
    const collapseXsltBtn = document.getElementById("collapseXsltBtn");
    const previewZoomInBtn = document.getElementById("previewZoomInBtn");
    const previewZoomOutBtn = document.getElementById("previewZoomOutBtn");
    const previewZoomResetBtn = document.getElementById("previewZoomResetBtn");

    autoUpdateCheckbox.addEventListener("change", () => {
        autoUpdate = autoUpdateCheckbox.checked;
        generateBtn.disabled = autoUpdate;
        saveState();
        addLog(
            autoUpdate ? "Auto-update enabled." : "Auto-update disabled. Manual generation enabled.",
            "info"
        );
    });

    generateBtn.addEventListener("click", () => {
        doTransform();
    });

    toggleLayoutBtn.addEventListener("click", () => {
        toggleLayout();
    });

    exportXmlBtn.addEventListener("click", () => {
        const ts = buildTimestamp();
        downloadText(`document_${ts}.xml`, xmlEditor.getValue());
        addLog("Exported XML.", "info");
    });

    exportXsltBtn.addEventListener("click", () => {
        const ts = buildTimestamp();
        downloadText(`stylesheet_${ts}.xslt`, xsltEditor.getValue());
        addLog("Exported XSLT.", "info");
    });

    exportHtmlBtn.addEventListener("click", () => {
        const ts = buildTimestamp();
        downloadText(`result_${ts}.html`, lastHtml || "");
        addLog("Exported HTML.", "info");
    });

    xsltVersionSelect.addEventListener("change", () => {
        saveState();
        addLog(`Stylesheet version set to ${xsltVersionSelect.value}.`, "info");
    });

    clearEditorsBtn.addEventListener("click", () => {
        if (confirm("Clear XML and XSLT editors?")) {
            xmlEditor.setValue("");
            xsltEditor.setValue("");
            addLog("Cleared XML and XSLT editors.", "info");
            saveState();
        }
    });

    loadSampleBtn.addEventListener("click", () => {
        loadSampleContent();
        addLog("Loaded sample XML/XSLT content.", "info");
        saveState();
        if (autoUpdate) scheduleTransform();
    });

    if (loadSaxonSampleBtn) {
        loadSaxonSampleBtn.addEventListener("click", () => {
            fetch("/api/sample/saxon")
                .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data.ok) {
                        addLog(data.message || "Failed to load Saxon sample.", "error");
                        return;
                    }
                    xmlEditor.setValue(data.xml || "");
                    xsltEditor.setValue(data.xslt || "");
                    autoDetectXsltVersion();
                    addLog("Loaded Saxon PEPPOL sample from server.", "info");
                    saveState();
                    if (autoUpdate) scheduleTransform();
                })
                .catch((err) => {
                    addLog("Error loading Saxon sample: " + err.message, "error");
                });
        });
    }

    insertImageBtn.addEventListener("click", () => {
        const file = imageFileInput.files[0];
        if (!file) {
            alert("Please choose an image file first.");
            return;
        }
        const mode = imageInsertMode.value;
        handleImageInsert(file, mode);
    });

    if (goTopBtn) {
        goTopBtn.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    if (toggleConfigPanelBtn) {
        toggleConfigPanelBtn.addEventListener("click", () => {
            const panel = document.getElementById("configPanel");
            const currentlyHidden = panel.classList.contains("config-hidden");
            if (currentlyHidden) {
                panel.classList.remove("config-hidden");
                toggleConfigPanelBtn.textContent = "Hide config";
            } else {
                panel.classList.add("config-hidden");
                toggleConfigPanelBtn.textContent = "Show config";
            }
            try {
                localStorage.setItem(
                    STORAGE_KEYS.configVisible,
                    String(!currentlyHidden)
                );
            } catch (e) {
                // ignore
            }
        });
    }

    if (toggleLogPanelBtn) {
        toggleLogPanelBtn.addEventListener("click", () => {
            const row = document.querySelector(".header-log-row");
            if (!row) return;
            const nowHidden = row.classList.toggle("hidden");
            const visible = !nowHidden;
            toggleLogPanelBtn.textContent = visible ? "Hide log" : "Show log";
            try {
                localStorage.setItem(STORAGE_KEYS.logVisible, String(visible));
            } catch (e) {
                // ignore
            }
        });
    }

    if (collapseXmlBtn) {
        collapseXmlBtn.addEventListener("click", () => {
            toggleEditorCollapsed(xmlEditor, collapseXmlBtn, STORAGE_KEYS.xmlCollapsed);
        });
    }

    if (collapseXsltBtn) {
        collapseXsltBtn.addEventListener("click", () => {
            toggleEditorCollapsed(xsltEditor, collapseXsltBtn, STORAGE_KEYS.xsltCollapsed);
        });
    }

    if (previewZoomInBtn) {
        previewZoomInBtn.addEventListener("click", () => {
            setPreviewZoom(previewZoom + PREVIEW_ZOOM_STEP);
        });
    }

    if (previewZoomOutBtn) {
        previewZoomOutBtn.addEventListener("click", () => {
            setPreviewZoom(previewZoom - PREVIEW_ZOOM_STEP);
        });
    }

    if (previewZoomResetBtn) {
        previewZoomResetBtn.addEventListener("click", () => {
            setPreviewZoom(1.0);
        });
    }
}


// ------- Config & log visibility -------

function initConfigPanelVisibility() {
    const panel = document.getElementById("configPanel");
    const toggleConfigPanelBtn = document.getElementById("toggleConfigPanelBtn");
    if (!panel || !toggleConfigPanelBtn) return;

    const stored = localStorage.getItem(STORAGE_KEYS.configVisible);
    const visible = stored === null ? true : stored === "true";

    if (!visible) {
        panel.classList.add("config-hidden");
        toggleConfigPanelBtn.textContent = "Show config";
    } else {
        panel.classList.remove("config-hidden");
        toggleConfigPanelBtn.textContent = "Hide config";
    }
}

function initLogPanelVisibility() {
    const row = document.querySelector(".header-log-row");
    const toggleLogPanelBtn = document.getElementById("toggleLogPanelBtn");
    if (!row || !toggleLogPanelBtn) return;

    const stored = localStorage.getItem(STORAGE_KEYS.logVisible);
    const visible = stored === null ? true : stored === "true";

    row.classList.toggle("hidden", !visible);
    toggleLogPanelBtn.textContent = visible ? "Hide log" : "Show log";
}


// ------- State persistence -------

function restoreState() {
    const storedXml = localStorage.getItem(STORAGE_KEYS.xml);
    const storedXslt = localStorage.getItem(STORAGE_KEYS.xslt);
    const storedHtml = localStorage.getItem(STORAGE_KEYS.html);
    const storedAutoUpdate = localStorage.getItem(STORAGE_KEYS.autoUpdate);
    const storedLayout = localStorage.getItem(STORAGE_KEYS.layout);
    const storedVersion = localStorage.getItem(STORAGE_KEYS.xsltVersion);

    if (storedXml !== null) {
        xmlEditor.setValue(storedXml);
    } else {
        loadSampleContent(); // first time: load sample
    }

    if (storedXslt !== null) {
        xsltEditor.setValue(storedXslt);
    }

    if (storedHtml) {
        lastHtml = storedHtml;
        updatePreview(lastHtml);
        addLog("Restored last HTML preview from browser cache.", "info");
    }

    if (storedAutoUpdate !== null) {
        autoUpdate = storedAutoUpdate === "true";
        const autoUpdateCheckbox = document.getElementById("autoUpdateCheckbox");
        const generateBtn = document.getElementById("generateBtn");
        autoUpdateCheckbox.checked = autoUpdate;
        generateBtn.disabled = autoUpdate;
    }

    if (storedLayout) {
        const mainLayout = document.getElementById("mainLayout");
        mainLayout.classList.remove("main-layout-horizontal", "main-layout-vertical");
        mainLayout.classList.add(storedLayout);
    }

    if (storedVersion) {
        const xsltVersionSelect = document.getElementById("xsltVersionSelect");
        xsltVersionSelect.value = storedVersion;
    }

    // Restore collapsed state of XML / XSLT editors
    restoreEditorCollapseState();
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEYS.xml, xmlEditor.getValue());
        localStorage.setItem(STORAGE_KEYS.xslt, xsltEditor.getValue());
        localStorage.setItem(STORAGE_KEYS.html, lastHtml);
        localStorage.setItem(STORAGE_KEYS.autoUpdate, String(autoUpdate));
        const mainLayout = document.getElementById("mainLayout");
        localStorage.setItem(
            STORAGE_KEYS.layout,
            mainLayout.classList.contains("main-layout-vertical")
                ? "main-layout-vertical"
                : "main-layout-horizontal"
        );
        const xsltVersionSelect = document.getElementById("xsltVersionSelect");
        localStorage.setItem(STORAGE_KEYS.xsltVersion, xsltVersionSelect.value);
    } catch (e) {
        addLog("Could not save state to browser storage.", "error");
    }
}


// ------- Logging -------

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


// ------- Transform logic -------

function scheduleTransform() {
    if (transformTimeout) {
        clearTimeout(transformTimeout);
    }
    // Debounce for 500ms
    transformTimeout = setTimeout(() => {
        doTransform();
    }, 500);
}

function doTransform() {
    const xml = xmlEditor.getValue();
    const xslt = xsltEditor.getValue();
    const xsltVersionSelect = document.getElementById("xsltVersionSelect");
    const version = xsltVersionSelect.value;

    if (!xml.trim() || !xslt.trim()) {
        addLog("XML or XSLT is empty, nothing to transform.", "info");
        return;
    }

    fetch("/api/transform", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ xml, xslt, version })
    })
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
            if (data && Array.isArray(data.log)) {
                data.log.forEach((msg) => {
                    const level = msg.includes("ERROR") ? "error" : "info";
                    addLog(msg.replace(/^\[ERROR\]\s*/, ""), level);
                });
            }

            if (!ok || !data.ok) {
                addLog("Transformation failed.", "error");
                return;
            }

            lastHtml = data.html || "";
            updatePreview(lastHtml);
            saveState();
        })
        .catch((err) => {
            addLog("Network error during transform: " + err.message, "error");
        });
}


// ------- Preview & zoom -------

function updatePreview(html) {
    const frame = document.getElementById("previewFrame");
    if (!frame) return;

    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(html || "<!DOCTYPE html><html><body><p>No HTML result yet.</p></body></html>");
    doc.close();

    const mainLayout = document.getElementById("mainLayout");
    const isHorizontal =
        mainLayout && mainLayout.classList.contains("main-layout-horizontal");

    // Apply zoom to the content document
    applyPreviewZoom(doc);

    if (isHorizontal) {
        // LEFT/RIGHT MODE:
        // Do NOT auto-grow the iframe to content height.
        // Keep CSS min-height and scroll inside iframe.
        frame.style.height = "";
        return;
    }

    // TOP/BOTTOM MODE:
    // Auto-size iframe to its content so the page scrolls.
    setTimeout(() => {
        try {
            const body = doc.body;
            const htmlEl = doc.documentElement;
            const height = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                htmlEl.clientHeight,
                htmlEl.scrollHeight,
                htmlEl.offsetHeight
            );
            frame.style.height = Math.min(height + 20, 2000) + "px";
        } catch (e) {
            // ignore
        }
    }, 50);
}

function applyPreviewZoom(doc) {
    if (!doc) return;
    const htmlEl = doc.documentElement || doc.body;
    htmlEl.style.zoom = previewZoom;
}

function setPreviewZoom(newZoom) {
    const clamped = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, newZoom));
    previewZoom = clamped;

    const label = document.getElementById("previewZoomLabel");
    if (label) {
        label.textContent = Math.round(previewZoom * 100) + "%";
    }

    try {
        localStorage.setItem(STORAGE_KEYS.previewZoom, String(previewZoom));
    } catch (e) {
        // ignore
    }

    const frame = document.getElementById("previewFrame");
    if (frame) {
        const doc = frame.contentDocument || frame.contentWindow.document;
        applyPreviewZoom(doc);
    }
}

function restorePreviewZoom() {
    const stored = localStorage.getItem(STORAGE_KEYS.previewZoom);
    if (stored !== null) {
        const val = parseFloat(stored);
        if (!Number.isNaN(val) && val > 0) {
            previewZoom = val;
        }
    }
    setPreviewZoom(previewZoom);
}


// ------- Layout toggle -------

function toggleLayout() {
    const mainLayout = document.getElementById("mainLayout");
    const frame = document.getElementById("previewFrame");
    const isHorizontal = mainLayout.classList.contains("main-layout-horizontal");

    // Flip classes
    mainLayout.classList.toggle("main-layout-horizontal", !isHorizontal);
    mainLayout.classList.toggle("main-layout-vertical", isHorizontal);

    if (!isHorizontal) {
        // switched VERTICAL -> HORIZONTAL
        if (frame) {
            frame.style.height = "";
        }
    } else {
        // switched HORIZONTAL -> VERTICAL
        if (frame && lastHtml) {
            updatePreview(lastHtml);
        }
    }

    addLog(
        "Layout changed to " +
        (isHorizontal ? "vertical (stacked)" : "horizontal (side-by-side)") +
        ".",
        "info"
    );
    saveState();
}


// ------- Helpers -------

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

function autoDetectXsltVersion() {
    const text = xsltEditor.getValue();
    const match = text.match(
        /<xsl:(stylesheet|transform)[^>]*\bversion=["']([^"']+)["'][^>]*>/i
    );
    if (match) {
        const detected = match[2];
        const xsltVersionSelect = document.getElementById("xsltVersionSelect");
        const options = Array.from(xsltVersionSelect.options).map((o) => o.value);
        if (options.includes(detected)) {
            if (xsltVersionSelect.value !== detected) {
                xsltVersionSelect.value = detected;
                addLog(`Detected XSLT version ${detected} from stylesheet.`, "info");
                saveState();
            }
        } else {
            addLog(`Detected XSLT version ${detected}, which is not in the list.`, "info");
        }
    }
}

function loadSampleContent() {
    const sampleXml = `
<invoice>
  <id>INV-001</id>
  <date>2025-01-01</date>
  <customer>Example Customer</customer>
  <total>123.45</total>
</invoice>
`.trim();

    const sampleXslt = `
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" indent="yes" />

  <xsl:template match="/">
    <html>
      <head>
        <title>Sample Invoice</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 1.5rem; }
          h1 { margin-bottom: 0.5rem; }
          .meta { color: #555; margin-bottom: 1rem; }
          .total { font-weight: bold; font-size: 1.2rem; }
        </style>
      </head>
      <body>
        <h1>Invoice <xsl:value-of select="invoice/id" /></h1>
        <div class="meta">
          Date: <xsl:value-of select="invoice/date" />
          <br />
          Customer: <xsl:value-of select="invoice/customer" />
        </div>
        <div class="total">
          Total: <xsl:value-of select="invoice/total" /> EUR
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`.trim();

    xmlEditor.setValue(sampleXml);
    xsltEditor.setValue(sampleXslt);
}

function handleImageInsert(file, mode) {
    if (mode === "svgInline") {
        const reader = new FileReader();
        reader.onload = (e) => {
            const svgText = e.target.result;
            const snippet = `
<!-- Inline SVG inserted -->
${svgText}
`.trim();
            xsltEditor.replaceSelection("\n" + snippet + "\n");
            xsltEditor.focus();
            addLog("Inserted inline SVG into XSLT.", "info");
        };
        reader.readAsText(file);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const snippet = `
<!-- Image inserted via helper -->
<img src="${dataUrl}" alt="Embedded image" />
`.trim();
            xsltEditor.replaceSelection("\n" + snippet + "\n");
            xsltEditor.focus();
            addLog("Inserted Base64 data URI image into XSLT.", "info");
        };
        reader.readAsDataURL(file);
    }
}

function xmlXsltHint(cm) {
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);

    let start = token.start;
    let end = cur.ch;
    let word = token.string.slice(0, end - token.start);

    if (!/^[\w:-]*$/.test(word)) {
        word = "";
        start = end = cur.ch;
    }

    const list = XML_XSLT_HINT_ITEMS.filter((item) => item.startsWith(word));
    return {
        list: list.length ? list : XML_XSLT_HINT_ITEMS,
        from: CodeMirror.Pos(cur.line, start),
        to: CodeMirror.Pos(cur.line, end)
    };
}


// ------- Collapse / expand XML & XSLT editors -------

function restoreEditorCollapseState() {
    const collapseXmlBtn = document.getElementById("collapseXmlBtn");
    const collapseXsltBtn = document.getElementById("collapseXsltBtn");

    if (collapseXmlBtn && xmlEditor) {
        const stored = localStorage.getItem(STORAGE_KEYS.xmlCollapsed);
        if (stored !== null) {
            const collapsed = stored === "true";
            setEditorCollapsed(xmlEditor, collapseXmlBtn, collapsed, STORAGE_KEYS.xmlCollapsed, true);
        }
    }

    if (collapseXsltBtn && xsltEditor) {
        const stored = localStorage.getItem(STORAGE_KEYS.xsltCollapsed);
        if (stored !== null) {
            const collapsed = stored === "true";
            setEditorCollapsed(xsltEditor, collapseXsltBtn, collapsed, STORAGE_KEYS.xsltCollapsed, true);
        }
    }
}

function setEditorCollapsed(editorInstance, buttonEl, collapsed, storageKey, skipSave = false) {
    const wrapper = editorInstance.getWrapperElement();
    if (!wrapper) return;

    if (collapsed) {
        wrapper.style.display = "none";
        buttonEl.textContent = "+";
        buttonEl.title = buttonEl.title.replace("Hide", "Show");
    } else {
        wrapper.style.display = "";
        buttonEl.textContent = "−";
        buttonEl.title = buttonEl.title.replace("Show", "Hide");
        editorInstance.refresh();
    }

    if (!skipSave) {
        try {
            localStorage.setItem(storageKey, String(collapsed));
        } catch (e) {
            // ignore
        }
    }
}

function toggleEditorCollapsed(editorInstance, buttonEl, storageKey) {
    const wrapper = editorInstance.getWrapperElement();
    const currentlyCollapsed = wrapper.style.display === "none";
    setEditorCollapsed(editorInstance, buttonEl, !currentlyCollapsed, storageKey);
}
