// Injected only by the local measurement server, never shipped with the app.
(() => {
  performance.setResourceTimingBufferSize(3000);
  const longTasks = [], errors = [], visibility = [{ at: performance.now(), hidden: document.hidden }];
  window.addEventListener('error', event => errors.push({ at: performance.now(), message: event.message }));
  window.addEventListener('unhandledrejection', event => errors.push({ at: performance.now(), message: String(event.reason) }));
  document.addEventListener('visibilitychange', () => visibility.push({ at: performance.now(), hidden: document.hidden }));
  try { new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, ms: e.duration }))))
    .observe({ type: 'longtask', buffered: true }); } catch { /* Unsupported browsers still report resource timings. */ }
  const snapshot = () => ({
    originTime: performance.timeOrigin,
    viewport: [innerWidth, innerHeight],
    marks: performance.getEntriesByType('mark').filter(e => e.name.startsWith('oddbout:')).map(e => ({ name: e.name, at: e.startTime })),
    resources: performance.getEntriesByType('resource').filter(e => e.name.startsWith(location.origin + '/') && !e.name.includes('/__profile'))
      .map(e => ({ path: new URL(e.name).pathname, type: e.initiatorType, start: e.startTime, end: e.responseEnd,
        ms: e.duration, transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize,
        status: e.responseStatus, delivery: e.deliveryType })),
    longTasks, errors, visibility,
  });
  window.__firstBoutSnapshot = snapshot;
  if (window !== window.parent) return;
  let clicked = null, hostReady = null, firstReady = false;
  const show = text => {
    let output = document.getElementById('first-bout-measurement');
    if (!output) {
      output = document.createElement('output'); output.id = 'first-bout-measurement';
      output.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;background:#fff;color:#111;padding:8px;font:14px monospace';
      document.body.append(output);
    }
    output.textContent = text;
  };
  document.addEventListener('click', event => {
    if (clicked === null && event.target instanceof Element && event.target.closest('#start:not(:disabled)')) {
      clicked = performance.timeOrigin + performance.now();
      show('Measuring first bout…');
    }
  }, true);
  window.addEventListener('message', event => {
    const frame = document.querySelector('#arena iframe');
    if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow || clicked === null) return;
    const data = event.data;
    if (data?.type === 'oddbout:twitch:host-ready' && hostReady === null) hostReady = performance.timeOrigin + performance.now() - clicked;
    if (data?.type === 'oddbout:twitch:bout-ready' && !firstReady) {
      const readyMs = performance.timeOrigin + performance.now() - clicked;
      firstReady = true;
      const report = { kind: 'ready', clicked, readyMs, hostReadyMs: hostReady, fighters: [data.a, data.b], seed: data.seed,
        userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
        parent: snapshot(), frame: frame.contentWindow.__firstBoutSnapshot?.() };
      const resources = report.frame?.resources ?? [];
      report.cacheHits = resources.filter(e => e.transfer === 0 && e.decoded > 0).map(e => e.path);
      report.revalidated = resources.filter(e => e.transfer === 300 && e.encoded > 0).map(e => e.path);
      report.frameEncodedBytes = resources.reduce((sum, e) => sum + e.encoded, 0);
      show(`First bout ready: ${readyMs.toFixed(0)} ms · ${(report.frameEncodedBytes / 1e6).toFixed(2)} MB · cache hits ${report.cacheHits.length}`);
      void fetch('/__profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    }
    if (data?.type === 'oddbout:twitch:bout-result') {
      void fetch('/__profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'result', fighters: [data.a, data.b], seed: data.seed, winner: data.winnerId, result: data.result }) });
    }
    if (data?.type === 'oddbout:twitch:bout-error') {
      if (!firstReady) show('First bout failed; sample is invalid');
      void fetch('/__profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'error', message: data.message, fighters: [data.a, data.b], seed: data.seed,
          parent: snapshot(), frame: frame.contentWindow.__firstBoutSnapshot?.() }) });
    }
  });
})();
