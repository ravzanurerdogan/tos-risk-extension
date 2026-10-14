const KATEGORILER = [
  "veri_paylasimi", "takip_izleme", "otomatik_yenileme", "iade_yok",
  "tek_tarafli_degisiklik", "fiyat_degisikligi", "icerik_kaldirma", "sorumluluk_sinirlamasi",
  "tahkim_dava_hakki", "icerik_lisansi", "hesap_kapatma", "veri_saklama", "diger",
];
const CIDDIYETLER = ["dusuk", "orta", "yuksek"];
const AGIRLIK = { dusuk: 5, orta: 12, yuksek: 25 };
const MIN_ALINTI = 20;     // çok kısa alıntılar kanıt sayılmaz
const DUSUK_GUVEN = 0.6;   // bunun altı "emin değilim" olarak işaretlenir

// Alıntı eşleştirmede küçük farkları (tırnak türü, boşluk, büyük/küçük harf) yok sayar.
function normalizeText(s) {
  return String(s)
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// "Yüksek" -> "yuksek", "Düşük" -> "dusuk" (Türkçe karakter ve büyük/küçük harf farklarını giderir)
function slug(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .toLowerCase().trim().replace(/[\s-]+/g, "_");
}

// Tek bir maddeyi kontrol eder. Sorun varsa nedenini (string), yoksa null döner.
function checkMadde(m, normalizedSource) {
  if (!m || typeof m !== "object") return "Madde bir nesne değil";
  // Biçim farklarını düzelt (içerik değil, yazım): kategori bilinmiyorsa "diger" olur
  const kat = slug(m.kategori);
  m.kategori = KATEGORILER.includes(kat) ? kat : "diger";
  m.ciddiyet = slug(m.ciddiyet);
  if (!CIDDIYETLER.includes(m.ciddiyet)) return "Geçersiz ciddiyet: " + m.ciddiyet;
  if (typeof m.alinti !== "string" || !m.alinti.trim()) return "Alıntı yok";
  if (typeof m.aciklama_tr !== "string" || !m.aciklama_tr.trim()) return "Açıklama yok";
  if (typeof m.guven !== "number" || m.guven < 0 || m.guven > 1) return "Güven 0-1 arasında değil";
  const q = normalizeText(m.alinti);
  if (q.length < MIN_ALINTI) return "Alıntı çok kısa";
  if (q.includes("...")) return "Alıntıda '...' var, birebir alıntı değil";
  if (!normalizedSource.includes(q)) {
    return normalizedSource.includes(q.slice(0, 40))
      ? "Alıntının başı bulundu ama devamı kaynakla uyuşmuyor (model alıntıyı değiştirmiş)"
      : "Alıntı kaynak metinde hiç bulunamadı (büyük olasılıkla hafızadan uydurulmuş)";
  }
  return null;
}

function validateReport(raw, sourceText) {
  const accepted = [];
  const rejected = [];
  if (!raw || !Array.isArray(raw.maddeler)) {
    return { accepted, rejected, fatal: "Şema hatası: 'maddeler' dizisi yok" };
  }
  const src = normalizeText(sourceText);
  for (const m of raw.maddeler) {
    const neden = checkMadde(m, src);
    if (neden) rejected.push({ madde: m, neden });
    else accepted.push({ ...m, belirsiz: m.guven < DUSUK_GUVEN });
  }
  return { accepted, rejected, fatal: null };
}

// Skor tamamen kodla hesaplanır:
// - Aynı kategori bir kez sayılır (o kategorideki en yüksek ciddiyet).
// - Düşük güvenli (belirsiz) maddeler yarım puan.
// - Toplam, tavana yapışmasın diye yumuşak bir eğriyle 0-100'e sıkıştırılır.
function computeScore(accepted) {
  const enIyi = {};
  for (const m of accepted) {
    const puan = AGIRLIK[m.ciddiyet] * (m.belirsiz ? 0.5 : 1);
    if (!(m.kategori in enIyi) || puan > enIyi[m.kategori]) enIyi[m.kategori] = puan;
  }
  const toplam = Object.values(enIyi).reduce((t, p) => t + p, 0);
  const skor = Math.round(100 * (1 - Math.exp(-toplam / 70)));
  const seviye = skor >= 60 ? "Yüksek" : skor >= 30 ? "Orta" : "Düşük";
  return { skor, seviye };
}

// --- Prompt injection savunması (sezgisel, mükemmel değil) ---
const ENJEKSIYON_KALIPLARI = [
  /ignore (all |any )?(of )?(the |your )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /disregard (all |any )?(the |your )?(previous|prior|above)/i,
  /(önceki|onceki|yukarıdaki|yukaridaki)[^.]{0,30}(unut|yok say|görmezden|gormezden)/i,
  /\b(system|sistem)\s*:/i,
  /(note|notice|not|uyarı) (to|for) (ai|llm|automated|language model)/i,
  /(report|rate|mark|classify|işaretle|raporla|değerlendir)\S*[^.]{0,60}(low risk|düşük risk|dusuk risk)/i,
  /(return|döndür|bırak)\S*[^.]{0,30}(empty|boş)/i,
  /(every|all) clauses?[^.]{0,40}(low|dusuk|düşük)/i,
  /(tüm|tum|bütün|butun) maddeler\S*[^.]{0,40}(dusuk|düşük|low)/i,
  /(this|bu) (document|belge)[^.]{0,30}(safe|güvenli|guvenli)/i,
  /<\/?sayfa_/i,
];

// Metinde talimat benzeri kalıpları bulur (gösterim için).
function detectInjection(text, kaynak) {
  const bulgular = [];
  const t = String(text || "");
  for (const re of ENJEKSIYON_KALIPLARI) {
    const m = re.exec(t);
    if (m) {
      const bas = Math.max(0, m.index - 30);
      bulgular.push({
        kaynak,
        parca: t.slice(bas, m.index + m[0].length + 60).replace(/\s+/g, " "),
      });
    }
  }
  return bulgular;
}

// Şüpheli cümleleri metinden çıkarır. Çıkarılanlar kullanıcıya gösterilir (sessizce silmiyoruz).
function sanitizeText(text) {
  const parcalar = String(text).split(/(?<=[.!?])\s+/);
  const kalan = [];
  const cikarilan = [];
  for (const p of parcalar) {
    if (ENJEKSIYON_KALIPLARI.some((re) => re.test(p))) cikarilan.push(p);
    else kalan.push(p);
  }
  return { text: kalan.join(" "), cikarilan };
}