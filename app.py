from flask import Flask, render_template, request, jsonify
import os

from config import SAXON, BASE_DIR
from peppol_stylesheet_studio.engines import (
    transform_with_lxml,
    transform_with_saxon,
)

app = Flask(__name__)

# Maximum length (in characters) for XML and XSLT payloads.
# Adjust as needed – 10_000_000 chars ~ 10MB of text.
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "10000000"))


# ------------- LXML (XSLT 1.0) ENGINE -------------

if SAXON.enabled:
    try:
        from tools.saxon.get_jars import ensure_saxon_jars

        def _log(msg):
            # you can later hook this into your UI log if you want,
            # for now it's just console output
            print(msg)

        ensure_saxon_jars(log_func=_log)
    except Exception as e:
        # Don't crash app if download fails (no internet, etc.)
        print(f"[WARN] Could not ensure Saxon jars: {e}")

# ------------- FLASK ROUTES -------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/transform", methods=["POST"])
def api_transform():
    data = request.get_json(force=True) or {}
    xml = data.get("xml", "")
    xslt = data.get("xslt", "")
    ui_version = data.get("version", "1.0")

    logs = []
    engine = "lxml"

    # --- Guardrail: limit input size to protect the server ---
    total_len = len(xml) + len(xslt)
    if total_len > MAX_INPUT_CHARS:
        msg = (
            f"Input too large: XML + XSLT is {total_len} characters. "
            f"Limit is {MAX_INPUT_CHARS}."
        )
        logs.append(f"[ERROR] {msg}")
        # 413 = Payload Too Large
        return (
            jsonify({"ok": False, "html": "", "log": logs, "engine": engine}),
            413,
        )

    # Decide which engine to use
    use_saxon = SAXON.enabled and ui_version in ("2.0", "3.0")
    if use_saxon:
        engine = "saxon"
        logs.append(
            f"Using Saxon engine for XSLT {ui_version} (configured jar: {os.path.basename(SAXON.saxon_jar)})."
        )
        html, eng_logs, error = transform_with_saxon(xml, xslt)
    else:
        engine_info = "lxml (XSLT 1.0)"
        if SAXON.enabled and ui_version in ("2.0", "3.0"):
            engine_info += " [Saxon available but not selected]"
        logs.append(f"Using {engine_info}.")
        html, eng_logs, error = transform_with_lxml(xml, xslt)

    logs.extend(eng_logs)

    if error:
        logs.append("[ERROR] Transform failed.")
        return jsonify({"ok": False, "html": "", "log": logs, "engine": engine}), 400

    logs.append("[INFO] Transform succeeded.")
    return jsonify({"ok": True, "html": html, "log": logs, "engine": engine})


@app.route("/api/sample/saxon", methods=["GET"])
def api_sample_saxon():
    """
    Return the PEPPOL sample XML + XSLT from samples/Saxon.
    """
    base_dir = os.path.dirname(__file__)
    xml_path = os.path.join(base_dir, "samples", "Saxon", "peppol-invoice.xml")
    xslt_path = os.path.join(base_dir, "samples", "Saxon", "peppol-stylesheet.xslt")

    try:
        with open(xml_path, "r", encoding="utf-8") as f:
            xml = f.read()
        with open(xslt_path, "r", encoding="utf-8") as f:
            xslt = f.read()
    except FileNotFoundError:
        return jsonify({
            "ok": False,
            "message": "Saxon sample files not found in samples/Saxon."
        }), 404

    return jsonify({
        "ok": True,
        "xml": xml,
        "xslt": xslt
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
