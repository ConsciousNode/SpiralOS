import sys, time, subprocess
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8766','--bind','127.0.0.1'],cwd='/tmp/tc13',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
try:
  with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    p=b.new_page(viewport={'width':1500,'height':1000}); errs=[]; reqs=[]
    p.on('pageerror',lambda e:errs.append(str(e))); p.on('request',lambda r:reqs.append(r.url))
    p.goto('http://127.0.0.1:8766/page.html'); 
    for t in (8,25):
      time.sleep(t if t==8 else 17)
      p.screenshot(path=f'/tmp/audscripts/spiral13-{t}s.png')
    txt=p.evaluate("()=>document.body.innerText.slice(0,1500)")
    print('errors',errs); print('external',[u for u in reqs if not u.startswith('http://127.0.0.1')]); print(txt)
    b.close()
finally: srv.terminate()
