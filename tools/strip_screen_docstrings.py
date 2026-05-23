#!/usr/bin/env python3
"""Strip docstring literals appearing as the first child of a `screen` block.

Ren'Py screen language treats free-floating string literals as `text`
displays.  DDLCModTemplate2.0 ships .rpy files that use triple-quoted
strings as docstrings, which Ren'Py 8.2.x rejects outright and 8.3+
silently renders as on-screen text.  Either way it's broken — strip them.
"""
from __future__ import annotations
import re
import sys
import pathlib


SCREEN_RE = re.compile(r'^([ \t]*)screen\s+\w[^\n]*:\s*$', re.M)


def strip(src: str) -> str:
    """Remove triple-quoted docstring(s) immediately after `screen X(...):`."""
    out = []
    lines = src.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = SCREEN_RE.match(line)
        if not m:
            i += 1
            continue
        # Scan ahead, skipping blank lines, until we find a non-blank line
        j = i + 1
        while j < len(lines) and lines[j].strip() == '':
            j += 1
        if j >= len(lines):
            i += 1
            continue
        stripped = lines[j].strip()
        if not (stripped.startswith('"""') or stripped.startswith("'''")):
            i += 1
            continue
        quote = stripped[:3]
        # Single-line docstring?
        if len(stripped) > 3 and stripped.endswith(quote) and stripped.count(quote) >= 2:
            # Replace docstring with blank line
            for k in range(i + 1, j):
                out.append(lines[k])
            out.append('\n')
            i = j + 1
            continue
        # Multi-line docstring — find closing quote
        end = j + 1
        while end < len(lines) and quote not in lines[end]:
            end += 1
        if end >= len(lines):
            i += 1
            continue
        # Drop lines [j..end] (inclusive)
        for k in range(i + 1, j):
            out.append(lines[k])
        out.append('\n')
        i = end + 1
    return ''.join(out)


def main():
    paths = [pathlib.Path(p) for p in sys.argv[1:]]
    if not paths:
        print("usage: strip_screen_docstrings.py <file.rpy> [...]")
        sys.exit(1)
    changed = 0
    for p in paths:
        src = p.read_text(encoding='utf-8')
        new = strip(src)
        if new != src:
            p.write_text(new, encoding='utf-8')
            print(f"  stripped {p}")
            changed += 1
    print(f"{changed} file(s) modified")


if __name__ == '__main__':
    main()
