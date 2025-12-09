// app-editors.js
// CodeMirror editors, XML/XSLT helpers, doc info, collapse logic

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

// -------- Per-editor search (XML / XSLT) --------

const editorSearchState = {
    xml: { query: "", matches: [], index: -1, markers: [] },
    xslt: { query: "", matches: [], index: -1, markers: [] }
};

const editorSearchUI = {
    xml: {},
    xslt: {}
};

function getEditorKeyFromInstance(cm) {
    if (cm === xmlEditor) return "xml";
    if (cm === xsltEditor) return "xslt";
    return null;
}

function getEditorByKey(key) {
    return key === "xml" ? xmlEditor : xsltEditor;
}

function clearEditorSearch(key) {
    const state = editorSearchState[key];
    const ui = editorSearchUI[key];
    if (!state) return;

    // clear markers
    state.markers.forEach(m => m.clear());
    state.markers = [];
    state.matches = [];
    state.index = -1;
    state.query = "";

    if (ui && ui.input) ui.input.value = "";
    if (ui && ui.count) ui.count.textContent = "0/0";
}

function updateEditorSearchCount(key) {
    const state = editorSearchState[key];
    const ui = editorSearchUI[key];
    if (!state || !ui || !ui.count) return;

    const total = state.matches.length;
    const current = state.index >= 0 ? state.index + 1 : 0;
    ui.count.textContent = total ? `${current}/${total}` : "0/0";
}

function rebuildEditorSearch(key) {
    const state = editorSearchState[key];
    const ui = editorSearchUI[key];
    const editor = getEditorByKey(key);
    if (!state || !ui || !editor) return;

    // clear previous marks
    state.markers.forEach(m => m.clear());
    state.markers = [];
    state.matches = [];
    state.index = -1;

    const query = (ui.input.value || "").trim();
    state.query = query;

    if (!query) {
        updateEditorSearchCount(key);
        return;
    }

    const text = editor.getValue();
    if (!text) {
        updateEditorSearchCount(key);
        return;
    }

    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();

    let fromIndex = 0;
    while (true) {
        const idx = haystack.indexOf(needle, fromIndex);
        if (idx === -1) break;

        const from = editor.posFromIndex(idx);
        const to = editor.posFromIndex(idx + query.length);
        const marker = editor.markText(from, to, { className: "cm-search-highlight" });

        state.matches.push({ from, to });
        state.markers.push(marker);

        fromIndex = idx + query.length;
    }

    if (state.matches.length) {
        state.index = 0;
        const first = state.matches[0];
        editor.setSelection(first.from, first.to);
        editor.scrollIntoView(first.from, 80);
    }

    updateEditorSearchCount(key);
}

function jumpEditorSearch(key, direction) {
    const state = editorSearchState[key];
    const editor = getEditorByKey(key);
    if (!state || !editor || !state.matches.length) return;

    const len = state.matches.length;
    state.index = (state.index + direction + len) % len;
    const match = state.matches[state.index];

    editor.setSelection(match.from, match.to);
    editor.scrollIntoView(match.from, 80);
    updateEditorSearchCount(key);
}

function closeEditorSearch(key) {
    const ui = editorSearchUI[key];
    const editor = getEditorByKey(key);
    if (!ui || !editor) return;

    clearEditorSearch(key);
    if (ui.bar) ui.bar.classList.remove("visible");
    editor.focus();
}

function openEditorSearch(cm) {
    const key = getEditorKeyFromInstance(cm);
    if (!key) return;

    const ui = editorSearchUI[key];
    const state = editorSearchState[key];
    if (!ui || !ui.bar || !ui.input) return;

    ui.bar.classList.add("visible");

    // preload with current selection if nothing searched yet
    if (!state.query && cm.somethingSelected()) {
        const sel = cm.getSelection().trim();
        if (sel) ui.input.value = sel;
    }

    ui.input.focus();
    ui.input.select();

    rebuildEditorSearch(key);
}

function nextEditorSearch(cm) {
    const key = getEditorKeyFromInstance(cm);
    if (!key) return;

    const state = editorSearchState[key];
    if (!state.matches.length) {
        openEditorSearch(cm);
    } else {
        jumpEditorSearch(key, +1);
    }
}

function prevEditorSearch(cm) {
    const key = getEditorKeyFromInstance(cm);
    if (!key) return;

    const state = editorSearchState[key];
    if (!state.matches.length) {
        openEditorSearch(cm);
    } else {
        jumpEditorSearch(key, -1);
    }
}

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

    const hintKeymap = {
        "Ctrl-Space": function (cm) {
            CodeMirror.showHint(cm, xmlXsltHint, { completeSingle: true });
        }
    };
    xmlEditor.setOption("extraKeys", hintKeymap);
    xsltEditor.setOption("extraKeys", hintKeymap);

    xmlEditor.on("change", () => {
        updateDocumentInfoFromXml();
        saveState();
        if (autoUpdate) scheduleTransform();
    });

    xsltEditor.on("change", () => {
        autoDetectXsltVersion();
        saveState();
        if (autoUpdate) scheduleTransform();
    });

    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            xmlEditor.refresh();
            xsltEditor.refresh();
        });
        ro.observe(xmlEditor.getWrapperElement());
        ro.observe(xsltEditor.getWrapperElement());
    }

    // initialize per-editor search UI
    initEditorSearchUI();
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
    updateDocumentInfoFromXml();
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

// -------- Document info panel --------

function updateDocumentInfoFromXml() {
    const xml = xmlEditor.getValue();
    const rootEl = document.getElementById("docInfoRoot");
    const idEl = document.getElementById("docInfoId");
    const issueEl = document.getElementById("docInfoIssueDate");
    const dueEl = document.getElementById("docInfoDueDate");
    const typeEl = document.getElementById("docInfoType");
    const emptyEl = document.querySelector("#docInfoContent .doc-info-empty");

    if (!rootEl || !idEl || !issueEl || !dueEl || !typeEl) return;

    if (!xml.trim()) {
        rootEl.textContent = "—";
        idEl.textContent = "—";
        issueEl.textContent = "—";
        dueEl.textContent = "—";
        typeEl.textContent = "—";
        if (emptyEl) emptyEl.style.display = "block";
        return;
    }

    let root = "—";
    let invoiceId = "—";
    let issueDate = "—";
    let dueDate = "—";
    let dtype = "Unknown";

    // Root element (ignore optional prefix, e.g. <cbc:Invoice>)
    const rootMatch = xml.match(/<\s*(?:\w+:)?([A-Za-z_][\w\-.]*)[^>]*>/);
    if (rootMatch) {
        root = rootMatch[1];
        if (/invoice/i.test(root)) {
            dtype = "Invoice";
        }
    }

    // Try to detect UBL/PEPPOL namespace
    if (/urn:oasis:names:specification:ubl:schema:xsd:Invoice-2/i.test(xml)) {
        dtype = "UBL Invoice (PEPPOL-like)";
    }

    // Invoice ID: <cbc:ID> or <ID>
    let idMatch =
        xml.match(/<\s*cbc:ID[^>]*>([^<]+)<\/\s*cbc:ID\s*>/i) ||
        xml.match(/<\s*(?:\w+:)?ID[^>]*>([^<]+)<\/\s*(?:\w+:)?ID\s*>/i);

    if (idMatch) {
        invoiceId = idMatch[1].trim();
    }

    // Issue date: <cbc:IssueDate> or <IssueDate>
    const issueMatch =
        xml.match(/<\s*(?:\w+:)?IssueDate[^>]*>([^<]+)<\/\s*(?:\w+:)?IssueDate\s*>/i);
    if (issueMatch) {
        issueDate = issueMatch[1].trim();
    }

    // Due date: <cbc:DueDate> or <DueDate>
    const dueMatch =
        xml.match(/<\s*(?:\w+:)?DueDate[^>]*>([^<]+)<\/\s*(?:\w+:)?DueDate\s*>/i);
    if (dueMatch) {
        dueDate = dueMatch[1].trim();
    }

    rootEl.textContent = root;
    idEl.textContent = invoiceId;
    issueEl.textContent = issueDate;
    dueEl.textContent = dueDate;
    typeEl.textContent = dtype;

    if (emptyEl) {
        const allEmpty =
            root === "—" &&
            invoiceId === "—" &&
            issueDate === "—" &&
            dueDate === "—" &&
            dtype === "Unknown";
        emptyEl.style.display = allEmpty ? "block" : "none";
    }
}

function initDocInfoCollapse() {
    const btn = document.getElementById("toggleDocInfoBtn");
    const content = document.getElementById("docInfoContent");
    if (!btn || !content) return;

    const stored = localStorage.getItem(STORAGE_KEYS.docInfoCollapsed);
    const collapsed = stored === "true";
    applyDocInfoCollapsed(collapsed);

    btn.addEventListener("click", () => {
        const nowCollapsed = content.style.display === "none";
        applyDocInfoCollapsed(!nowCollapsed);
    });
}

function applyDocInfoCollapsed(collapsed) {
    const btn = document.getElementById("toggleDocInfoBtn");
    const content = document.getElementById("docInfoContent");
    if (!btn || !content) return;

    if (collapsed) {
        content.style.display = "none";
        btn.textContent = "+";
        btn.title = "Show document info";
    } else {
        content.style.display = "";
        btn.textContent = "−";
        btn.title = "Hide document info";
    }

    try {
        localStorage.setItem(STORAGE_KEYS.docInfoCollapsed, String(collapsed));
    } catch (e) {
        // ignore
    }
}

// -------- Editor collapse (XML / XSLT) --------

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

function initEditorSearchUI() {
    editorSearchUI.xml = {
        bar: document.getElementById("xmlSearchBar"),
        input: document.getElementById("xmlSearchInput"),
        count: document.getElementById("xmlSearchCount"),
        prevBtn: document.getElementById("xmlSearchPrevBtn"),
        nextBtn: document.getElementById("xmlSearchNextBtn"),
        closeBtn: document.getElementById("xmlSearchCloseBtn")
    };

    editorSearchUI.xslt = {
        bar: document.getElementById("xsltSearchBar"),
        input: document.getElementById("xsltSearchInput"),
        count: document.getElementById("xsltSearchCount"),
        prevBtn: document.getElementById("xsltSearchPrevBtn"),
        nextBtn: document.getElementById("xsltSearchNextBtn"),
        closeBtn: document.getElementById("xsltSearchCloseBtn")
    };

    ["xml", "xslt"].forEach(function (key) {
        const ui = editorSearchUI[key];
        if (!ui || !ui.bar) return;

        // typing → rebuild matches
        ui.input.addEventListener("input", function () {
            rebuildEditorSearch(key);
        });

        // Enter / Shift+Enter / Esc in the input
        ui.input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
                ev.preventDefault();
                if (ev.shiftKey) {
                    jumpEditorSearch(key, -1);
                } else {
                    jumpEditorSearch(key, +1);
                }
            } else if (ev.key === "Escape") {
                ev.preventDefault();
                closeEditorSearch(key);
            }
        });

        if (ui.nextBtn) {
            ui.nextBtn.addEventListener("click", function () {
                jumpEditorSearch(key, +1);
            });
        }
        if (ui.prevBtn) {
            ui.prevBtn.addEventListener("click", function () {
                jumpEditorSearch(key, -1);
            });
        }
        if (ui.closeBtn) {
            ui.closeBtn.addEventListener("click", function () {
                closeEditorSearch(key);
            });
        }

        if (ui.count) {
            ui.count.textContent = "0/0";
        }
    });

    // Keyboard shortcuts inside editors
    const searchKeyMap = {
        "Ctrl-F": function (cm) {
            openEditorSearch(cm);
        },
        "Cmd-F": function (cm) {
            openEditorSearch(cm);
        },
        "F3": function (cm) {
            nextEditorSearch(cm);
        },
        "Shift-F3": function (cm) {
            prevEditorSearch(cm);
        }
    };

    xmlEditor.addKeyMap(searchKeyMap);
    xsltEditor.addKeyMap(searchKeyMap);
}

// ---- Jump from log entry to editor line ----

let lastErrorHighlight = null;

function clearLastErrorHighlight() {
  if (
    lastErrorHighlight &&
    lastErrorHighlight.editor &&
    lastErrorHighlight.handle
  ) {
    lastErrorHighlight.editor.removeLineClass(
      lastErrorHighlight.handle,
      "background",
      "cm-error-line"
    );
  }
  lastErrorHighlight = null;
}

/**
 * Jump to a specific line/column in the XML or XSLT editor and
 * highlight the line for ~1 second.
 *
 * @param {"xml"|"xslt"} source
 * @param {number} line   1-based line number
 * @param {number} [column] 1-based column number (optional)
 */
function jumpToEditorLocation(source, line, column) {
  const editor = source === "xml" ? xmlEditor : xsltEditor;
  if (!editor) return;

  const lineNumber = parseInt(line, 10);
  if (!lineNumber || lineNumber < 1) return;

  const cmLine = lineNumber - 1;
  const ch = column && column > 0 ? column - 1 : 0;

  clearLastErrorHighlight();

  editor.focus();
  editor.setCursor({ line: cmLine, ch });
  editor.scrollIntoView({ line: cmLine, ch }, 80);

  const handle = editor.getLineHandle(cmLine);
  if (!handle) return;

  editor.addLineClass(handle, "background", "cm-error-line");
  lastErrorHighlight = { editor, handle };

  // Remove highlight after ~1 second
  setTimeout(() => {
    clearLastErrorHighlight();
  }, 1000);
}
