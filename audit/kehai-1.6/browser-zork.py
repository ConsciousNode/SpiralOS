#!/usr/bin/env python3
"""Kehai's real-browser Zork attempt on SpiralOS 1.6 (Playwright Chromium, Hummingbird, real keyboard events):
boot the rebuilt image, click the screen, try the shell commands for Zork, then type 'open mailbox'.
Screenshots after each step. Usage: python3 browser-zork.py <repo-dir> <outdir>"""
import sys, pathlib
from playwright.sync_api import sync_playwright
repo = pathlib.Path(sys.argv[1]).resolve(); out = pathlib.Path(sys.argv[2])
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto((repo / "hummingbird.html").as_uri()); pg.wait_for_timeout(1500)
    pg.set_input_files("#floppy-input", str(repo / "spiralos.img")); pg.wait_for_timeout(1000)
    pg.click("button:has-text('Reset PC')"); pg.wait_for_timeout(35000)
    pg.focus("canvas") if pg.locator("canvas").count() else None; pg.wait_for_timeout(500)
    def typ(s, wait=4000):
        for ch in s: pg.keyboard.press("Space" if ch == " " else ch); pg.wait_for_timeout(80)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(wait)
    typ("z /games/zork1.z3", 15000)
    pg.screenshot(path=str(out / "zork-1-start.png"))
    typ("open mailbox", 8000)
    pg.screenshot(path=str(out / "zork-2-mailbox.png"))
    typ("read leaflet", 8000)
    pg.screenshot(path=str(out / "zork-3-leaflet.png"))
    b.close()
print("errors:", errs[:5])
