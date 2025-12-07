# PEPPOL XML/XSLT HTML Playground

A small web UI to load **XML** and **XSLT** (e.g. PEPPOL stylesheets), transform them to **HTML**, and preview the result in the browser.

It supports:

- Local XSLT 1.0 transformations using **lxml/libxslt**  
- Optional XSLT 2.0 / 3.0 transformations using **Saxon-HE**  
- Syntax-highlighted editors for XML and XSLT  
- Live HTML preview, exports, and layout controls

---

## Features

- **Two editors + preview**
  - Left: XML editor
  - Left: XSLT editor (with image helper)
  - Right: HTML preview, updated automatically or manually

- **Config panel in header**
  - Auto-update on change / manual _Generate HTML_ button
  - Export XML / XSLT / HTML with timestamped filenames
  - Stylesheet version dropdown (1.0 / 2.0 / 3.0)
  - Layout toggle: left/right (horizontal) or top/bottom (vertical)
  - Helpers:
    - Clear XML & XSLT
    - Load simple (XSLT 1.0) sample
    - **Sample for Saxon** (PEPPOL XML/XSLT from `samples/Saxon`)

- **Developer experience**
  - Syntax highlighting via CodeMirror
  - `Ctrl + Space` completion helper for common tags and attributes
  - Auto-closing XML/XSLT tags
  - Resizable log panel, editor panes, and HTML preview
  - State is stored in browser `localStorage` (XML, XSLT, HTML, layout, auto-update, etc.)

- **PEPPOL & Saxon**
  - For **XSLT 1.0** stylesheets, transformations run with lxml/libxslt
  - For **XSLT 2.0/3.0** stylesheets (e.g. official PEPPOL viewer XSLT), you can enable **Saxon-HE** and use the “Sample for Saxon” button

---

## Project structure

```text
project-root/
├─ app.py
├─ requirements.txt
├─ README.md
├─ samples/
│  └─ Saxon/
│     ├─ peppol-invoice.xml
│     └─ peppol-stylesheet.xslt
├─ templates/
│  ├─ index.html
│  └─ partials/
│     ├─ header.html
│     ├─ main.html
│     └─ footer.html
└─ static/
   ├─ css/
   │  └─ main.css
   └─ js/
      └─ app.js
