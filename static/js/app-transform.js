// app-transform.js
// Transform API calls, engine indicator, preview & zoom, layout switching

function updateEngineIndicator(engine, version) {
    const el = document.getElementById("engineIndicator");
    if (!el) return;
    el.classList.remove("engine-lxml", "engine-saxon", "engine-error");

    let text = "Engine: unknown";

    if (engine === "lxml") {
        el.classList.add("engine-lxml");
        text = "Engine: lxml (XSLT 1.0)";
    } else if (engine === "saxon") {
        el.classList.add("engine-saxon");
        text = `Engine: Saxon-HE (XSLT ${version})`;
    } else if (engine === "error") {
        el.classList.add("engine-error");
        text = "Engine: error";
    }

    el.textContent = text;
}

function scheduleTransform() {
    if (transformTimeout) {
        clearTimeout(transformTimeout);
    }
    transformTimeout = setTimeout(() => {
        doTransform();
    }, 500);
}

function doTransform() {
    const xml = xmlEditor.getValue();
    const xslt = xsltEditor.getValue();
    const xsltVersionSelect = document.getElementById("xsltVersionSelect");
    const version = xsltVersionSelect ? xsltVersionSelect.value : "1.0";

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

            const xsltVersionSelect = document.getElementById("xsltVersionSelect");
            const v = xsltVersionSelect ? xsltVersionSelect.value : "1.0";

            if (!ok || !data.ok) {
                updateEngineIndicator("error", v);
                addLog("Transformation failed.", "error");
                return;
            }

            if (data.engine) {
                updateEngineIndicator(data.engine, v);
            }

            lastHtml = data.html || "";
            updatePreview(lastHtml);
            saveState();
        })
        .catch((err) => {
            addLog("Network error during transform: " + err.message, "error");
        });
}

/**
 * Attach interactions inside the HTML preview document.
 * - Ctrl + Left click on any element will try to jump into the XSLT editor.
 */
function attachPreviewInteractions(doc) {
  if (!doc) return;

  doc.addEventListener("click", function (e) {
    // Only react on Ctrl + Left mouse button
    if (!e.ctrlKey || e.button !== 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    if (!target) return;

    const rawText = (target.textContent || "").trim();
    if (!rawText) {
      addLog(
        "Clicked preview element has no text to locate in XSLT.",
        "info"
      );
      return;
    }

    if (typeof jumpXsltToPreviewText !== "function") {
      addLog(
        "Cannot jump to XSLT – helper function is not available.",
        "error"
      );
      return;
    }

    // Best-effort: try to use the clicked text to locate the relevant part in XSLT
    jumpXsltToPreviewText(rawText);
  });
}

function updatePreview(html) {
    const frame = document.getElementById("previewFrame");
    if (!frame) return;

    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(html || "<!DOCTYPE html><html><body><p>No HTML result yet.</p></body></html>");
    doc.close();

  // Wire Ctrl+Click → XSLT jump inside the freshly written document
  attachPreviewInteractions(doc);

    const mainLayout = document.getElementById("mainLayout");
    const isHorizontal =
        mainLayout && mainLayout.classList.contains("main-layout-horizontal");

    applyPreviewZoom(doc);

    if (isHorizontal) {
        frame.style.height = "";
        return;
    }

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

function toggleLayout() {
    const mainLayout = document.getElementById("mainLayout");
    const frame = document.getElementById("previewFrame");
    const isHorizontal = mainLayout.classList.contains("main-layout-horizontal");

    mainLayout.classList.toggle("main-layout-horizontal", !isHorizontal);
    mainLayout.classList.toggle("main-layout-vertical", isHorizontal);

    if (!isHorizontal) {
        if (frame) {
            frame.style.height = "";
        }
    } else {
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
