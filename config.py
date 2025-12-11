# config.py
import os
from dataclasses import dataclass

BASE_DIR = os.path.dirname(__file__)

@dataclass
class SaxonConfig:
    # Enable/disable Saxon via env var, default = ON
    enabled: bool = bool(int(os.getenv("SAXON_ENABLED", "1")))

    # Paths to jars (can be overridden via env vars)
    saxon_jar: str = os.getenv(
        "SAXON_JAR_PATH",
        os.path.join(BASE_DIR, "tools", "saxon", "Saxon-HE-12.0.jar"),
    )
    xmlresolver_jar: str = os.getenv(
        "XMLRESOLVER_JAR_PATH",
        os.path.join(BASE_DIR, "tools", "saxon", "xmlresolver-5.2.1.jar"),
    )

    # Timeout for Saxon CLI (seconds)
    timeout_sec: int = int(os.getenv("SAXON_TIMEOUT", "30"))

SAXON = SaxonConfig()
