# tools/saxon/get_jars.py
import os
import pathlib
import urllib.request


BASE_DIR = pathlib.Path(__file__).resolve().parent

# You can bump versions here when needed
DEPENDENCIES = [
    {
        "name": "Saxon-HE",
        "version": "12.0",
        "filename": "Saxon-HE-12.0.jar",
        "url": "https://repo1.maven.org/maven2/net/sf/saxon/Saxon-HE/12.0/Saxon-HE-12.0.jar",
    },
    {
        "name": "xmlresolver",
        "version": "5.2.1",
        "filename": "xmlresolver-5.2.1.jar",
        "url": "https://repo1.maven.org/maven2/org/xmlresolver/xmlresolver/5.2.1/xmlresolver-5.2.1.jar",
    },
]


def download_file(url: str, dest: pathlib.Path, log):
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"Downloading {url} → {dest} ...")
    with urllib.request.urlopen(url) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    log(f"Saved: {dest.name}")


def ensure_saxon_jars(log_func=print):
    """
    Ensure Saxon-HE and xmlresolver jars exist in tools/saxon/.

    - If they already exist, nothing is downloaded.
    - If missing, they are downloaded from Maven Central.
    - log_func is used for messages (default: print).
    """
    log = log_func
    log("=== Checking Saxon + xmlresolver jars ===")
    for dep in DEPENDENCIES:
        dest = BASE_DIR / dep["filename"]
        if dest.exists():
            log(f"- {dep['name']} {dep['version']} already present: {dest.name}")
            continue
        log(f"- {dep['name']} {dep['version']} not found, downloading...")
        download_file(dep["url"], dest, log)
    log("=== Saxon jar check completed ===")


if __name__ == "__main__":
    # CLI usage: python tools/saxon/get_jars.py
    ensure_saxon_jars()
