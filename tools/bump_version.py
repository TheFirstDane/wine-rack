#!/usr/bin/env python3
"""Setzt die App-Version in sw.js und js/constants.js gleichzeitig.

Aufruf (im Projektordner):  python3 tools/bump_version.py 0.5.0
Danach committen und veröffentlichen; die App meldet dann "Neue Version verfügbar".
"""
import re
import sys
from pathlib import Path

if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
    sys.exit("Aufruf: python3 tools/bump_version.py <Version>   z. B. 0.5.0")

version = sys.argv[1]
root = Path(__file__).resolve().parent.parent
for path, pattern in [
    (root / "sw.js", r"(const VERSION = ')[^']+(')"),
    (root / "js" / "constants.js", r"(export const APP_VERSION = ')[^']+(')"),
]:
    text = path.read_text()
    new, n = re.subn(pattern, rf"\g<1>{version}\g<2>", text)
    if n != 1:
        sys.exit(f"Version in {path.name} nicht gefunden.")
    path.write_text(new)
    print(f"{path.relative_to(root)} → {version}")
