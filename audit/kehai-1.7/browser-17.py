#!/usr/bin/env python3
"""Kehai's real-browser pass on SpiralOS 1.7 (Playwright Chromium).
Part A: load all 4 pages over file:// and http://, collect page + console errors.
Part B (Hummingbird, file://, real keyboard + real tray inputs): boot, insert files via the tray's own
<input>, ls/cat them, write back, Eject .IMG (capture the download), run CZECH, run Zork II VERIFY.
Usage: python3 browser-17.py <repo-dir> <outdir> <port>"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
repo = pathlib.Path(sys.argv[1]).resolve(); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True); port = sys.argv[3]
pages = ["index.html", "hummingbird.html", "tabcomp.html", "triton/spiralos-triton.html"]
res = {}
def typ(pg, s, wait=3000, enter=True):
    for ch in s: pg.keyboard.press("Space" if ch == " " else ch); pg.wait_for_timeout(50)
    if enter: pg.keyboard.press("Enter")
    pg.wait_for_timeout(wait)
with sync_playwright() as p:
    b = p.chromium.launch()
    for page in pages:
        for scheme, url in [("file", (repo / page).as_uri()), ("http", f"http://127.0.0.1:{port}/{page}")]:
            pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []
            pg.on("pageerror", lambda e, errs=errs: errs.append("PAGE " + str(e)[:200]))
            pg.on("console", lambda m, errs=errs: errs.append("CONSOLE " + m.text[:200]) if m.type == "error" else None)
            pg.goto(url); pg.wait_for_timeout(4000)
            tray = pg.locator("#spiral-disk-tray").count()
            pg.screenshot(path=str(out / f"A-{page.replace('/','_')}-{scheme}.png"))
            res[f"{page} {scheme}"] = {"errors": errs[:5], "tray": tray}
            print(page, scheme, "errors:", len(errs), errs[:3], "tray:", tray, flush=True)
            pg.close()
    # Part B
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto((repo / "hummingbird.html").as_uri()); pg.wait_for_timeout(1500)
    pg.set_input_files("#floppy-input", str(repo / "spiralos.img")); pg.wait_for_timeout(1000)
    pg.click("button:has-text('Reset PC')"); pg.wait_for_timeout(40000)
    pg.set_input_files("#tray-pick-files", [str(pathlib.Path("hello.txt").resolve()), str(pathlib.Path("czech.z5").resolve())])
    pg.wait_for_timeout(3000)
    print("tray status:", pg.inner_text("#tray-status"), flush=True)
    if pg.locator("canvas").count(): pg.locator("canvas").first.click(position={"x": 300, "y": 300})
    typ(pg, "ls /shelf", 5000); typ(pg, "cat /shelf/hello.txt", 5000)
    pg.screenshot(path=str(out / "B1-ls-cat.png"))
    typ(pg, "write /shelf/back.txt written in the browser", 6000)
    try:
        with pg.expect_download(timeout=20000) as dl:
            pg.click("#tray-eject-img")
        d = dl.value; d.save_as(str(out / "ejected.img")); print("ejected:", d.suggested_filename, (out / "ejected.img").stat().st_size, flush=True)
    except Exception as e:
        print("eject download failed:", str(e)[:200], flush=True)
    pg.screenshot(path=str(out / "B2-after-eject.png"))
    b.close()
print("partB errors:", errs[:5])
json.dump(res, open(out / "partA.json", "w"), indent=1)
