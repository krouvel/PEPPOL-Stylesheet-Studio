# PEPPOL XML/XSLT HTML Playground

A small web UI to load **XML** and **XSLT** (e.g. PEPPOL stylesheets), transform them to **HTML**, and preview the result in the browser.

It supports:

- Local XSLT 1.0 transformations using **lxml/libxslt**  
- Optional XSLT 2.0 / 3.0 transformations using **Saxon-HE** (Java)  
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
  - For **XSLT 1.0** stylesheets, transformations run with lxml/libxslt (pure Python side)
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
```

---

## Requirements

### Python dependencies

Defined in `requirements.txt`:

- `Flask` – web server
- `lxml` – XSLT 1.0 engine (libxslt)

```txt
# requirements.txt

# Python dependencies
Flask>=3.0.0
lxml>=5.0.0

# Non-Python dependencies (install separately):
# - Java 11+ runtime
# - Saxon-HE 12.x jar (download from Saxonica)
# - xmlresolver 5.x jar (download from xmlresolver.org or Maven Central)
```

Install them with:

```bash
pip install -r requirements.txt
```

### Non-Python dependencies (for XSLT 2.0 / 3.0)

To run PEPPOL / XSLT 2.0 / 3.0 stylesheets you also need:

- **Java** – JDK or JRE (Java 11+ recommended)
- **Saxon-HE** 12.x (e.g. `Saxon-HE-12.0.jar`)
- **xmlresolver** 5.x (e.g. `xmlresolver-5.2.1.jar`)

These are **not** installed via `pip`. You download the jars and place them in your project tree.

Recommended layout:

```text
tools/
  saxon/
    Saxon-HE-12.0.jar
    xmlresolver-5.2.1.jar
```

> 💡 Add the jars to `.gitignore` so they are **not committed** into your GitHub repo:
>
> ```gitignore
> tools/saxon/*.jar
> ```

---

## Installation

1. Clone or download the repository:

   ```bash
   git clone https://github.com/your-user/peppol-xml-xslt-html-playground.git
   cd peppol-xml-xslt-html-playground
   ```

2. Create & activate a virtual environment (optional but recommended):

   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scriptsctivate
   # macOS / Linux:
   source .venv/bin/activate
   ```

3. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. (Optional, for Saxon) Place Java jars:

   ```text
   tools/
     saxon/
       Saxon-HE-12.0.jar
       xmlresolver-5.2.1.jar
   ```

---

## Running the app locally

From the project root:

```bash
python app.py
```

The server starts on:

- `http://localhost:8000` on your machine  
- `http://<your-ip>:8000` for other devices on the same Wi-Fi (because `host="0.0.0.0"`)

Open the URL in a browser.

---

## XSLT engines

### 1. lxml/libxslt (XSLT 1.0 – default)

- Always available with `lxml`.
- Suitable for simple XSLT 1.0 stylesheets.
- If the XSLT uses 2.0/3.0 features (like `xsl:function`), the log will show warnings and libxslt may fail.

The server selects this engine when:

- SAXON_ENABLED is `False` in `app.py`, or
- The UI “Stylesheet version” selector is set to `1.0`.

### 2. Saxon-HE (XSLT 2.0 / 3.0 – optional)

To run PEPPOL or other advanced XSLT 2.0/3.0 stylesheets:

1. **Install Java**

   Install a JDK or JRE (e.g. Temurin, Oracle JDK, etc.).

   Verify:

   ```bash
   java -version
   ```

2. **Download Saxon-HE & xmlresolver**

   Place them under `tools/saxon`:

   ```text
   tools/
     saxon/
       Saxon-HE-12.0.jar      # adjust name to your jar
       xmlresolver-5.2.1.jar  # or another 5.x version
   ```

3. **Configure `app.py`**

   In `app.py`, set and adjust paths:

   ```python
   SAXON_ENABLED = True

   BASE_DIR = os.path.dirname(__file__)
   SAXON_JAR_PATH = os.path.join(
       BASE_DIR, "tools", "saxon", "Saxon-HE-12.0.jar"
   )
   XMLRESOLVER_JAR_PATH = os.path.join(
       BASE_DIR, "tools", "saxon", "xmlresolver-5.2.1.jar"
   )
   ```

   The app will run Saxon using a command similar to:

   ```bash
   java -cp Saxon-HE-12.0.jar;xmlresolver-5.2.1.jar net.sf.saxon.Transform ...
   ```

4. **Using Saxon in the UI**

   - Load an XSLT 2.0/3.0 stylesheet (e.g. the PEPPOL sample).
   - The UI auto-detects `version="2.0"` or `version="3.0"` and sets the “Stylesheet version” dropdown.
   - When that dropdown is `2.0` or `3.0` and `SAXON_ENABLED = True`, the backend uses Saxon for the transformation.

If Saxon or xmlresolver is missing or misconfigured, the header log panel will show details from `java` / Saxon (stack traces, return codes, etc.).

---

## Samples

- **Load simple sample** – loads a tiny XSLT 1.0 example embedded in `app.js`.
- **Sample for Saxon** – loads:
  - `samples/Saxon/peppol-invoice.xml`
  - `samples/Saxon/peppol-stylesheet.xslt`

These are intended to run with Saxon (XSLT 2.0/3.0), not libxslt.

---

## Keyboard shortcuts & UX tips

- **Ctrl + Space** inside XML or XSLT editors:
  - Shows a small completion list of common tags and attributes (`html`, `xsl:template`, `width`, `height`, etc.).
  - If there is only one match, it auto-completes.

- **Auto-update on change**:
  - When enabled, any edit in XML/XSLT triggers a debounced transform.
  - When disabled, the **Generate HTML** button becomes active.

- **Layout toggle**:
  - Side-by-side (left/right) for wide screens.
  - Stacked (top/bottom) for smaller screens or when you want more vertical space.

- **Resizable UI**:
  - Drag the bottom edge of the log panel, editors, or preview to adjust their height.
  - HTML preview has a minimum height of about **10 cm** and can be resized taller.

- **Go up button** in the footer scrolls back to the top of the page.

---

## Deployment options

This project uses a Python backend (Flask) and Java (for Saxon), so it **cannot** run directly on GitHub Pages (which is static HTML/CSS/JS only).

Typical options are:

- **Render, Railway, Fly.io, etc.** – free/low-cost platforms that can run Python web apps connected to your GitHub repo.
- **GitHub Codespaces** – launch the project in a cloud dev environment and run `python app.py` from there.
- **Your own server / VPS / Docker** – build a small Docker image and run it anywhere you like.

If you ever rewrite the XSLT logic to run in pure JavaScript (for example via Saxon-JS), the app could be hosted entirely on GitHub Pages as a static site.

