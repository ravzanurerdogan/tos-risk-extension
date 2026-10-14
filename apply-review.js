// Çalıştır: node apply-review.js   (proje klasöründe; tekrar çalıştırmak zararsız)
const fs = require("fs");

// Senin cevapların: "aynı" = taslağa katıldın, "riskli" = GERÇEK
const SENIN = {
  3: "YANLIŞ ALARM", 10: "YANLIŞ ALARM", 12: "GERÇEK", 23: "GERÇEK",
  24: "SINIRDA", 25: "GERÇEK", 26: "GERÇEK", 27: "GERÇEK",
};

// ---- 1) review-extra-findings.md: tabloyu 9 sütuna tamamla, senin etiketlerini yaz
const f = "eval/review-extra-findings.md";
const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
let degisen = 0, atlanan = [];
const out = lines.map((l) => {
  const m = l.match(/^\|\s*(\d+)\s*\|/);
  if (!m) return l;
  const parts = l.split("|");
  const cells = parts.slice(1, -1);
  if (cells.length === 9) return l;           // zaten 9 sütun: dokunma
  if (cells.length !== 8) { atlanan.push(m[1]); return l; }
  const n = Number(m[1]);
  const sen = SENIN[n] ? ` **${SENIN[n]}** ` : " ";
  degisen++;
  return "|" + [...cells.slice(0, 7), sen, cells[7]].join("|") + "|";
});
let md = out.join("\n");
const ozet = "> **Kişi incelemesi:** 47 satırın 8'i (3, 10, 12, 23, 24, 25, 26, 27) kişi tarafından gözden geçirildi. 2 satırda (12, 25) taslak etiket değişti; kalan 39 satır yalnızca taslak etiketlidir. 'Senin etiketin' boş olan satırlar incelenmemiştir.\n";
if (!md.includes("Kişi incelemesi")) md = md.replace(/^(# Altın dışı bulgular[^\n]*\n)/, "$1\n" + ozet);
fs.writeFileSync(f, md);
console.log(`✔ review-extra-findings.md: ${degisen} satır 9 sütuna tamamlandı, ${Object.keys(SENIN).length} satıra etiket yazıldı`);
if (atlanan.length) console.log("! Biçimi beklenmedik, atlanan satırlar:", atlanan.join(", "));

// ---- 2) README: sayıları güncel etiketlerle yeniden yaz
let r = fs.readFileSync("README.md", "utf8");
const eski1 = "47 altın dışı bulgunun tamamı bir insan tarafından incelenmedi. Taslak etiketlemeye göre (etiketleyiciyle aynı kişi, bağımsız değil): **10 gerçek risk (altın liste eksik), 14 sınırda, 23 yanlış alarm** → yaklaşık %27 yanlış alarm oranı; kesinlik (precision) ≈ %57, sınırdakiler sayılırsa ≈ %73.";
const yeni1 = "47 altın dışı bulgunun 8'i kişi tarafından gözden geçirildi (2'sinde taslak etiket değişti), kalan 39'u yalnızca taslak etiketlidir. Güncel etiketlemeye göre (etiketleyiciyle aynı kişi, bağımsız değil): **12 gerçek risk (altın liste eksik), 13 sınırda, 22 yanlış alarm** → yaklaşık %26 yanlış alarm oranı; kesinlik (precision) ≈ %59, sınırdakiler sayılırsa ≈ %74.";
const eski2 = "(≈ %27 yanlış alarm, taslak)";
const yeni2 = "(≈ %26 yanlış alarm; etiketlerin yalnızca 8/47'si gözden geçirildi)";
for (const [a, b] of [[eski1, yeni1], [eski2, yeni2]]) {
  if (r.includes(a)) { r = r.replace(a, b); console.log("✔ README güncellendi:", b.slice(0, 50) + "…"); }
  else if (r.includes(b)) console.log("· README zaten güncel");
  else console.log("! README'de beklenen cümle bulunamadı, elle düzelt:", a.slice(0, 50) + "…");
}
fs.writeFileSync("README.md", r);
