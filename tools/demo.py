"""Record a short presentation video of 0xFLUX running against the lab network.

    python tools/demo.py 172.30.0.0/28 br-xxxx

Playwright records the real UI session to webm; the workflow converts it to mp4.
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
OUT = Path("video"); OUT.mkdir(exist_ok=True)
W, H = 1440, 900


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


# Pre-seed: discovery + a baseline scan so history/overview have data.
call("POST", f"/discovery/scan?subnet={SUBNET}")
call("POST", "/scan", {"target": SUBNET, "profile": "standard_scan"})
time.sleep(4)
call("POST", "/capture/start", {"iface": BRIDGE, "bpf": None})

# background traffic for the whole recording
traffic = subprocess.Popen(["bash", "-c", """
for i in $(seq 1 120); do
  curl -s -o /dev/null http://172.30.0.2/ ; curl -s -o /dev/null http://172.30.0.4/
  docker run --rm --net fluxlab curlimages/curl -s -o /dev/null https://example.com 2>/dev/null
  docker exec web nslookup github.com >/dev/null 2>&1
  ping -c 1 -W 1 172.30.0.3 >/dev/null 2>&1
  sleep 0.5
done"""])

CAPTION_JS = """
(() => {
  let el = document.getElementById('__cap');
  if (!el) {
    el = document.createElement('div'); el.id = '__cap';
    el.style.cssText = `position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:9999;
      background:rgba(22,22,22,.92);border:1px solid #333;border-radius:100px;color:#fff;
      font:500 15px/1 Inter,sans-serif;padding:11px 20px;letter-spacing:.01em;
      box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .4s ease;
      display:flex;align-items:center;gap:10px;`;
    const dot=document.createElement('span');
    dot.style.cssText='width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;';
    el.appendChild(dot); const t=document.createElement('span'); t.id='__capt'; el.appendChild(t);
    document.body.appendChild(el);
  }
  window.__setCap=(s)=>{document.getElementById('__capt').textContent=s;el.style.opacity=s?'1':'0';};
})();
"""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": W, "height": H}, locale="fr-FR",
                                  color_scheme="dark", record_video_dir=str(OUT),
                                  record_video_size={"width": W, "height": H})
        ctx.add_init_script("localStorage.setItem('flux.mode','advanced');localStorage.setItem('flux.lang','fr')")
        page = ctx.new_page()

        def cap(text, hold=0.0):
            page.evaluate(CAPTION_JS)
            page.evaluate("(s) => window.__setCap(s)", text)
            if hold:
                time.sleep(hold)

        def go(route, settle=2.0):
            page.goto(UI + route); page.wait_for_selector(".sidebar", timeout=60000); time.sleep(settle)

        # --- intro: boot animation (block API briefly) ---
        page.route("**/api/**", lambda r: r.abort())
        page.goto(UI + "/"); time.sleep(3.2)
        page.unroute("**/api/**")

        go("/", 1.0); cap("0xFLUX — Intelligence réseau", 0.3); time.sleep(3.2)

        cap("Vue d'ensemble du réseau en temps réel"); time.sleep(3.0)

        go("/scanner", 1.0); cap("Scanner réseau — inspiré de Nmap")
        page.fill("#target", SUBNET)
        page.click("text=Service Detection"); time.sleep(0.6)
        page.click("button:has-text('Démarrer'), button:has-text('Start scan')")
        time.sleep(1.0)
        try:
            page.wait_for_selector("text=/Résultats|Results/", timeout=60000)
        except Exception:
            pass
        time.sleep(3.0)

        go("/discovery", 1.0); cap("Découverte — les appareils du réseau"); time.sleep(3.2)

        go("/traffic", 2.0); cap("Analyseur de trafic — capture en direct"); time.sleep(3.0)
        for tab, label in [("Conversations", "Conversations — qui parle à qui"),
                           ("Hôtes", "Hôtes — volume par appareil"),
                           ("Statistiques", "Statistiques — protocoles et tailles")]:
            page.click(f".tab:has-text('{tab}')"); cap(label); time.sleep(3.0)

        go("/monitor", 2.0); cap("Moniteur — débit et latence en direct"); time.sleep(4.0)

        go("/developer", 1.0); cap("développé par 0x3"); time.sleep(3.0)
        cap("", 0.3)
        time.sleep(0.6)

        video = page.video.path()
        ctx.close()
        browser.close()
        Path(video).rename(OUT / "0xflux_raw.webm")
        print("VIDEO_RAW", OUT / "0xflux_raw.webm")

    traffic.terminate()
    call("POST", "/capture/stop")


if __name__ == "__main__":
    main()
