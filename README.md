# 0xFLUX — Network Intelligence & Monitoring Platform

**Developed by 0x3** · t.me/data0x3

Network scanning, local discovery, packet analysis, live monitoring and
diagnostics in one minimalist black-and-white desktop application.

**Stack:** Tauri 2 (desktop shell) · React + TypeScript + Vite · FastAPI +
SQLite (SQLAlchemy) · hybrid engine — **nmap** when installed, a built-in
asynchronous Python engine otherwise · **scapy + Npcap** for packet capture.

> **Scope.** 0xFLUX is for networks and devices you own or are explicitly
> authorised to assess. Public targets are refused unless the request carries
> an explicit authorisation acknowledgement; discovery sweeps private ranges only.

---

## Quick start on Windows

1. Install **Python 3.11+** (tick *Add to PATH*) and **Node.js 18+**.
2. Double-click **`setup.bat`** (creates the Python venv, installs everything).
3. Run one of:
   - **`start-dev.bat`** — engine + interface in your browser (http://localhost:1420)
   - **`start-app.bat`** — the desktop app (requires **Rust**: https://rustup.rs)

Right-click → **Run as administrator** to unlock packet capture, OS
fingerprinting and UDP scanning.

### Optional components

| Install | Unlocks |
|---|---|
| **Nmap** — nmap.org/download | service/version detection, OS fingerprinting, UDP |
| **Npcap** — npcap.com (keep *WinPcap API-compatible mode*) | Traffic Analyzer live capture |
| Administrator rights | capture, `-O`, `-sU` |

Without them the app still works: the Python engine does host discovery and
TCP scanning with banner hints, and features that need something missing say
exactly what to install instead of showing invented data.

---

## Manual setup (any OS)

```bash
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate            # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python run.py                     # http://127.0.0.1:8787

# interface (second terminal)
cd frontend && npm install && npm run dev      # http://localhost:1420

# desktop app (project root)
npm install && npm run app
```

Production installer: `npm run build` → `src-tauri/target/release/bundle/`
(NSIS + MSI). The installer ships the backend source; the app starts it with
`backend/.venv` if present, otherwise the system `python` — so run
`pip install -r backend/requirements.txt` once on the target machine.

Tests: `cd backend && pip install -r requirements-dev.txt && python -m pytest -q`

---

## Architecture

```
0xflux/
├─ frontend/src/
│  ├─ pages/        Overview · Scanner · Discovery · Traffic · Monitor · Ports
│  │                Tools · History · Reports · Settings
│  ├─ components/   sidebar, boot screen, icons, protocol bars, UI primitives
│  ├─ hooks/        useScan (WebSocket progress)
│  ├─ lib/          API client, capabilities, Simple/Advanced mode, formatters
│  └─ styles/       design tokens (theme.css) + components (app.css)
├─ backend/app/
│  ├─ core/         config, logging, capability detection, target safety, subprocess
│  ├─ db/           SQLAlchemy models (scans, hosts, ports, devices)
│  ├─ engine/       nmap + python engines, selector, service table, packet parsers
│  ├─ services/     scan manager, discovery, monitor + latency probe, capture,
│  │                DNS/IP tools, PDF reports
│  └─ api/          REST + WebSocket routers
├─ backend/tests/   pytest suite
└─ src-tauri/       Rust shell: finds and starts the backend, stops it on exit
```

The interface talks to `127.0.0.1:8787` (REST + WebSockets for scan progress,
monitor samples and the packet stream). Settings can be overridden with
`FLUX_*` environment variables (`FLUX_PORT`, `FLUX_LATENCY_TARGET`, …).

---

## What each section does

| Section | Real data source |
|---|---|
| Overview | monitor WebSocket, latency probe, scan history, device inventory |
| Network Scanner | 4 profiles + custom ports/timeouts, live progress, cancel, PDF/CSV/JSON |
| Network Discovery | routing table (gateway), ARP cache, TCP sweep, persistent inventory, topology |
| Traffic Analyzer | scapy AsyncSniffer: TCP/UDP/DNS/HTTP/TLS(SNI)/ICMP/ARP metadata, BPF, filters |
| Network Monitor | psutil counters (1 s), TCP latency probe (2 s), sockets, protocol mix |
| Port Explorer | reference table merged with ports your scans actually found open |
| DNS & IP Tools | dnspython, python-whois, OS ping/tracert (FR/EN output), subnet math |
| Scan History | SQLite: search, details, two-scan comparison, delete |
| Reports | JSON, CSV, branded PDF |
| Settings | Simple/Advanced mode, capability inspector, engine config |

**Simple mode** keeps the essentials. **Advanced mode** adds custom port
ranges and timeouts, OS/UDP options, BPF capture filters, TCP seq/ack/window,
top talkers, connection tables, errors/drops and raw tool output.

---

## Honesty rules built in

- Unknown, unavailable and zero are displayed differently (`—`, an explanation, `0`).
- Banner reads are passive (a plain `HEAD` on HTTP ports) — no exploit payloads.
- The analyzer keeps metadata only; payloads are never stored, TLS is never decrypted.
- Topology draws only gateway→device links on the local segment, nothing inferred.
- Privileged options are requested only when the process is actually elevated.

0xFLUX · developed by 0x3
