"""Drive a running 0xFLUX (backend :8787 + Vite :1420) against a lab network
we own, and capture one screenshot per page into docs/screenshots/.

    python tools/screenshots.py 172.30.0.0/28 br-xxxxxxxxxxxx
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8787/api"
UI = "http://localhost:1420/#"
SUBNET, BRIDGE = sys.argv[1], sys.argv[2]
OUT = Path("docs/screenshots")
OUT.mkdir(parents=True, exist_ok=True)


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def wait_scan(scan_id: int) -> dict:
    for _ in range(400):
        s = call("GET", f"/history/{scan_id}")
        if s["status"] != "running":
            return s
        time.sleep(2)
    raise RuntimeError("scan did not finish")


def sh(cmd: str) -> None:
    subprocess.run(cmd, shell=True, check=False)


print("discovery #1:", call("POST", f"/discovery/scan?subnet={SUBNET}")["count"])
s1 = call("POST", "/scan", {"target": SUBNET, "profile": "standard_scan"})["scan_id"]
print("baseline scan:", wait_scan(s1)["ports_open"], "open ports")

# A new service appears on the lab network after the baseline (for the comparison view).
sh("docker run -d --name files --net fluxlab --ip 172.30.0.5 python:3.12-alpine python -m http.server 8000")
time.sleep(3)
print("discovery #2:", call("POST", f"/discovery/scan?subnet={SUBNET}")["count"])

# Live capture on the lab bridge + background traffic generator.
print("capture:", call("POST", "/capture/start", {"iface": BRIDGE, "bpf": None})["running"])
traffic = subprocess.Popen(["bash", "-c", """
for i in $(seq 1 60); do
  curl -s -o /dev/null http://172.30.0.2/ ; curl -s -o /dev/null http://172.30.0.4/ ; curl -s -o /dev/null http://172.30.0.5:8000/
  docker exec web nslookup example.com >/dev/null 2>&1
  docker exec web nslookup github.com >/dev/null 2>&1
  docker run --rm --net fluxlab curlimages/curl -s -o /dev/null https://example.com
  ping -c 1 -W 1 172.30.0.3 >/dev/null
  printf 'PING\\r\\n' | timeout 1 bash -c 'exec 3<>/dev/tcp/172.30.0.3/6379; cat >&3; head -c 7 <&3' >/dev/null 2>&1
  sleep 1
done"""])

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2,
                              color_scheme="dark")
    ctx.add_init_script("localStorage.setItem('flux.mode','advanced')")
    page = ctx.new_page()

    def go(route: str, settle: float = 2.5) -> None:
        page.goto(UI + route)
        page.wait_for_selector(".sidebar", timeout=60_000)
        time.sleep(settle)

    def shot(name: str) -> None:
        page.screenshot(path=str(OUT / f"{name}.png"))
        print("saved", name)

    # Network Scanner — real UI flow: service + OS detection through nmap.
    go("/scanner")
    page.fill("#target", SUBNET)
    page.click("text=Service Detection")
    page.check("label:has-text('OS fingerprinting') input")
    page.click("button:has-text('Start scan')")
    time.sleep(4)
    shot("02-scanner-running")
    page.wait_for_selector("text=Results —", timeout=600_000)
    time.sleep(1.5)
    shot("02-scanner")

    # Traffic Analyzer — select a TLS packet for the detail panel.
    go("/traffic", 4)
    tls = page.locator("tbody tr:has(td.mono:text-is('TLS'))")
    target = tls.first if tls.count() else page.locator("tbody tr").first
    target.click()
    time.sleep(0.8)
    shot("04-traffic")

    go("/monitor", 22)
    shot("05-monitor")

    go("/", 10)
    shot("01-overview")

    go("/discovery", 3)
    page.locator("tbody tr").nth(1).hover()
    time.sleep(0.5)
    shot("03-discovery")

    go("/ports")
    page.click("button:has-text('Detected')")
    time.sleep(1)
    shot("06-ports")

    go("/tools")
    page.fill("input.input.mono", "github.com")
    page.select_option("select", "MX")
    page.click("button:has-text('Run')")
    page.wait_for_selector("text=Result", timeout=30_000)
    time.sleep(1)
    shot("07-tools")

    go("/history")
    boxes = page.locator("tbody input[type=checkbox]")
    boxes.nth(0).check()
    boxes.nth(1).check()
    time.sleep(0.5)
    shot("08-history")
    page.click("button:has-text('Compare')")
    time.sleep(1.5)
    shot("08-history-compare")

    go("/reports")
    shot("09-reports")

    go("/settings")
    shot("10-settings")

    go("/developer", 3)
    shot("11-developer")

    browser.close()

traffic.terminate()
call("POST", "/capture/stop")
print("done")
