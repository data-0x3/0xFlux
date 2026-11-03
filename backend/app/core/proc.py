"""Safe subprocess helper shared by the network utilities.

Runs OS tools (ping, tracert, arp, route) in a worker thread so it works on
every event-loop flavour, hides the console window on Windows, and decodes
output with the console's OEM code page (French Windows output included).
"""
from __future__ import annotations

import asyncio
import platform
import subprocess

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0  # CREATE_NO_WINDOW


def _decode(raw: bytes) -> str:
    for enc in (("oem", "mbcs") if IS_WINDOWS else ()) + ("utf-8",):
        try:
            return raw.decode(enc, errors="replace")
        except LookupError:
            continue
    return raw.decode("latin-1", errors="replace")


def run_sync(cmd: list[str], timeout: float = 20.0) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout,
                              creationflags=_NO_WINDOW)
    except FileNotFoundError:
        return 127, f"'{cmd[0]}' is not available on this system."
    except subprocess.TimeoutExpired:
        return 124, "Operation timed out."
    return proc.returncode, _decode(proc.stdout + proc.stderr)


async def run(cmd: list[str], timeout: float = 20.0) -> tuple[int, str]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, run_sync, cmd, timeout)
