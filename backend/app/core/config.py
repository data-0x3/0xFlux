"""Application configuration for 0xFLUX.

Centralised, validated settings. Values can be overridden by environment
variables prefixed with ``FLUX_`` (e.g. ``FLUX_HOST``, ``FLUX_PORT``).
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# Data lives next to the backend package by default so the app is portable.
_DEFAULT_DATA_DIR = Path.home() / ".0xflux"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FLUX_", env_file=".env", extra="ignore")

    app_name: str = "0xFLUX"
    developer: str = "0x3"
    version: str = "0.1.0"

    host: str = "127.0.0.1"
    port: int = 8787

    # Comma-separated list of allowed CORS origins (Tauri dev + packaged webview).
    cors_origins: str = ("http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,"
                         "https://tauri.localhost,http://tauri.localhost")

    # host:port used by the latency probe (TCP handshake time, no payload sent)
    latency_target: str = "1.1.1.1:443"

    data_dir: Path = _DEFAULT_DATA_DIR

    # Safety rail: scanning is meant for owned/authorised networks only.
    # When True, the API rejects targets outside private/loopback ranges
    # unless the request explicitly sets ``authorized=True``.
    restrict_to_private_by_default: bool = True

    @property
    def db_path(self) -> Path:
        return self.data_dir / "flux.db"

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.db_path}"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
