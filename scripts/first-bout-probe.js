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
  let clicked = null, hostReady = null, firstReady = false, firstFailed = false, recordingFailed = false, firstRequest = null;
  const captureFirstRequest = () => {
    const src = document.querySelector('#arena iframe')?.getAttribute('src');
    if (!src || firstRequest) return;
    const params = new URL(src, location.href).searchParams;
    if (!params.has('twitchBout')) return;
    firstRequest = { boutId: params.get('twitchBout'), a: params.get('fighter'), b: params.get('opponent'), seed: Number(params.get('bout')) };
    navigationObserver.disconnect();
  };
  const navigationObserver = new MutationObserver(captureFirstRequest);
  const show = text => {
    let output = document.getElementById('first-bout-measurement');
    if (!output) {
      output = document.createElement('output'); output.id = 'first-bout-measurement';
      output.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;background:#fff;color:#111;padding:8px;font:14px monospace';
      document.body.append(output);
    }
    output.textContent = text;
  };
  const save = async (report, successText) => {
    try {
      const response = await fetch('/__profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
      if (!response.ok) throw new Error('Collector rejected the report');
      if (successText && !recordingFailed) show(successText);
    } catch {
      recordingFailed = true;
      show('Measurement could not be saved; check the local collector and reload before measuring again.');
    }
  };
  const frameSnapshot = frame => {
    try { return frame.contentWindow.__firstBoutSnapshot?.() ?? null; } catch { return null; }
  };
  const hiddenDuringSample = sample => {
    if (!sample) return false;
    const start = clicked - sample.originTime;
    return sample.visibility.filter(e => e.at <= start).at(-1)?.hidden
      || sample.visibility.some(e => e.at >= start && e.hidden);
  };
  document.addEventListener('click', event => {
    if (clicked === null && event.target instanceof Element && event.target.closest('#start:not(:disabled)')) {
      clicked = performance.timeOrigin + performance.now();
      navigationObserver.observe(document.querySelector('#arena'), { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      captureFirstRequest();
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
        parent: snapshot(), frame: frameSnapshot(frame) };
      const resources = report.frame?.resources ?? [];
      report.cacheHits = resources.filter(e => e.transfer === 0 && e.decoded > 0).map(e => e.path);
      report.revalidated = resources.filter(e => e.transfer === 300 && e.encoded > 0).map(e => e.path);
      report.frameEncodedBytes = resources.reduce((sum, e) => sum + e.encoded, 0);
      report.invalidReasons = [
        firstFailed && 'First attempt failed before ready',
        (!firstRequest || Object.keys(firstRequest).some(key => data[key] !== firstRequest[key])) && 'Ready is not from the initial attempt',
        (!report.frame || !resources.length) && 'Missing iframe resource timings',
        (report.cacheHits.length || report.revalidated.length) && 'HTTP cache was used',
        resources.some(e => e.status !== 200) && 'Resource status is unsuccessful or unknown',
        (hiddenDuringSample(report.parent) || hiddenDuringSample(report.frame)) && 'Document was hidden during measurement',
      ].filter(Boolean);
      if (report.invalidReasons.length) report.kind = 'invalid';
      void save(report, report.kind === 'invalid' ? `First bout sample is invalid: ${report.invalidReasons.join('; ')}`
        : `First bout ready: ${readyMs.toFixed(0)} ms · ${(report.frameEncodedBytes / 1e6).toFixed(2)} MB · cache hits 0`);
    }
    if (data?.type === 'oddbout:twitch:bout-result') {
      void save({ kind: 'result', fighters: [data.a, data.b], seed: data.seed, winner: data.winnerId, result: data.result });
    }
    if (data?.type === 'oddbout:twitch:bout-error') {
      if (!firstReady) { firstFailed = true; show('First bout failed; sample is invalid'); }
      void save({ kind: 'error', message: data.message, fighters: [data.a, data.b], seed: data.seed,
        parent: snapshot(), frame: frameSnapshot(frame) });
    }
  });
})();
