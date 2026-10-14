// Bu fonksiyon SAYFANIN İÇİNDE çalışır (enjekte edilir).
function extractPageText() {
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

  function parseRgba(c) {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function effectiveBg(el) {
    for (let e = el; e; e = e.parentElement) {
      const c = parseRgba(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 }; // tarayıcı varsayılanı: beyaz
  }
  function isHidden(el) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.fontSize) < 2) return true;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return true;
    // ekran dışına taşınmış (sayfanın solunun ya da üstünün dışında)
    if (rect.right + window.scrollX <= 0 || rect.bottom + window.scrollY <= 0) return true;
    // yazı rengi ≈ zemin rengi (beyaz üstüne beyaz gibi)
    const fg = parseRgba(cs.color);
    const bg = effectiveBg(el);
    if (fg && Math.abs(fg.r - bg.r) + Math.abs(fg.g - bg.g) + Math.abs(fg.b - bg.b) < 30) return true;
    return false;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const visible = [];
  const hidden = [];
  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el || skip.has(el.tagName)) continue;
    const t = node.textContent.replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (isHidden(el)) hidden.push(t);
    else visible.push(t);
  }
  return {
    url: location.href,
    title: document.title,
    text: visible.join(" "),
    hiddenCount: hidden.length,
    hiddenSample: hidden.slice(0, 3),
    hiddenText: hidden.join(" ").slice(0, 5000),
  };
}

// Raporu DOM ile çiziyoruz (innerHTML değil): LLM çıktısı sayfaya HTML olarak girmesin.
function el(tag, text, style) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (style) e.style.cssText = style;
  return e;
}

function renderReport(sonuc, page) {
  const root = document.getElementById("report");
  root.replaceChildren();
  if (sonuc.fatal) {
    root.append(el("p", "Hata: " + sonuc.fatal, "color:#b00020"));
    return;
  }
  const { skor, seviye } = computeScore(sonuc.accepted);
    const enjVar = (sonuc.enjeksiyonKod || []).length > 0 || (sonuc.cikarilan || []).length > 0;
  if (enjVar && sonuc.accepted.length === 0) {
    root.append(el("h2", "Risk skoru: hesaplanamadı", "margin:12px 0 4px;color:#b00020"));
    root.append(el("p", "Sayfa yapay zekayı yönlendirmeye çalışıyor ve hiçbir bulgu doğrulanamadı. '0 risk' sonucu güvenilir değildir.", "font-size:13px;color:#b00020"));
  } else {
    root.append(el("h2", `Risk skoru: ${skor}/100 (${seviye})`, "margin:12px 0 4px"));
  }
    if (sonuc.kesildi || sonuc.basarisiz > 0)
    root.append(el("p", "Analiz eksik olduğu için bu skor gerçek riskten DÜŞÜK olabilir.", "color:#8a6d00;font-size:12px;margin:0"));
  root.append(el("div",
    `${sonuc.accepted.length} doğrulanmış madde · ${sonuc.rejected.length} madde doğrulamadan geçemedi ve atıldı`,
    "font-size:12px;color:#555"));
      if (sonuc.accepted.length === 0 && sonuc.rejected.length > 0)
    root.append(el("p", "⚠️ Hiçbir bulgu doğrulanamadı. Bu 'risk yok' demek değildir, skor güvenilir değil.", "color:#8a6d00"));

     if (sonuc.kesildi) root.append(el("p", "⚠️ Metin çok uzundu, sonu analiz edilmedi. Oradaki riskler görülmemiş olabilir.", "color:#8a6d00"));
    if (sonuc.basarisiz > 0) {
    root.append(el("p", `⚠️ ${sonuc.parcaSayisi} parçadan ${sonuc.basarisiz} tanesi analiz edilemedi, rapor eksik olabilir.`, "color:#8a6d00"));
    for (const h of sonuc.hatalar) root.append(el("div", h, "font-size:11px;color:#8a6d00;margin-left:8px"));
  }
    const enj = sonuc.enjeksiyonKod || [];
  if (enj.length) {
    root.append(el("p",
      "🛡️ Sayfada yapay zekaya yönelik talimat benzeri metin bulundu. Bu analizin skoru güvenilir değil.",
      "background:#fde8e8;padding:8px;border-radius:6px;font-size:13px;font-weight:bold"));
    for (const b of enj)
      root.append(el("div", `[${b.kaynak}] …${b.parca}…`, "font-size:11px;color:#8a1c1c;margin:2px 0 2px 8px"));
  }
  if (sonuc.enjeksiyon.trim())
    root.append(el("div", "Modelin notu: " + sonuc.enjeksiyon.slice(0, 200), "font-size:11px;color:#555"));
  if ((sonuc.cikarilan || []).length) {
    const d = el("details");
    d.append(el("summary", `Modele gönderilmeyen ${sonuc.cikarilan.length} şüpheli cümle`));
    for (const c of sonuc.cikarilan) d.append(el("p", "• " + c, "font-size:11px;margin:4px 0"));
    root.append(d);
  }
  if (page.hiddenCount > 0)
    root.append(el("p", `Sayfada ${page.hiddenCount} gizli metin parçası vardı, analize dahil edilmedi.`, "font-size:12px;color:#555"));

  for (const m of sonuc.accepted) {
    const kart = el("div", undefined, "border:1px solid #ddd;border-radius:6px;padding:8px;margin:8px 0");
    kart.append(el("b", `${m.kategori} · ${m.ciddiyet}`));
    if (m.belirsiz) kart.append(el("div", `⚠️ Model bu maddeden emin değil (güven: ${m.guven})`, "color:#8a6d00;font-size:12px"));
    kart.append(el("p", m.aciklama_tr, "margin:6px 0"));
    kart.append(el("blockquote", "“" + m.alinti + "”", "margin:0;padding-left:8px;border-left:3px solid #ccc;font-size:12px;color:#444"));
    root.append(kart);
  }

  if (sonuc.rejected.length) {
    const d = el("details");
    d.append(el("summary", "Atılan iddialar (neden)"));
        d.open = true;
    for (const r of sonuc.rejected) {
      const q = r.madde && typeof r.madde.alinti === "string" ? r.madde.alinti : "(alıntı yok)";
      d.append(el("p", "• " + r.neden, "font-size:12px;margin:6px 0 0"));
      d.append(el("blockquote", q, "margin:2px 0 6px;padding-left:8px;border-left:3px solid #e0a0a0;font-size:11px;color:#666"));
    }
    root.append(d);
  }
}

document.getElementById("analyze").addEventListener("click", async () => {
  const info = document.getElementById("info");
  const out = document.getElementById("output");
  document.getElementById("report").replaceChildren();
  out.textContent = "";
  info.textContent = "Sayfa okunuyor...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageText });
    const page = res.result;
    out.textContent = "Çıkarılan metnin başı:\n" + page.text.slice(0, 600);

    const temiz = sanitizeText(page.text);
    info.textContent = `${page.title} | ${temiz.text.length} karakter | analiz ediliyor...`;
    const sonuc = await runAnalysis(temiz.text, (i, n) => {
      info.textContent = `${page.title} | ${temiz.text.length} karakter | parça ${i}/${n} analiz ediliyor...`;
    });
    sonuc.cikarilan = temiz.cikarilan;
    sonuc.enjeksiyonKod = [
      ...detectInjection(page.text, "görünür metin"),
      ...detectInjection(page.hiddenText, "gizli metin (analize girmedi)"),
    ];
    info.textContent = `${page.title} | ${temiz.text.length} karakter`;
        window.sonSonuc = { page, temizMetin: temiz.text, sonuc };
    renderReport(sonuc, page);
  } catch (e) {
    console.error("Analiz hatası:", e);
    info.textContent = "Hata: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e);
  }
});

// --- Ayarlar ve LLM testi ---
const keyStatus = document.getElementById("keyStatus");

chrome.storage.local.get("apiKey").then(({ apiKey }) => {
  if (apiKey) keyStatus.textContent = "Anahtar kayıtlı ✅";
});

document.getElementById("saveKey").addEventListener("click", async () => {
  const v = document.getElementById("apiKey").value.trim();
  if (!v) { keyStatus.textContent = "Boş anahtar kaydedilmedi."; return; }
  await chrome.storage.local.set({ apiKey: v });
  document.getElementById("apiKey").value = "";
  keyStatus.textContent = "Anahtar kaydedildi ✅";
});

document.getElementById("testLlm").addEventListener("click", async () => {
  keyStatus.textContent = "Test ediliyor...";
  try {
    const schema = {
      type: "OBJECT",
      properties: { durum: { type: "STRING" }, sayi: { type: "INTEGER" } },
      required: ["durum", "sayi"],
    };
    const r = await callGemini("Bana durum olarak 'hazır' ve sayi olarak 7 döndür.", schema);
    keyStatus.textContent = "Cevap: " + JSON.stringify(r) + " ✅";
  } catch (e) {
    keyStatus.textContent = "Hata: " + e.message;
  }
});
document.getElementById("exportBtn").addEventListener("click", () => {
  const s = window.sonSonuc;
  if (!s) { alert("Önce bir analiz çalıştır."); return; }
  const veri = {
    url: s.page.url,
    baslik: s.page.title,
    tarih: new Date().toISOString(),
    model: MODEL,
    metin: s.temizMetin,
    kabul: s.sonuc.accepted,
    atilan: s.sonuc.rejected,
    cikarilan: s.sonuc.cikarilan || [],
    kesildi: s.sonuc.kesildi,
    basarisizParca: s.sonuc.basarisiz || 0,
  };
  const blob = new Blob([JSON.stringify(veri, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "eval-" + new URL(s.page.url).hostname.replace(/\W/g, "_") + ".json";
  a.click();
});