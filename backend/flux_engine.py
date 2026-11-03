"""0xFLUX engine entry point — used both from source and as the frozen
``0xflux-engine.exe`` bundled inside the desktop installer.

    0xflux-engine.exe --parent-pid 1234

With ``--parent-pid`` the engine exits as soon as the desktop app that started
it is gone, so closing the window never leaves a background process holding
port 8787.
"""
from __future__ import annotations

import argparse
import multiprocessing
import os
import sys
import threading
import time
from pathlib import Path


def _ensure_streams() -> None:
    # A windowed/hidden process can have no stdout/stderr; logging and uvicorn
    # need real streams, so send them to a log file in the data folder.
    if sys.stdout is None or sys.stderr is None:
        log_dir = Path.home() / ".0xflux"
        log_dir.mkdir(parents=True, exist_ok=True)
        stream = open(log_dir / "engine.log", "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stdout or stream
        sys.stderr = sys.stderr or stream


def _watch_parent(pid: int) -> None:
    import psutil

    def loop() -> None:
        while True:
            time.sleep(2)
            if not psutil.pid_exists(pid):
                os._exit(0)

    threading.Thread(target=loop, name="parent-watchdog", daemon=True).start()


def main() -> None:
    _ensure_streams()
    parser = argparse.ArgumentParser(prog="0xflux-engine")
    parser.add_argument("--parent-pid", type=int, default=None)
    args, _ = parser.parse_known_args()
    if args.parent_pid:
        _watch_parent(args.parent_pid)

    from app.main import run
    run()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
