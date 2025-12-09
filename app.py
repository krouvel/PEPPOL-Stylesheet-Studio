from flask import Flask, render_template, request, jsonify
from lxml import etree
import subprocess
import tempfile
import os

app = Flask(__name__)

# ------------- CONFIG: Saxon integration -------------

BASE_DIR = os.path.dirname(__file__)

SAXON_ENABLED = True

SAXON_JAR_PATH = os.path.join(BASE_DIR, "tools", "saxon", "Saxon-HE-12.0.jar")
XMLRESOLVER_JAR_PATH = os.path.join(BASE_DIR, "tools", "saxon", "xmlresolver-5.2.1.jar")

# Absolute or relative path to your Saxon-HE jar
BASE_DIR = os.path.dirname(__file__)
SAXON_JAR_PATH = os.path.join(
    BASE_DIR,
    "tools",
    "saxon",
    "Saxon-HE-12.0.jar",    # your actual jar name
)

XMLRESOLVER_JAR_PATH = os.path.join(
    BASE_DIR,
    "tools",
    "saxon",
    "xmlresolver-5.2.1.jar"  # adjust to your actual xmlresolver jar name
)


# ------------- LXML (XSLT 1.0) ENGINE -------------

if SAXON_ENABLED:
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

def _log_xml_syntax_error(logs, source: str, e: Exception):
    """
    Pushes a formatted, single log line that includes source (xml/xslt)
    and line/column as a prefix like:
      [ERROR] [SRC:xml L:12 C:3] message...
    """
    line = None
    col = None

    pos = getattr(e, "position", None)
    if isinstance(pos, tuple) and len(pos) >= 2:
        line, col = pos[0], pos[1]

    base_msg = getattr(e, "msg", None) or str(e)

    if line is not None:
        logs.append(
            f"[ERROR] [SRC:{source} L:{line} C:{col}] {base_msg}"
        )
    else:
        logs.append(
            f"[ERROR] {source.upper()} syntax error: {base_msg}"
        )

    # Optional: extra lines from error_log if available
    try:
        for entry in getattr(e, "error_log", []) or []:
            if entry.line:
                logs.append(
                    f"{entry.level_name}: {entry.message.strip()} (line {entry.line})"
                )
            else:
                logs.append(
                    f"{entry.level_name}: {entry.message.strip()}"
                )
    except Exception:
        # best-effort only
        pass


def transform_with_lxml(xml_str: str, xslt_str: str):
    """
    Transform XML using lxml (libxslt, XSLT 1.0).

    Returns (html, logs, error_message). error_message is None on success.
    """
    logs = []
    try:
        if not xml_str.strip():
            msg = "XML content is empty."
            logs.append(msg)
            return "", logs, msg

        if not xslt_str.strip():
            msg = "XSLT content is empty."
            logs.append(msg)
            return "", logs, msg

        # Hint if stylesheet looks like XSLT 2.0/3.0
        if "xsl:function" in xslt_str:
            logs.append(
                "NOTE: Stylesheet uses xsl:function (XSLT 2.0/3.0 feature). "
                "The built-in Python engine (lxml/libxslt) is XSLT 1.0 only, "
                "so advanced PEPPOL stylesheets may not work correctly here."
            )

        # --- Parse XML with syntax error handling ---
        try:
            xml_doc = etree.fromstring(xml_str.encode("utf-8"))
        except etree.XMLSyntaxError as e:
            _log_xml_syntax_error(logs, "xml", e)
            return "", logs, str(e)

        # --- Parse XSLT with syntax error handling ---
        try:
            xslt_doc = etree.XML(xslt_str.encode("utf-8"))
        except etree.XMLSyntaxError as e:
            _log_xml_syntax_error(logs, "xslt", e)
            return "", logs, str(e)

        # --- Apply transform ---
        transform = etree.XSLT(xslt_doc)
        result_tree = transform(xml_doc)
        html = str(result_tree)
        return html, logs, None

    except etree.XSLTApplyError as e:
        logs.append(f"XSLTApplyError: {str(e)}")
        for entry in e.error_log:
            # add [SRC:xslt ...] prefix so it becomes clickable
            prefix = ""
            if entry.line:
                prefix = f"[SRC:xslt L:{entry.line}] "
            logs.append(
                f"{prefix}{entry.level_name}: "
                f"{entry.message.strip()} (line {entry.line})"
            )
        return "", logs, str(e)
    except Exception as e:
        logs.append(f"Unexpected error in lxml engine: {str(e)}")
        return "", logs, str(e)


# ------------- SAXON (XSLT 2.0/3.0) ENGINE -------------

def transform_with_saxon(xml_str: str, xslt_str: str):
    """
    Transform XML using Saxon-HE (via java -cp + net.sf.saxon.Transform).
    Returns (html, logs, error_message). error_message is None on success.
    """
    logs = []

    if not SAXON_ENABLED:
        msg = "Saxon engine is disabled in server configuration."
        logs.append(msg)
        return "", logs, msg

    if not os.path.exists(SAXON_JAR_PATH):
        msg = f"Saxon jar not found at: {SAXON_JAR_PATH}"
        logs.append(msg)
        return "", logs, msg

    if not os.path.exists(XMLRESOLVER_JAR_PATH):
        msg = f"XML Resolver jar not found at: {XMLRESOLVER_JAR_PATH}"
        logs.append(msg)
        return "", logs, msg

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            xml_path = os.path.join(tmpdir, "input.xml")
            xslt_path = os.path.join(tmpdir, "stylesheet.xslt")
            out_path = os.path.join(tmpdir, "output.html")

            # Write incoming strings to temp files
            with open(xml_path, "w", encoding="utf-8") as f:
                f.write(xml_str)
            with open(xslt_path, "w", encoding="utf-8") as f:
                f.write(xslt_str)

            # Build classpath: Saxon + xmlresolver
            classpath = os.pathsep.join([SAXON_JAR_PATH, XMLRESOLVER_JAR_PATH])

            cmd = [
                "java",
                "-cp",
                classpath,
                "net.sf.saxon.Transform",
                f"-s:{xml_path}",
                f"-xsl:{xslt_path}",
                f"-o:{out_path}",
            ]

            logs.append(f"Running Saxon command: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.stdout:
                logs.append("Saxon stdout:")
                logs.extend(["  " + line for line in result.stdout.splitlines()])

            if result.stderr:
                logs.append("Saxon stderr:")
                logs.extend(["  " + line for line in result.stderr.splitlines()])

            if result.returncode != 0:
                msg = f"Saxon exited with code {result.returncode}"
                logs.append(msg)
                return "", logs, msg

            if not os.path.exists(out_path):
                msg = "Saxon did not produce an output file."
                logs.append(msg)
                return "", logs, msg

            with open(out_path, "r", encoding="utf-8") as f:
                html = f.read()

            return html, logs, None

    except FileNotFoundError:
        msg = "Could not run 'java'. Make sure Java is installed and on PATH."
        logs.append(msg)
        return "", logs, msg
    except subprocess.TimeoutExpired:
        msg = "Saxon transformation timed out."
        logs.append(msg)
        return "", logs, msg
    except Exception as e:
        msg = f"Unexpected error in Saxon engine: {str(e)}"
        logs.append(msg)
        return "", logs, msg



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

    # Decide which engine to use
    use_saxon = SAXON_ENABLED and ui_version in ("2.0", "3.0")
    if use_saxon:
        engine = "saxon"
        logs.append(
            f"Using Saxon engine for XSLT {ui_version} (configured jar: {os.path.basename(SAXON_JAR_PATH)})."
        )
        html, eng_logs, error = transform_with_saxon(xml, xslt)
    else:
        engine_info = "lxml (XSLT 1.0)"
        if SAXON_ENABLED and ui_version in ("2.0", "3.0"):
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
