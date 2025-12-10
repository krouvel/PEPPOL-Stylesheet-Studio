// app-editors.js
// CodeMirror editors, XML/XSLT helpers, doc info, collapse logic, preview→XSLT jump

let lastXsltJumpHighlight = null;

/* -------- CodeMirror hint for XML/XSLT -------- */

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
    xml: {query: "", matches: [], index: -1, markers: []},
    xslt: {query: "", matches: [], index: -1, markers: []}
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
        const marker = editor.markText(from, to, {className: "cm-search-highlight"});

        state.matches.push({from, to});
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

    xmlEditor.on("change", () => {
        if (xmlViewMode !== "tree") return;
        if (xmlTreeRenderTimeout) {
            clearTimeout(xmlTreeRenderTimeout);
        }
        xmlTreeRenderTimeout = setTimeout(() => {
            renderXmlTree();
        }, 400);
    });

    const xmlWrapper = xmlEditor.getWrapperElement();
    if (xmlWrapper) {
        xmlWrapper.classList.add("xml-editor-wrapper");
    }

    const hintKeymap = {
        "Ctrl-Space": function (cm) {
            CodeMirror.showHint(cm, xmlXsltHint, {completeSingle: true});
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

    // XML Text/Tree view toggle
    initXmlViewToggle();

    // Persist panel heights (shared helper from app-core.js)
    if (typeof setupPanelHeightPersistence === "function") {
        // XML editor: also mirror height to the Tree container when present
        setupPanelHeightPersistence({
            element: xmlEditor.getWrapperElement(),
            storageKey: XML_PANEL_HEIGHT_KEY,
            minHeight: 80,
            maxHeight: 2000,
            mirrorElements: xmlTreeContainer ? [xmlTreeContainer] : [],
            refreshFn: () => xmlEditor.refresh()
        });

        // XSLT editor
        setupPanelHeightPersistence({
            element: xsltEditor.getWrapperElement(),
            storageKey: XSLT_PANEL_HEIGHT_KEY,
            minHeight: 80,
            maxHeight: 2000,
            refreshFn: () => xsltEditor.refresh()
        });
    }
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

/* -------- Preview → XSLT jump (Ctrl+click in preview) -------- */

function clearXsltJumpHighlight() {
  if (!xsltEditor || lastXsltJumpHighlight == null) return;

  try {
    xsltEditor.removeLineClass(
      lastXsltJumpHighlight,
      "background",
      "cm-preview-jump-line"
    );
  } catch (e) {
    // ignore
  }
  lastXsltJumpHighlight = null;
}

/**
 * Best-effort: use clicked preview text to locate the corresponding place in XSLT.
 * Works well for static labels/headings that also exist literally in the stylesheet.
 */
function jumpXsltToPreviewText(rawText) {
  if (!xsltEditor) {
    addLog("XSLT editor is not ready, cannot jump from preview.", "error");
    return;
  }

  const text = (rawText || "").replace(/\s+/g, " ").trim();
  if (!text) {
    addLog("Clicked preview element has no text to locate in XSLT.", "info");
    return;
  }

  const content = xsltEditor.getValue();
  if (!content) {
    addLog(
      "XSLT editor is empty, cannot locate clicked preview content.",
      "info"
    );
    return;
  }

  // First try: a reasonable-length prefix of the whole text
  let snippet = text.length <= 80 ? text : text.slice(0, 80);
  let index = content.indexOf(snippet);

  // Second try: longest “word” (>= 4 chars)
  if (index === -1) {
    const words = text
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .sort((a, b) => b.length - a.length);

    for (let i = 0; i < words.length; i++) {
      index = content.indexOf(words[i]);
      if (index !== -1) {
        snippet = words[i];
        break;
      }
    }
  }

  if (index === -1) {
    addLog("Could not locate clicked preview content in XSLT.", "warning");
    return;
  }

  const pos = xsltEditor.posFromIndex(index);

  clearXsltJumpHighlight();
  lastXsltJumpHighlight = xsltEditor.addLineClass(
    pos.line,
    "background",
    "cm-preview-jump-line"
  );

  xsltEditor.scrollIntoView({ line: pos.line, ch: pos.ch }, 100);
  xsltEditor.setCursor(pos);
  xsltEditor.focus();

  addLog("Jumped to XSLT using clicked preview text.", "info");
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

    if (editorInstance === xmlEditor && xmlTreeContainer) {
        if (collapsed) {
            xmlTreeContainer.style.display = "none";
        } else {
            xmlTreeContainer.style.display = "";
        }
    }

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

// -------- XML Text / Tree view toggle --------

function initXmlViewToggle() {
    if (!xmlEditor) return;

    const collapseBtn = document.getElementById("collapseXmlBtn");
    const xmlWrapper = xmlEditor.getWrapperElement();
    if (!collapseBtn || !xmlWrapper) return;

    // ---- Build header toggle: [Text] [Tree] ----
    const header = collapseBtn.parentElement || collapseBtn.closest(".editor-header") || collapseBtn;
    const toggleWrapper = document.createElement("div");
    toggleWrapper.className = "xml-view-toggle";

    const textBtn = document.createElement("button");
    textBtn.type = "button";
    textBtn.className = "btn-sm xml-view-toggle-btn";
    textBtn.textContent = "Text";

    const treeBtn = document.createElement("button");
    treeBtn.type = "button";
    treeBtn.className = "btn-sm xml-view-toggle-btn";
    treeBtn.textContent = "Tree";

    toggleWrapper.appendChild(textBtn);
    toggleWrapper.appendChild(treeBtn);

    // Put the toggle before the collapse button in the header
    header.insertBefore(toggleWrapper, collapseBtn);

    // ---- Build tree container below XML editor ----
    xmlTreeContainer = document.createElement("div");
    xmlTreeContainer.id = "xmlTreeContainer";
    xmlTreeContainer.className = "xml-tree-container";

    // Toolbar with XPath display + copy button
    const toolbar = document.createElement("div");
    toolbar.className = "xml-tree-toolbar";

    xmlTreePathLabel = document.createElement("div");
    xmlTreePathLabel.className = "xml-tree-path";
    xmlTreePathLabel.textContent = "XPath: —";
    xmlTreePathLabel.dataset.xpath = "";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-sm xml-tree-copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
        const xpath = xmlTreePathLabel.dataset.xpath || "";
        if (!xpath) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(xpath)
                .then(() => addLog("Copied XPath to clipboard.", "info"))
                .catch(() => {
                    // fall back for weird/old browsers or non-secure context
                    fallbackCopyToClipboard(xpath);
                });
        } else {
            // no modern clipboard → fallback
            fallbackCopyToClipboard(xpath);
        }
    });


    toolbar.appendChild(xmlTreePathLabel);
    toolbar.appendChild(copyBtn);

    const treeRoot = document.createElement("ul");
    treeRoot.className = "xml-tree-root";

    xmlTreeContainer.appendChild(toolbar);
    xmlTreeContainer.appendChild(treeRoot);

    // Insert after CodeMirror wrapper
    xmlWrapper.parentNode.insertBefore(xmlTreeContainer, xmlWrapper.nextSibling);

    // ---- Mode switching ----
    function applyViewMode(mode) {
        xmlViewMode = mode;
        try {
            localStorage.setItem("peppol_xml_view_mode", mode);
        } catch (e) {
            // ignore storage errors
        }

        const body = document.body;
        body.classList.remove("xml-view-mode-text", "xml-view-mode-tree");
        body.classList.add(mode === "tree" ? "xml-view-mode-tree" : "xml-view-mode-text");

        // Active button style
        if (mode === "tree") {
            textBtn.classList.remove("active");
            treeBtn.classList.add("active");
            renderXmlTree();
        } else {
            textBtn.classList.add("active");
            treeBtn.classList.remove("active");
            // Ensure CodeMirror refreshes when coming back
            setTimeout(() => xmlEditor.refresh(), 0);
        }
    }

    function fallbackCopyToClipboard(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        let ok = false;
        try {
            ok = document.execCommand("copy");
        } catch (e) {
            ok = false;
        }

        document.body.removeChild(textarea);

        if (ok) {
            addLog("Copied XPath to clipboard.", "info");
        } else {
            addLog("Could not copy XPath to clipboard.", "error");
        }
    }


    textBtn.addEventListener("click", () => applyViewMode("text"));
    treeBtn.addEventListener("click", () => applyViewMode("tree"));

    // Restore last mode from localStorage (default: text)
    let stored = null;
    try {
        stored = localStorage.getItem("peppol_xml_view_mode");
    } catch (e) {
        // ignore
    }
    applyViewMode(stored === "tree" ? "tree" : "text");
}

function renderXmlTree() {
    if (!xmlTreeContainer || !xmlEditor) return;

    const listRoot = xmlTreeContainer.querySelector(".xml-tree-root");
    if (!listRoot) return;

    const xml = xmlEditor.getValue();
    listRoot.innerHTML = "";
    xmlTreeSelectedItem = null;
    if (xmlTreePathLabel) {
        xmlTreePathLabel.textContent = "XPath: —";
        xmlTreePathLabel.dataset.xpath = "";
    }

    if (!xml.trim()) {
        const li = document.createElement("li");
        li.textContent = "No XML loaded.";
        li.className = "xml-tree-empty";
        listRoot.appendChild(li);
        return;
    }

    let doc;
    try {
        const parser = new DOMParser();
        doc = parser.parseFromString(xml, "application/xml");
    } catch (e) {
        const li = document.createElement("li");
        li.textContent = "Could not parse XML.";
        li.className = "xml-tree-error";
        listRoot.appendChild(li);
        return;
    }

    // Check for parsererror (browser dependent)
    if (doc.getElementsByTagName("parsererror").length) {
        const li = document.createElement("li");
        li.textContent = "XML contains parse errors – tree view is unavailable.";
        li.className = "xml-tree-error";
        listRoot.appendChild(li);
        return;
    }

    const root = doc.documentElement;
    if (!root) {
        const li = document.createElement("li");
        li.textContent = "No root element found.";
        li.className = "xml-tree-empty";
        listRoot.appendChild(li);
        return;
    }

    const rootItem = buildXmlTreeItem(root);
    if (rootItem) {
        listRoot.appendChild(rootItem);
    }
}

function buildXmlTreeItem(node) {
    if (!node || node.nodeType !== 1) return null; // elements only

    const li = document.createElement("li");
    li.className = "xml-tree-item";

    const label = document.createElement("div");
    label.className = "xml-tree-node";

    const hasChildElements = Array.from(node.childNodes).some(
        (n) => n.nodeType === 1
    );

    const toggle = document.createElement("span");
    toggle.className = "xml-tree-toggle";
    toggle.textContent = hasChildElements ? "▾" : "·";

    const nameSpan = document.createElement("span");
    nameSpan.className = "xml-tree-name";
    nameSpan.textContent = node.tagName;

    label.appendChild(toggle);
    label.appendChild(nameSpan);
    li.appendChild(label);

    const metaSpan = document.createElement("span");
    metaSpan.className = "xml-tree-meta";

    // Attributes: @attr="value"
    const attrParts = [];
    if (node.attributes && node.attributes.length) {
        for (let i = 0; i < node.attributes.length; i++) {
            const a = node.attributes[i];
            if (!a) continue;
            attrParts.push(`${a.name}="${a.value}"`);
        }
    }

    // Direct text content (ignoring child elements)
    const textParts = [];
    Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
            const txt = child.nodeValue.trim();
            if (txt) textParts.push(txt);
        }
    });
    let textSnippet = textParts.join(" ");
    if (textSnippet.length > 80) {
        textSnippet = textSnippet.slice(0, 77) + "…";
    }

    let snippet = "";
    if (attrParts.length) {
        snippet += " @" + attrParts.join(" @");
    }
    if (textSnippet) {
        snippet += (snippet ? " " : "") + `"${textSnippet}"`;
    }

    if (snippet) {
        metaSpan.textContent = " " + snippet;
        label.appendChild(metaSpan);
    }

    // XPath for this node
    const xpath = buildXPathForElement(node);
    li.dataset.xpath = xpath;

    const childrenUl = document.createElement("ul");
    childrenUl.className = "xml-tree-children";

    if (hasChildElements) {
        Array.from(node.childNodes).forEach((child) => {
            if (child.nodeType === 1) {
                const childLi = buildXmlTreeItem(child);
                if (childLi) childrenUl.appendChild(childLi);
            }
        });
    }

    if (hasChildElements && childrenUl.childNodes.length) {
        li.appendChild(childrenUl);
    } else {
        childrenUl.remove();
        toggle.classList.add("xml-tree-toggle-leaf");
    }

    // Click behaviour: select + toggle children
    label.addEventListener("click", (ev) => {
        ev.stopPropagation();

        if (hasChildElements && childrenUl) {
            const collapsed = li.classList.toggle("collapsed");
            toggle.textContent = collapsed ? "▸" : "▾";
        }

        if (xmlTreeSelectedItem) {
            xmlTreeSelectedItem.classList.remove("selected");
        }
        xmlTreeSelectedItem = li;
        li.classList.add("selected");

        if (xmlTreePathLabel) {
            xmlTreePathLabel.textContent = "XPath: " + xpath;
            xmlTreePathLabel.dataset.xpath = xpath;
        }

    });

    return li;
}

function buildXPathForElement(node) {
    if (!node || node.nodeType !== 1) return "";

    const segments = [];

    let current = node;
    while (current && current.nodeType === 1) {
        let index = 1;
        let sibling = current.previousSibling;
        while (sibling) {
            if (sibling.nodeType === 1 && sibling.nodeName === current.nodeName) {
                index++;
            }
            sibling = sibling.previousSibling;
        }

        const name = current.prefix
            ? current.prefix + ":" + current.localName
            : current.localName || current.nodeName;

        segments.unshift(index > 1 ? name + "[" + index + "]" : name);
        current = current.parentNode;
        if (current && current.nodeType === 9) break; // Document
    }

    return "/" + segments.join("/");
}

function initLogPanelHeightPersistence() {
    const panel = document.getElementById("log-panel");
    if (!panel || typeof setupPanelHeightPersistence !== "function") return;

    setupPanelHeightPersistence({
        element: panel,
        storageKey: LOG_PANEL_HEIGHT_KEY,
        minHeight: 60,
        maxHeight: 1000
    });
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
    editor.setCursor({line: cmLine, ch});
    editor.scrollIntoView({line: cmLine, ch}, 80);

    const handle = editor.getLineHandle(cmLine);
    if (!handle) return;

    editor.addLineClass(handle, "background", "cm-error-line");
    lastErrorHighlight = {editor, handle};

    // Remove highlight after ~1 second
    setTimeout(() => {
        clearLastErrorHighlight();
    }, 1000);
}

document.addEventListener("DOMContentLoaded", initLogPanelHeightPersistence);