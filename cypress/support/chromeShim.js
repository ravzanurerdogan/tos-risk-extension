// Chrome uzantı API'lerinin test için sahte sürümü.
// Gerçek uzantıdaki sidepanel.js bunları çağırıyor; burada yerel bir sayfaya yönlendiriyoruz.
export function installChromeShim(win, { targetPath, apiKey = "test-key" } = {}) {
  const store = { apiKey };
  let framePromise = null;

  // Hedef sayfa (ToS) görünmez bir iframe içinde yüklenir; extractPageText orada çalışır.
  function getFrame() {
    if (framePromise) return framePromise;
    framePromise = new Promise((resolve) => {
      const f = win.document.createElement("iframe");
      f.src = targetPath;
      f.style.cssText =
        "position:fixed;right:0;bottom:0;width:800px;height:900px;opacity:0;pointer-events:none;border:0";
      f.onload = () => resolve(f);
      win.document.body.appendChild(f);
    });
    return framePromise;
  }

  win.chrome = {
    storage: {
      local: {
        get: async (k) => (typeof k === "string" ? { [k]: store[k] } : { ...store }),
        set: async (o) => { Object.assign(store, o); },
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: targetPath, title: "hedef sayfa" }],
    },
    scripting: {
      executeScript: async ({ func }) => {
        const frame = await getFrame();
        const result = frame.contentWindow.eval("(" + func.toString() + ")()");
        return [{ result }];
      },
    },
    sidePanel: {},
  };
}