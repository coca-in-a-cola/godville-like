"""Production Chromium smoke. Uses existing Python Playwright; no app test hooks.
Run: /opt/agents/playwright/venv/bin/python scripts/browser-smoke.py
Requires pnpm build first. Override BROWSER_QA_OUT / CHROMIUM_PATH if needed.
Controlled localStorage fixtures are explicitly marked in results and screenshots.
"""
import copy
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import urllib.request
from typing import Any
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('BROWSER_QA_OUT', str(Path(tempfile.gettempdir()) / 'godville-browser-qa')))
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:4173/'
KEY = 'godville.session.v1'
results: dict[str, Any] = {'checks': [], 'pageerrors': [], 'console_errors': [], 'failed_requests': [], 'http_errors': [], 'workers': [], 'screenshots': []}

def check(name, condition, detail=None):
    results['checks'].append({'name': name, 'pass': bool(condition), 'detail': detail})
    print(('PASS ' if condition else 'FAIL ') + name, detail if detail is not None else '', flush=True)
    assert condition, name

def attach(page):
    page.on('pageerror', lambda e: results['pageerrors'].append(str(e)))
    page.on('console', lambda m: results['console_errors'].append({'text': m.text, 'location': m.location}) if m.type == 'error' else None)
    page.on('requestfailed', lambda r: results['failed_requests'].append({'url': r.url, 'failure': r.failure}))
    page.on('response', lambda r: results['http_errors'].append({'url': r.url, 'status': r.status}) if r.status >= 400 else None)
    page.on('worker', lambda w: results['workers'].append(w.url))
    return page

def saved(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

def ready(page):
    page.locator('.game-columns').wait_for()
    page.wait_for_function("!document.querySelector('.game-columns').hasAttribute('aria-busy') || document.querySelector('.game-columns').getAttribute('aria-busy') === 'false'")
    check('no runtime error panel', page.locator('[role=alert]').count() == 0)

def shot(page, name):
    path = str(OUT / name)
    page.screenshot(path=path, full_page=True)
    results['screenshots'].append(path)

def layout(page, label):
    sizes = page.evaluate('({width:innerWidth, document:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
    check(label + ' no horizontal overflow', sizes['document'] <= sizes['width'] and sizes['body'] <= sizes['width'], sizes)
    check(label + ' masthead visible', page.locator('h1').is_visible())
    fonts = page.locator('.divine button').evaluate_all('(els)=>els.map(el=>parseFloat(getComputedStyle(el).fontSize))')
    check(label + ' controls fonts at least 11px (visual review separate)', min(fonts) >= 11, fonts)

def fixture(page, envelope, label, age=0):
    # Unmount first so live pagehide cannot overwrite this controlled save.
    page.goto(URL + '?sandbox=1')
    page.evaluate('([key, data, age]) => { data.savedAtMs=Date.now()-age; delete data.pending; localStorage.setItem(key,JSON.stringify(data)); }', [KEY, envelope, age])
    page.goto(URL)
    ready(page)
    check('controlled fixture loaded: ' + label, saved(page)['session']['world']['seed'] == envelope['session']['world']['seed'])

def quiet(envelope):
    e = copy.deepcopy(envelope)
    w = e['session']['world']
    w['phase'] = 'travel'
    w['phaseMs'] = 0
    w['travelCarryMs'] = 0
    w['combat'] = None
    w.pop('voiceIntent', None)
    w['hero']['hp'] = w['hero']['stats']['maxHp']
    w['hero']['quest']['progress'] = 0
    w['tuning'].update(stepMs=1000000000, encounterBp=0, goldFindBp=0, itemFindBp=0, brickFindBp=0)
    return e

server = subprocess.Popen(['pnpm', '--filter', '@godville/web', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], cwd=ROOT, stdout=open(OUT / 'preview.log', 'w'), stderr=subprocess.STDOUT, start_new_session=True)
browser = None
try:
    for attempt in range(100):
        if server.poll() is not None:
            raise RuntimeError('preview exited; inspect preview.log')
        try:
            urllib.request.urlopen(URL, timeout=1)
            break
        except OSError:
            time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH'), args=['--no-sandbox'])
        results['browser'] = browser.version
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        page = attach(context.new_page())
        page.goto(URL)
        ready(page)
        page.wait_for_timeout(2200)
        initial = saved(page)
        page.wait_for_timeout(1200)
        progressed = saved(page)
        check('new session moves without Start', progressed['session']['realElapsedMs'] > initial['session']['realElapsedMs'] and progressed['session']['world']['elapsedMs'] > 0)
        check('HP GP quest readouts', page.locator('.health').count() > 0 and 'Godpower 100 / 100' in page.locator('body').inner_text() and 'Current commission' in page.locator('body').inner_text())
        page.locator('details.item summary').first.click()
        layout(page, 'desktop 1440x1000')
        shot(page, 'desktop-new-session.png')
        page.reload()
        ready(page)
        page.wait_for_timeout(400)
        resumed = saved(page)
        check('refresh preserves seed and increases progress', resumed['session']['world']['seed'] == progressed['session']['world']['seed'] and resumed['session']['realElapsedMs'] >= progressed['session']['realElapsedMs'])
        check('saved wall timestamp current', abs(page.evaluate('Date.now()') - resumed['savedAtMs']) < 1500)
        (OUT / 'normal-save.json').write_text(json.dumps(resumed, indent=2))

        # Controlled safe-phase save, UI actions only after mount.
        safe = quiet(initial)
        safe['session']['world']['rng'] = {'a':1535472337,'b':4105658480,'c':559775311,'d':3873050684}
        fixture(page, safe, 'safe phase for paid actions')
        page.locator('details.item summary').first.click()
        gp = saved(page)['session']['world']['god']['gp']
        page.locator('details.item .item-detail button').first.click()
        after = saved(page)
        check('item bless costs 5 GP and permanently protects actual item', after['session']['world']['god']['gp'] == gp - 5 and after['session']['world']['hero']['inventory']['equipped']['weapon']['godBlessed'])
        for command in ['dig', 'rest', 'fight', 'dig', 'rest']:
            before = saved(page)
            page.locator('#voice').fill(command)
            page.locator('form button').click()
            page.wait_for_timeout(100)
            after = saved(page)
            check('Voice costs 5 GP: ' + command, before['session']['world']['god']['gp'] - after['session']['world']['god']['gp'] == 5)
            check('Voice accepted with persisted obey/disobey event', after['session']['diary'][-1]['type'] == 'voice' and isinstance(after['session']['diary'][-1]['obeyed'], bool) and 'Intervention recorded' in page.locator('.action-result').inner_text(), after['session']['diary'][-1])
        check('Voice obey/disobey feedback visible in diary', any(word in page.locator('.ledger-log').inner_text().lower() for word in ['ignored', 'obey', 'heard', 'listen', 'voice']), page.locator('.ledger-log').inner_text())
        gp = saved(page)['session']['world']['god']['gp']
        page.locator('#voice').fill('not-a-command')
        page.locator('form button').click()
        check('unknown Voice costs nothing', saved(page)['session']['world']['god']['gp'] == gp)

        # Real encounter is generated by domain travel, not a mocked worker/fight.
        fight = copy.deepcopy(initial)
        w = fight['session']['world']
        w['hero']['courage'] = 0
        w['tuning'].update(stepMs=1000, encounterBp=10000, goldFindBp=0, itemFindBp=0, brickFindBp=0)
        w['travelCarryMs'] = 0
        fixture(page, fight, 'guaranteed encounter tunables, courage=0')
        page.wait_for_function("JSON.parse(localStorage.getItem('godville.session.v1')).session.world.combat !== null")
        page.wait_for_function("document.querySelector('.win-chance') !== null", timeout=30000)
        forecast_text = page.locator('.forecast-ledger').inner_text()
        check('actual Comlink worker forecast 200 trials displayed', '200' in forecast_text and bool(results['workers']), forecast_text)
        a = saved(page)['session']['world']['combat']['fight']
        page.wait_for_timeout(1100)
        b = saved(page)['session']['world']['combat']['fight']
        check('real combat advances tick and attack bars/HP', b['tick'] > a['tick'] and (b['hero'] != a['hero'] or b['monster'] != a['monster']))
        # Ensure Blessing has missing HP to heal via controlled combat save.
        damaged = saved(page)
        damaged['session']['world']['combat']['fight']['hero']['hp'] = 700
        damaged['session']['world']['hero']['hp'] = 700
        fixture(page, damaged, 'damaged actual encounter for next-tick blessing')
        for action in ['Blessing', 'Smite']:
            gp = saved(page)['session']['world']['god']['gp']
            page.get_by_role('button', name=action + ' · 25 GP', exact=True).click()
            immediate = saved(page)
            check(action + ' debits exactly 25 GP', immediate['session']['world']['god']['gp'] == gp - 25)
            check(action + ' queued event recorded', immediate['session']['diary'][-1]['queued'] is True)
            page.wait_for_timeout(450)
            after = saved(page)
            check(action + ' queue consumed on advancing real tick', after['session']['world']['combat'] is not None and len(after['session']['world']['combat']['fight']['queue']) == 0)
            check(action + ' effect in real combat log', action.lower() in page.locator('.ledger-log').inner_text().lower(), page.locator('.ledger-log').inner_text())
        page.wait_for_function("document.querySelector('.win-chance') !== null", timeout=30000)
        page.locator('details.item summary').first.click()
        shot(page, 'desktop-combat-controlled-save.png')
        (OUT / 'combat-save.json').write_text(json.dumps(saved(page), indent=2))

        upgrades = quiet(initial)
        upgrades['session']['world']['faith'] = 100
        fixture(page, upgrades, '100 Faith for actual upgrade UI')
        for name in ['capacity', 'flow', 'miracle', 'clarity']:
            before = saved(page)['session']
            index = ['capacity', 'flow', 'miracle', 'clarity'].index(name)
            page.locator('.upgrade').nth(index).get_by_role('button').click()
            after = saved(page)['session']
            check('Faith UI upgrade ' + name, after['upgrades'][name] == 1 and before['world']['faith'] - after['world']['faith'] == 5)
        check('capacity increases maximum without refill', after['world']['god']['gpMax'] == 125 and after['world']['god']['gp'] == 100)
        obedient = quiet(initial)
        obedient['session']['upgrades']['clarity'] = 7
        fixture(page, obedient, 'maximum clarity for guaranteed Voice obedience')
        page.locator('#voice').fill('dig')
        page.locator('form button').click()
        event = saved(page)['session']['diary'][-1]
        check('Voice obeyed feedback at max clarity', event['type'] == 'voice' and event['obeyed'] is True and 'dig' in page.locator('.ledger-log').inner_text(), page.locator('.ledger-log').inner_text())

        # Real visibilitychange listener exercised with controlled visibility getter;
        # headless tab switching does not reliably change visibilityState.
        fixture(page, quiet(initial), 'visibility time ratio')
        before = saved(page)['session']
        page.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}); document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_timeout(2200)
        hidden = saved(page)['session']
        page.evaluate("delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))")
        real_delta = hidden['realElapsedMs'] - before['realElapsedMs']
        world_delta = hidden['world']['elapsedMs'] - before['world']['elapsedMs']
        check('hidden listener uses 0.1 world speed', 1800 <= real_delta <= 3500 and 100 <= world_delta <= 400, {'realMs': real_delta, 'worldMs': world_delta, 'method': 'synthetic visibilitychange; actual runtime listener'})

        offline = quiet(initial)
        offline['session']['world']['god'].update(gp=50, regenCarryMs=330000)
        fixture(page, offline, 'timestamp 60 seconds old; GP carry 330 seconds', age=60000)
        caught = saved(page)
        elapsed = caught['session']['realElapsedMs'] - offline['session']['realElapsedMs']
        world_elapsed = caught['session']['world']['elapsedMs'] - offline['session']['world']['elapsedMs']
        check('60s real offline catches up at 0.1 world speed', 60000 <= elapsed < 63000 and 6000 <= world_elapsed < 6600, {'realMs': elapsed, 'worldMs': world_elapsed})
        check('GP regeneration uses wall time not world speed', caught['session']['world']['god']['gp'] == 51, caught['session']['world']['god'])
        check('catchup saved timestamp current', abs(page.evaluate('Date.now()') - caught['savedAtMs']) < 1500)

        second = attach(context.new_page())
        second.goto(URL)
        second.get_by_role('status').filter(has_text='another tab').wait_for()
        check('Web Locks available with one holder', second.evaluate('!!navigator.locks') and len(second.evaluate('navigator.locks.query().then(x=>x.held)')) == 1)
        check('second actual tab actions disabled', second.get_by_role('button', name='Blessing · 25 GP', exact=True).is_disabled())
        secondary = second.locator('.live-sheet').inner_text()
        # Closing primary flushes, then the still-open secondary must not write.
        page.close()
        frozen = second.evaluate('(key)=>localStorage.getItem(key)', KEY)
        second.wait_for_timeout(1300)
        check('readonly secondary does not advance or overwrite after primary closes', second.evaluate('(key)=>localStorage.getItem(key)', KEY) == frozen and second.locator('.live-sheet').inner_text() == secondary)
        shot(second, 'desktop-readonly.png')
        second.reload()
        ready(second)
        second.wait_for_timeout(300)
        check('secondary reload acquires released lock', second.get_by_role('button', name='Blessing · 25 GP', exact=True).is_enabled())
        second.close()
        context.close()

        # Separate context: normal new mobile session, never seeded from fixtures.
        mobile_context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, device_scale_factor=1, has_touch=True)
        mobile = attach(mobile_context.new_page())
        mobile.goto(URL)
        ready(mobile)
        mobile.wait_for_timeout(2200)
        mobile.locator('details.item summary').first.click()
        layout(mobile, 'mobile 390x844')
        shot(mobile, 'mobile-new-session.png')
        # Rich actual catalog gear via guaranteed real loot, rather than invented name.
        loot = quiet(saved(mobile))
        loot['session']['world']['tuning'].update(stepMs=100, itemFindBp=10000, questMileProgress=.01)
        fixture(mobile, loot, 'guaranteed real catalog loot for long-name wrapping')
        # Loot names are random: allow bounded real generation, rather than
        # assuming the first bag contains a >50-character catalog name.
        for attempt in range(10):
            mobile.wait_for_timeout(2200)
            names = mobile.locator('details.item summary').all_inner_texts()
            if max(map(len, names)) > 50:
                break
        inventory = quiet(saved(mobile))
        fixture(mobile, inventory, 'freeze generated real catalog inventory for wrapping')
        names = mobile.locator('details.item summary').all_inner_texts()
        check('actual generated multi-part catalog names available', max(map(len, names)) > 50, names)
        longest = max(range(len(names)), key=lambda i: len(names[i]))
        mobile.locator('details.item summary').nth(longest).click()
        layout(mobile, 'mobile inventory expanded')
        shot(mobile, 'mobile-inventory-controlled-loot.png')
        mobile.get_by_role('link', name='God', exact=True).click()
        check('mobile navigation reaches controls', mobile.locator('.divine').is_visible())
        mobile.screenshot(path=str(OUT / 'mobile-god-controls.png'))
        results['screenshots'].append(str(OUT / 'mobile-god-controls.png'))
        mobile.goto(URL + '?sandbox=1')
        check('sandbox route renders isolated laboratory', mobile.locator('body').inner_text() != '' and mobile.locator('.ledger').count() == 0, mobile.locator('body').inner_text()[:500])
        mobile.goto(URL + '#sandbox')
        check('hash sandbox route works', mobile.locator('.ledger').count() == 0)
        mobile_context.close()

        corrupt_context = browser.new_context(viewport={'width':1440,'height':1000})
        corrupt = attach(corrupt_context.new_page())
        corrupt.goto(URL + '?sandbox=1')
        bad = '{broken original QA save'
        corrupt.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY,bad])
        corrupt.goto(URL)
        corrupt.get_by_role('alert').wait_for()
        check('corrupt original preserved byte-for-byte', corrupt.evaluate('(key)=>localStorage.getItem(key)', KEY) == bad)
        check('corrupt backup preserved', corrupt.evaluate('(key)=>localStorage.getItem(key+".corrupt")', KEY) == bad)
        check('corruption error visible actionable', 'preserv' in corrupt.get_by_role('alert').inner_text().lower(), corrupt.get_by_role('alert').inner_text())
        shot(corrupt, 'desktop-corrupt-save.png')
        corrupt_context.close()
        results['bfcache'] = 'UNKNOWN: Chromium launched by Playwright disables back-forward cache; synthetic persisted lifecycle already covered by unit tests, not claimed as real bfcache acceptance.'
        results['pseudo_locale'] = 'NOT RUN'
        check('no browser page errors', not results['pageerrors'], results['pageerrors'])
        check('no console errors', not results['console_errors'], results['console_errors'])
        check('no failed requests including workers', not results['failed_requests'] and not results['http_errors'], [results['failed_requests'],results['http_errors']])
        browser.close()
        browser = None
        results['exit'] = 0
finally:
    try:
        if browser:
            browser.close()
    except Exception:
        pass  # Playwright context already stops browser on assertion failure.
    if server.poll() is None:
        os.killpg(server.pid, signal.SIGTERM)
    server.wait(timeout=10)
    results.setdefault('exit', 1)
    (OUT / 'results.json').write_text(json.dumps(results, indent=2))
    print('Evidence:', OUT / 'results.json', flush=True)
