"""Focused production-worker acceptance. Run after pnpm build.
PATH=/home/tyler/.local/share/godville-toolchain/bin:$PATH /opt/agents/playwright/venv/bin/python scripts/balance-smoke.py
Writes real browser evidence outside the repository (BALANCE_QA_OUT override).
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.parse
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('BALANCE_QA_OUT', '/opt/agents/migration/balance-browser'))
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:4184/?sandbox=1'
report = {'checks': [], 'errors': [], 'workers': []}
def check(name, ok):
    report['checks'].append({'name': name, 'pass': bool(ok)})
    assert ok, name

def download_data(page):
    href = page.locator('a[download="balance.json"]').get_attribute('href')
    return json.loads(urllib.parse.unquote(href.split(',', 1)[1]))

server = subprocess.Popen(['pnpm', '--filter', '@godville/web', 'preview', '--host', '127.0.0.1', '--port', '4184', '--strictPort'], cwd=ROOT, stdout=open(OUT / 'preview.log', 'w'), stderr=subprocess.STDOUT, start_new_session=True)
try:
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError('preview exited')
        try:
            urllib.request.urlopen(URL, timeout=1).close()
            break
        except OSError:
            time.sleep(0.1)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH'), args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1280, 'height': 1000})
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('worker', lambda w: report['workers'].append(w.url))
        page.goto(URL)
        panel = page.get_by_test_id('balance-panel')
        panel.wait_for()
        page.get_by_label('Batch zone', exact=True).fill('-1')
        panel.get_by_role('button', name='Run 10,000 fights').click()
        page.get_by_test_id('balance-status').filter(has_text='Error:').wait_for()
        check('invalid zone rejects without worker', not any('balance.worker' in u for u in report['workers']))
        page.get_by_label('Batch zone', exact=True).fill('1')
        panel.get_by_role('button', name='Run 10,000 fights').click()
        page.wait_for_function("document.querySelector('progress[aria-label=\"Batch progress\"]').value > 0")
        check('real intermediate progress', 0 < page.locator('progress[aria-label="Batch progress"]').evaluate('(e)=>e.value') < 10000)
        panel.get_by_role('button', name='Cancel batch').click()
        check('cancel acknowledged', 'Cancelled' in page.get_by_test_id('balance-status').inner_text())
        partial = download_data(page)
        check('cancel leaves honestly incomplete result', not partial['result']['completed'])
        page.wait_for_timeout(250)
        check('no stale progress after cancellation', download_data(page) == partial)
        panel.get_by_role('button', name='Run 10,000 fights').click()
        page.get_by_test_id('balance-status').filter(has_text='Complete · 10000/10000').wait_for(timeout=60000)
        first = download_data(page)
        (OUT / 'zone1-worker.json').write_text(json.dumps(first, indent=2))
        check('10k actual worker outcomes accounted', first['result']['trials'] == sum(first['result'][k] for k in ['wins', 'losses', 'draws', 'unresolved']) == 10000)
        check('forecast and batch are separate workers', any('forecast.worker' in u for u in report['workers']) and any('balance.worker' in u for u in report['workers']))
        page.get_by_label('Batch zone', exact=True).fill('30')
        check('editing drafts cannot relabel measured result', download_data(page)['zone'] == 1)
        page.get_by_label('Batch zone', exact=True).fill('1')
        panel.get_by_role('button', name='Run 10,000 fights').click()
        page.get_by_test_id('balance-status').filter(has_text='Complete · 10000/10000').wait_for(timeout=60000)
        check('worker deterministic rerun including gear', download_data(page) == first)
        baseline = os.environ.get('BALANCE_BASELINE')
        if baseline:
            cli = json.loads(Path(baseline).read_text())
            zone1 = next(m for m in cli['measurements'] if m['zone'] == 1)
            check('browser worker equals native Node engine results', first['result'] == zone1['result'] and first['loadout'] == zone1['loadout'])
        panel.screenshot(path=str(OUT / 'desktop.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        check('mobile panel no document overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        panel.screenshot(path=str(OUT / 'mobile.png'))
        check('no page errors', not report['errors'])
        browser.close()
finally:
    os.killpg(server.pid, signal.SIGTERM)
    server.wait(timeout=10)
    (OUT / 'results.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
