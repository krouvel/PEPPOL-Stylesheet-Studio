// app-ui.js
// Buttons, config/log visibility, state save/restore, bootstrap

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
    const loadXmlFileBtn = document.getElementById("loadXmlFileBtn");
    const loadXsltFileBtn = document.getElementById("loadXsltFileBtn");
    const xmlFileInput = document.getElementById("xmlFileInput");
    const xsltFileInput = document.getElementById("xsltFileInput");
    const themeToggle = document.getElementById("themeToggle");

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
            updateDocumentInfoFromXml();
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
                    updateDocumentInfoFromXml();
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

            const visible = !panel.classList.contains("config-hidden");
            try {
                localStorage.setItem(STORAGE_KEYS.configVisible, String(visible));
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

    if (loadXmlFileBtn && xmlFileInput) {
        loadXmlFileBtn.addEventListener("click", () => {
            xmlFileInput.click();
        });
        xmlFileInput.addEventListener("change", () => {
            const file = xmlFileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result || "";
                xmlEditor.setValue(text);
                updateDocumentInfoFromXml();
                addLog(`Loaded XML from file: ${file.name}`, "info");
                saveState();
                if (autoUpdate) {
                    scheduleTransform();
                } else {
                    addLog("Auto-update is off – click 'Generate HTML' to apply changes.", "info");
                }
            // allow selecting the same file again next time
            xmlFileInput.value = "";
            };
            reader.readAsText(file);
        });
    }

    if (loadXsltFileBtn && xsltFileInput) {
        loadXsltFileBtn.addEventListener("click", () => {
            xsltFileInput.click();
        });
        xsltFileInput.addEventListener("change", () => {
            const file = xsltFileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result || "";
                xsltEditor.setValue(text);
                autoDetectXsltVersion();
                addLog(`Loaded XSLT from file: ${file.name}`, "info");
                saveState();
                if (autoUpdate) {
                    scheduleTransform();
                } else {
                    addLog("Auto-update is off – click 'Generate HTML' to apply changes.", "info");
                }
                // allow selecting the same file again next time
                xsltFileInput.value = "";
            };
            reader.readAsText(file);
        });
    }

    if (themeToggle) {
        // currently disabled, but keep handler for future when enabling dark mode
        themeToggle.addEventListener("change", () => {
            setTheme(themeToggle.checked ? "dark" : "light");
        });
    }
}

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
        loadSampleContent();
    }

    if (storedXslt !== null) {
        xsltEditor.setValue(storedXslt);
    }

    updateDocumentInfoFromXml();

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

    const xsltVersionSelectEl = document.getElementById("xsltVersionSelect");
    const version = xsltVersionSelectEl ? xsltVersionSelectEl.value : "1.0";
    updateEngineIndicator("lxml", version);

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

// ---- bootstrap & shortcuts ----

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initEditors();
    initUI();
    restoreState();
    initConfigPanelVisibility();
    initLogPanelVisibility();
    restorePreviewZoom();
    initDocInfoCollapse();
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
