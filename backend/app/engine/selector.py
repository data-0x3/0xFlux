"""Hybrid engine selector — picks nmap when available, else pure-Python."""
from __future__ import annotations

import asyncio

from ..core.capabilities import detect
from ..core.safety import ResolvedTarget
from .base import ProgressCb, ScanConfig, ScanResult
from . import nmap_engine, python_engine


def chosen_engine() -> str:
    caps = detect()
    needs_rich = True  # we always prefer nmap when present; it's strictly richer
    return "nmap" if (caps.nmap.available and needs_rich) else "python"


async def run_scan(
    resolved: ResolvedTarget,
    config: ScanConfig,
    progress: ProgressCb,
    cancel: asyncio.Event,
) -> ScanResult:
    engine = chosen_engine()
    if engine == "nmap":
        try:
            return await nmap_engine.scan(resolved, config, progress, cancel)
        except Exception:
            # Never leave the user stuck: fall back transparently.
            await progress("portscan", 0, 1, "nmap failed — falling back to Python engine…")
            return await python_engine.scan(resolved, config, progress, cancel)
    return await python_engine.scan(resolved, config, progress, cancel)
