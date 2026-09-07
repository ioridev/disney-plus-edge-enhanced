export function isDisneyPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.disneyplus.com'
      && !url.username && !url.password && (url.port === '' || url.port === '443');
  } catch { return false; }
}

// Serialized by scripting.executeScript. Keep this function self-contained;
// it has no extension APIs, arbitrary code/URL inputs, or license access.
export function applyPageCommand(command) {
  try {
    const url = new URL(location.href);
    if (url.origin !== 'https://www.disneyplus.com' || url.username || url.password) return { ok: false };
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__DisneyPlusEdgeEnhancedToolbar');
    const control = descriptor?.value;
    if (command === 'start-intel-4k') {
      // No fallback to a raw ticket: the new page helper must check Intel both
      // here and after reload. An older installed helper needs an explicit update.
      if (typeof control?.prepareIntel4k !== 'function') return { ok: false, reason: 'reload-required' };
      return control.prepareIntel4k();
    }
    if (command === 'toggle-fullhd') {
      if (typeof control?.prepareToggle === 'function') return control.prepareToggle();
      // An extension installed/updated on an already-open page starts on the
      // next reload. Do not inject another copy into an old playback session.
      const key = 'ioridev.disneyplus4k.mode.v1';
      const mode = localStorage.getItem(key) === 'fullhd' ? 'original' : 'fullhd';
      sessionStorage.removeItem('ioridev.disneyplus4k.once.v0.5.0');
      if (sessionStorage.getItem('ioridev.disneyplus4k.once.v0.5.0') !== null) return { ok: false };
      localStorage.setItem(key, mode);
      return { ok: localStorage.getItem(key) === mode, reload: true, mode };
    }
    if (command === 'toggle-debug') {
      if (typeof control?.toggleDebug === 'function') {
        const state = control.toggleDebug();
        return { ok: true, reload: false, mode: state.mode, failed: state.failed === true };
      }
      const key = 'ioridev.disneyplus.debug-ui.v1';
      sessionStorage.setItem(key, '1');
      return { ok: sessionStorage.getItem(key) === '1', reload: true };
    }
  } catch { /* Fixed failure only: no page-controlled exceptions leave the page. */ }
  return { ok: false };
}

export function badgeState(report) {
  if (report?.reason === 'intel-gpu-required') return { text: '!', color: '#946200', title: 'Intel GPUを確認できず4Kは開始していません。デバッグUIを確認してください。' };
  if (report?.reason === 'reload-required') return { text: '!', color: '#946200', title: '4Kの開始には拡張とDisney+ページを再読み込みしてください。' };
  if (report?.failed === true) return { text: '!', color: '#b42318', title: '再生を中止しました。右クリックからデバッグUIを確認してください。' };
  if (report?.mode === '4k-hdr10-sdk-playready') return { text: '4K', color: '#1769e0', title: '4K HDR10要求 ON — クリックでOFF（このページのみ・実際の画質やHDR表示とは別）' };
  if (report?.mode === 'fullhd') return { text: 'HD', color: '#1769e0', title: 'フルHD要求 ON — クリックでOFF（実際の再生画質とは別）' };
  if (report?.mode && report.mode !== 'original') return { text: 'DBG', color: '#946200', title: 'デバッグモード — クリックで通常のフルHD要求に切り替え' };
  return { text: 'OFF', color: '#64748b', title: 'フルHD要求 OFF — クリックでON' };
}

export function installToolbar(api) {
  const busy = new Set();
  const menuId = 'disney-plus-enhanced-debug';
  const intel4kMenuId = 'disney-plus-enhanced-intel-4k';
  async function paint(tabId, report) {
    const view = badgeState(report);
    await Promise.all([
      api.action.setBadgeText({ tabId, text: view.text }),
      api.action.setBadgeBackgroundColor({ tabId, color: view.color }),
      api.action.setTitle({ tabId, title: `Disney+ Edge Enhanced — ${view.title}` }),
    ]);
  }
  async function handleCommand(tab, command) {
    if (!Number.isInteger(tab?.id) || tab.id < 0 || !isDisneyPage(tab.url) || busy.has(tab.id)) return;
    busy.add(tab.id);
    try {
      const results = await api.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] }, world: 'MAIN',
        func: applyPageCommand, args: [command],
      });
      const result = results.find((item) => item.frameId === 0)?.result;
      if (result?.ok !== true) {
        await paint(tab.id, { failed: true, reason: result?.reason });
        return;
      }
      if (result.mode) await paint(tab.id, result);
      // Reload only the explicitly clicked tab; never restart Edge or reload
      // other Disney+ tabs. The next document reads the setting synchronously.
      if (result.reload === true) {
        const current = await api.tabs.get(tab.id);
        if (current.url === tab.url && isDisneyPage(current.url)) await api.tabs.reload(tab.id);
      }
    } catch {
      await paint(tab.id, { failed: true }).catch(() => {});
    } finally { busy.delete(tab.id); }
  }

  api.action.onClicked.addListener((tab) => { void handleCommand(tab, 'toggle-fullhd'); });
  api.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === menuId) void handleCommand(tab, 'toggle-debug');
    if (info.menuItemId === intel4kMenuId) void handleCommand(tab, 'start-intel-4k');
  });
  api.runtime.onInstalled.addListener(() => {
    void api.contextMenus.removeAll().then(() => {
      api.contextMenus.create({
        id: menuId, title: 'デバッグUIを表示／非表示', contexts: ['action'],
        documentUrlPatterns: ['https://www.disneyplus.com/*'],
      });
      api.contextMenus.create({
        id: intel4kMenuId, title: '4Kを開始（Intel GPU向け・このページのみ）', contexts: ['action'],
        documentUrlPatterns: ['https://www.disneyplus.com/*'],
      });
    }).catch(() => {});
  });
  api.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== api.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)
      || !isDisneyPage(sender.url) || message?.type !== 'disney-plus-enhanced-status') return;
    const report = message.state;
    if (!report || typeof report.mode !== 'string' || report.mode.length > 64
      || !/^[a-z0-9-]+$/.test(report.mode) || typeof report.failed !== 'boolean') return;
    // Page-origin reports affect only this tab's badge. They cannot execute
    // scripts, toggle preferences, open URLs, or trigger a reload.
    void paint(sender.tab.id, report).catch(() => {});
  });
  void paint(undefined, { mode: 'original' }).catch(() => {});
  return { handleCommand };
}
