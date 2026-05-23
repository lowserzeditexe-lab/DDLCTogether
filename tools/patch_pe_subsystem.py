#!/usr/bin/env python3
"""Patch a PE executable to use the Windows GUI subsystem (2) instead of
Console (3).  Equivalent to MSVC `editbin /SUBSYSTEM:WINDOWS`.
"""
import struct, sys

def patch(path: str) -> None:
    with open(path, "r+b") as f:
        f.seek(0x3c)
        pe_off = struct.unpack("<I", f.read(4))[0]
        f.seek(pe_off)
        if f.read(4) != b"PE\x00\x00":
            raise SystemExit("not a PE file: " + path)
        # subsystem field is at offset 0x5C from the PE signature
        sub_off = pe_off + 0x5c
        f.seek(sub_off)
        cur = struct.unpack("<H", f.read(2))[0]
        if cur == 2:
            print(f"{path}: already GUI subsystem")
            return
        if cur != 3:
            print(f"{path}: warning, subsystem={cur} (not console)")
        f.seek(sub_off)
        f.write(struct.pack("<H", 2))
        print(f"{path}: subsystem {cur} -> 2 (GUI)")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        patch(p)
