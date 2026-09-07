(() => {
  'use strict';
  // MAIN cannot call chrome.runtime. Relay only a bounded, display-only report
  // from the page to our worker; never accept page-origin action commands.
  let lastReport = '';
  addEventListener('disney-plus-enhanced:status', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 256 || event.detail === lastReport) return;
    try {
      const data = JSON.parse(event.detail);
      if (!data || typeof data.mode !== 'string' || data.mode.length > 64
        || !/^[a-z0-9-]+$/.test(data.mode) || typeof data.failed !== 'boolean') return;
      lastReport = event.detail;
      void chrome.runtime.sendMessage({
        type: 'disney-plus-enhanced-status',
        state: { mode: data.mode, failed: data.failed },
      }).catch(() => {});
    } catch { /* No raw events, URLs, diagnostics, or errors are forwarded. */ }
  });
  dispatchEvent(new Event('disney-plus-enhanced:request-status'));
})();
