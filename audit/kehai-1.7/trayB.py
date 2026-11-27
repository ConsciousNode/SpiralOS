"""Kehai: Hummingbird real-browser tray round trip. Insert via the tray's own <input>, shell write to /shelf,
then pull the image out through the tray's own ejectImage() and save it for an independent read."""
import sys, pathlib, base64
from playwright.sync_api import sync_playwright
repo = pathlib.Path(sys.argv[1]).resolve(); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
files = sys.argv[3:]
JS = """() => { const img = globalThis.spiralDiskTray.ejectImage(); if (!img) return null;
  let s = ""; for (let i = 0; i < img.length; i += 32768) s += String.fromCharCode.apply(null, img.subarray(i, i + 32768));
  return btoa(s); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.goto((repo / "hummingbird.html").as_uri()); pg.wait_for_timeout(1500)
    pg.set_input_files("#floppy-input", str(repo / "spiralos.img")); pg.wait_for_timeout(1000)
    pg.click("button:has-text('Reset PC')"); pg.wait_for_timeout(40000)
    pg.set_input_files("#tray-pick-files", [str(pathlib.Path(f).resolve()) for f in files]); pg.wait_for_timeout(3000)
    print("tray:", pg.inner_text("#tray-status"))
    pg.locator("canvas").first.click(position={"x": 300, "y": 300})
    for ch in "write /shelf/back.txt written in the browser":
        pg.keyboard.press("Space" if ch == " " else ch); pg.wait_for_timeout(50)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(8000)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(1000)
    (out / "ejected.img").write_bytes(base64.b64decode(pg.evaluate(JS)))
    b.close()
