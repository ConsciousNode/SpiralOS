#!/usr/bin/env python3
"""Kehai's real-browser boot of SpiralOS 1.6 (Playwright Chromium): loads hummingbird.html from file://, inserts the
rebuilt spiralos.img through the page's own floppy file input, waits for the desktop, screenshots, and reports
console/page errors. Usage: python3 browser-boot.py <repo-dir> <outdir> [wait_s]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
repo = pathlib.Path(sys.argv[1]).resolve(); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
wait = float(sys.argv[3]) if len(sys.argv) > 3 else 25
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto((repo / "hummingbird.html").as_uri()); pg.wait_for_timeout(1500)
    pg.set_input_files("#floppy-input", str(repo / "spiralos.img")); pg.wait_for_timeout(1000)
    btns = pg.eval_on_selector_all("button", "bs => bs.map(b => (b.innerText||b.title||b.id).trim()).filter(Boolean)")
    print("buttons:", btns[:30])
    for label in ["Power", "Boot", "Start", "Reset"]:
        loc = pg.locator(f"button:has-text('{label}')")
        if loc.count(): loc.first.click(); print("clicked", label); break
    pg.wait_for_timeout(wait * 1000)
    pg.screenshot(path=str(out / "hummingbird-1.6-desktop.png"))
    b.close()
print("errors:", errs[:6])
