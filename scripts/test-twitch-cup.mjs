import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Real local Chrome, isolated profile. Optional rAF cadence/seed are test-only fault injection.
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
// Match the dev server's host: Vite listens on `localhost`, which can resolve to IPv6 only.
const url = args.url ?? 'http://localhost:5178/twitch.html?lang=en';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Use a local test server');
const rafMs = Number(args['raf-ms'] ?? 0), seed = args.seed === undefined ? null : Number(args.seed);
const durationMs = Number(args['duration-ms'] ?? 780000);
if (!Number.isFinite(rafMs) || rafMs < 0 || !Number.isFinite(durationMs) || durationMs <= 0
  || (seed !== null && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff))) throw new Error('Invalid timing or seed argument');
const out = resolve(args.out ?? 'browser-report');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !('headed' in args),
  // Do not let automation silently turn off Chrome's normal background policies.
  ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [], requestsFailed = [], clocks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', req => requestsFailed.push({ url: req.url(), error: req.failure()?.errorText }));
await context.addInitScript(({ rafMs, seed }) => {
  if (rafMs > 0) {
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), rafMs);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  }
  if (window !== window.parent) return;
  if (seed !== null) {
    let next = seed;
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = array => array instanceof Uint32Array && array.length === 1
      ? (array[0] = next++ >>> 0, array) : random(array);
  }
  window.__cupTestEvents = [];
  window.addEventListener('message', event => {
    const frame = document.querySelector('#arena iframe');
    if (event.origin === location.origin && event.source === frame?.contentWindow
      && /^oddbout:twitch:bout-(ready|result|error)$/.test(event.data?.type)) {
      window.__cupTestEvents.push({ at: performance.now(), ...event.data });
    }
  });
}, { rafMs, seed });
let outcome = 'incomplete', summary;
try {
  await page.goto(url);
  await page.locator('summary').filter({ hasText: 'Try it solo' }).click();
  await page.getByRole('button', { name: 'Try without Twitch', exact: true }).click();
  await page.getByRole('button', { name: 'Fill all 4 slots', exact: true }).click();
  const startAt = Date.now();
  await page.locator('#start').click();
  while (Date.now() - startAt < durationMs) {
    const state = await page.evaluate(() => {
      const win = document.querySelector('#arena iframe')?.contentWindow;
      const game = win?.__game, loop = game?.loop;
      const scene = game?.scene.getScenes(false).find(scene => scene.sys.settings.key === 'ArenaDuel');
      return { phase: document.querySelector('#twitch-cup')?.dataset.phase,
        round: document.querySelector('#round')?.textContent, notice: document.querySelector('#notice')?.textContent,
        retry: document.querySelector('#retry')?.hidden === false,
        clock: loop && { hidden: win.document.hidden, focused: win.document.hasFocus(), inFocus: loop.inFocus,
          rawDelta: loop.rawDelta, actualFps: loop.actualFps, smoothStep: loop.smoothStep, setTimeoutLoop: loop.raf.isSetTimeOut,
          frame: loop.frame, screenMs: scene?.screenMs, simMs: scene?.duel?.session?.snapshot?.ms,
          boutId: scene?.dataIn?.matchId, started: scene?.started, paused: scene?.paused, failed: scene?.failed },
      };
    });
    clocks.push({ wallMs: Date.now() - startAt, ...state });
    if (state.phase === 'complete') { outcome = 'complete'; break; }
    if (state.retry || errors.length) { outcome = 'failed'; break; }
    if (clocks.length % 6 === 0) console.log(JSON.stringify(clocks.at(-1)));
    await page.waitForTimeout(5000);
  }
  const events = await page.evaluate(() => window.__cupTestEvents);
  summary = { outcome, url, rafMs, seed, headless: !('headed' in args), browser: browser.version(), wallMs: Date.now() - startAt,
    events, clocks, errors, requestsFailed };
  await page.screenshot({ path: resolve(out, `${outcome}.png`), fullPage: true });
  if (outcome === 'complete') {
    const ready = events.filter(e => e.type === 'oddbout:twitch:bout-ready');
    const results = events.filter(e => e.type === 'oddbout:twitch:bout-result');
    if (ready.length !== 3 || results.length !== 3 || events.some(e => e.type.endsWith('error'))) throw new Error('Expected three real ready/result pairs');
    if (results.some((r, i) => r.boutId !== ready[i].boutId || r.seed !== ready[i].seed)) throw new Error('Result/attempt mismatch');
    if (results[2].a !== results[0].winnerId || results[2].b !== results[1].winnerId) throw new Error('Final must contain semifinal winners');
    if (await page.locator('#bracket .won').count() !== 3 || !(await page.locator('#champion').innerText()).trim()) throw new Error('Missing bracket/champion display');
    await page.getByRole('button', { name: 'New cup', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#round')?.textContent === 'OPEN LOBBY'
      && document.querySelector('#count')?.textContent === '0 / 4' && !document.querySelector('#arena iframe'));
    summary.resetVerified = true;
  }
} catch (error) {
  outcome = 'failed'; errors.push(String(error));
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ ...summary, outcome, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ outcome, results: summary?.events?.filter(e => e.type.endsWith('result')).map(e => ({ winner: e.winnerId, seed: e.seed, digest: e.result.digest })), out, errors }));
  await browser.close();
}
if (outcome !== 'complete' && !('diagnose' in args)) process.exitCode = 1;
