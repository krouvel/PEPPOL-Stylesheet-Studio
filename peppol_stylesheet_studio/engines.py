# engines.py
from lxml import etree
import subprocess
import tempfile
import os

from config import SAXON, BASE_DIR

# Use a hardened XML parser for untrusted input.
# - resolve_entities=False: do not expand external entities (avoids XXE).
# - load_dtd=False / dtd_validation=False: do not load or validate against DTDs.
# - no_network=True: do not access the network to load external entities.
# - huge_tree=False: keep libxml2 safety limits to avoid XML bombs.
SECURE_XML_PARSER = etree.XMLParser(
    resolve_entities=False,
    load_dtd=False,
    dtd_validation=False,
    no_network=True,
    huge_tree=False,
)


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
            xml_doc = etree.fromstring(xml_str.encode("utf-8"), parser=SECURE_XML_PARSER)
        except etree.XMLSyntaxError as e:
            _log_xml_syntax_error(logs, "xml", e)
            return "", logs, str(e)

        # --- Parse XSLT with syntax error handling ---
        try:
            xslt_doc = etree.XML(xslt_str.encode("utf-8"), parser=SECURE_XML_PARSER)
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

def transform_with_saxon(xml_str: str, xslt_str: str):
    """
    Transform XML using Saxon-HE (via java -cp + net.sf.saxon.Transform).
    Returns (html, logs, error_message). error_message is None on success.
    """
    logs = []

    if not SAXON.enabled:
        msg = "Saxon engine is disabled in server configuration."
        logs.append(msg)
        return "", logs, msg

    if not os.path.exists(SAXON.saxon_jar):
        msg = f"Saxon jar not found at: {SAXON.saxon_jar}"
        logs.append(msg)
        return "", logs, msg

    if not os.path.exists(SAXON.xmlresolver_jar):
        msg = f"XML Resolver jar not found at: {SAXON.xmlresolver_jar}"
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
            classpath = os.pathsep.join([SAXON.saxon_jar, SAXON.xmlresolver_jar])

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
                timeout=SAXON.timeout_sec
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
