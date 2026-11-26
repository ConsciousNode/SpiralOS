#!/usr/bin/env python3
"""Kehai's real-browser pass on SpiralOS 1.6.1 (Playwright Chromium, Hummingbird, real keyboard events).
Session A: shell `write` + `cat`, then `open` the file in Notes and type 24 lines (does the view follow the cursor?).
Session B (fresh boot): `write` a file, then `shutdown` (what does the screen show, does the CPU halt?).
Usage: python3 browser-161.py <repo-dir> <outdir>"""
import sys, pathlib
from playwright.sync_api import sync_playwright
repo = pathlib.Path(sys.argv[1]).resolve(); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
errs = []
def boot(pg):
    pg.goto((repo / "hummingbird.html").as_uri()); pg.wait_for_timeout(1500)
    pg.set_input_files("#floppy-input", str(repo / "spiralos.img")); pg.wait_for_timeout(1000)
    pg.click("button:has-text('Reset PC')"); pg.wait_for_timeout(35000)
    pg.focus("canvas") if pg.locator("canvas").count() else None; pg.wait_for_timeout(500)
def typ(pg, s, wait=3000, enter=True):
    for ch in s: pg.keyboard.press("Space" if ch == " " else ch); pg.wait_for_timeout(60)
    if enter: pg.keyboard.press("Enter")
    pg.wait_for_timeout(wait)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)))
    boot(pg)
    typ(pg, "write /home/hi.txt hello from kehai"); typ(pg, "cat /home/hi.txt")
    pg.screenshot(path=str(out / "a1-write-cat.png"))
    typ(pg, "open /home/hi.txt", 6000)
    pg.screenshot(path=str(out / "a2-notes-open.png"))
    for i in range(24):
        pg.keyboard.press("Enter"); pg.wait_for_timeout(60); typ(pg, f"line {i+1}", 150, enter=False)
    pg.wait_for_timeout(2000); pg.screenshot(path=str(out / "a3-notes-24-lines.png"))
    pg.close()
    pg = b.new_page(viewport={"width": 1280, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)))
    boot(pg)
    typ(pg, "write /home/survive.txt bye"); typ(pg, "shutdown", 8000)
    pg.screenshot(path=str(out / "b1-shutdown.png"))
    print("after shutdown:", pg.evaluate("() => document.body.innerText.match(/Milestone:[^\\n]*|Speed:[^\\n]*|Mode:[^\\n]*|Restart[^\\n]*|halt[^\\n]*/gi)"))
    b.close()
print("errors:", errs[:5])
