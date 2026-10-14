"""
Eval karsilastirmasi: gold-*.json (altin etiketler) vs eval-*.json (sistem ciktisi: kabul).
Eslestirme: normalize edilmis sayfa metninde iki alintinin karakter araliklari
orutusuyorsa (orutusme >= %50 * kisa olanin uzunlugu) eslesme sayilir.
"""
import json, re, unicodedata, sys, os
from collections import Counter

UP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')  # eval-*.json dışa aktarımları buraya
GD = os.path.dirname(os.path.abspath(__file__))
SITES = [
  ("Netflix",  "eval-help_netflix_com.json", "gold-netflix.json"),
  ("Spotify",  "eval-www_spotify_com.json",  "gold-spotify.json"),
  ("Discord",  "eval-discord_com.json",      "gold-discord.json"),
  ("Trendyol", "eval-www_trendyol_com.json", "gold-trendyol.json"),
  ("Duolingo", "eval-www_duolingo_com.json", "gold-duolingo.json"),
]
OVERLAP_MIN = 0.5

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r"[\u2018\u2019\u201B\u2032]", "'", s)
    s = re.sub(r'[\u201C\u201D\u201E\u2033]', '"', s)
    s = re.sub(r'[\u200B-\u200D\uFEFF\u00AD]', '', s)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s

def interval(ns, quote):
    q = norm(quote); p = ns.find(q)
    return (p, p + len(q)) if p >= 0 else None

def overlap(a, b):
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    inter = max(0, hi - lo)
    return inter / max(1, min(a[1]-a[0], b[1]-b[0]))

def reason_group(neden):
    if "hiç bulunamadı" in neden or "hiç bulunamadı" in neden: return "uydurma (alıntı kaynakta yok)"
    if "başı bulundu" in neden: return "değiştirilmiş (başı doğru, devamı farklı)"
    if "'...'" in neden: return "'...' ile kesilmiş"
    if "Geçersiz" in neden: return "şema/biçim hatası"
    if "çok kısa" in neden: return "çok kısa"
    return "diğer: " + neden[:40]

rows, per_site, extras, all_missed = [], [], [], []
tot = Counter()

for name, ef, gf in SITES:
    ev = json.load(open(os.path.join(UP, ef)))
    gd = json.load(open(os.path.join(GD, gf)))
    ns = norm(ev['metin'])
    # sistem bulguları
    sysf = []
    for m in ev['kabul']:
        iv = interval(ns, m['alinti'])
        sysf.append({"m": m, "iv": iv, "matched": None})
    # gold
    gl = []
    for g in gd['maddeler']:
        iv = interval(ns, g['alinti'])
        gl.append({"g": g, "iv": iv, "kapsam": g.get("kapsam_icinde_8parca", True), "hit": None})
    # eşleştir
    for gi in gl:
        best = (0, None)
        if gi['iv'] is None: continue
        for si in sysf:
            if si['iv'] is None: continue
            o = overlap(gi['iv'], si['iv'])
            if o >= OVERLAP_MIN and o > best[0]: best = (o, si)
        if best[1] is not None:
            gi['hit'] = best[1]
    for si in sysf:
        for gi in gl:
            if gi['iv'] and si['iv'] and overlap(gi['iv'], si['iv']) >= OVERLAP_MIN:
                si['matched'] = gi['g']['id']; break

    g_total = len(gl)
    g_kapsam = [x for x in gl if x['kapsam']]
    g_disi = [x for x in gl if not x['kapsam']]
    tp = [x for x in g_kapsam if x['hit']]
    fn = [x for x in g_kapsam if not x['hit']]
    kes = [x for x in g_kapsam if x['g']['guc'] == 'kesin']
    sin = [x for x in g_kapsam if x['g']['guc'] == 'sinirda']
    kes_tp = [x for x in kes if x['hit']]
    sin_tp = [x for x in sin if x['hit']]
    cat_ok = sum(1 for x in tp if x['hit']['m']['kategori'] == x['g']['kategori'])
    sys_total = len(sysf)
    sys_matched = [s for s in sysf if s['matched']]
    sys_extra = [s for s in sysf if not s['matched']]
    belirsiz = sum(1 for s in sysf if s['m'].get('belirsiz'))
    reasons = Counter(reason_group(a['neden']) for a in ev['atilan'])

    st = dict(site=name, dil=gd.get('dil','')[:2], g_total=g_total, g_kapsam=len(g_kapsam), g_disi=len(g_disi),
              tp=len(tp), fn=len(fn), kes_tp=len(kes_tp), kes=len(kes), sin_tp=len(sin_tp), sin=len(sin),
              cat_ok=cat_ok, sys_total=sys_total, sys_matched=len(sys_matched), sys_extra=len(sys_extra),
              atilan=len(ev['atilan']), belirsiz=belirsiz, kesildi=ev['kesildi'], reasons=dict(reasons))
    per_site.append(st)
    for k in ['g_total','g_kapsam','g_disi','tp','fn','kes_tp','kes','sin_tp','sin','cat_ok','sys_total','sys_matched','sys_extra','atilan','belirsiz']:
        tot[k] += st[k]
    for x in fn:
        all_missed.append((name, x['g']))
    for x in g_disi:
        all_missed.append((name + " [KAPSAM DIŞI]", x['g']))
    for s in sys_extra:
        extras.append((name, s['m']))
    for r in ev['atilan']:
        tot["R:" + reason_group(r['neden'])] += 1

# ---- çıktı ----
def pct(a, b): return "—" if b == 0 else f"{100*a/b:.0f}%"

L = []
L.append("# Eval sonuçları (otomatik üretildi: eval/compare.py)\n")
L.append(f"Model: `{json.load(open(os.path.join(UP, SITES[0][1])))['model']}` · Eşleştirme: karakter aralığı örtüşmesi ≥ %{int(OVERLAP_MIN*100)} · MAX_CHUNKS=8\n")
L.append("## Özet tablo\n")
L.append("| Site | Dil | Altın madde | Kapsam dışı | **Yakalanan** | **Kaçırılan** | Recall (kapsam içi) | Sistem bulgusu | Altın dışı bulgu* | Atılan (uydurma/bozuk) | Belirsiz (güven<0.6) |")
L.append("|---|---|---|---|---|---|---|---|---|---|---|")
for s in per_site:
    L.append(f"| {s['site']} | {s['dil']} | {s['g_total']} | {s['g_disi']} | {s['tp']} | {s['fn']} | {pct(s['tp'], s['g_kapsam'])} | {s['sys_total']} | {s['sys_extra']} | {s['atilan']} | {s['belirsiz']} |")
L.append(f"| **Toplam** | | **{tot['g_total']}** | **{tot['g_disi']}** | **{tot['tp']}** | **{tot['fn']}** | **{pct(tot['tp'], tot['g_kapsam'])}** | **{tot['sys_total']}** | **{tot['sys_extra']}** | **{tot['atilan']}** | **{tot['belirsiz']}** |")
L.append("\n\\* *Altın dışı bulgu = sistemin doğrulanmış bulduğu ama altın etiketlerle eşleşmeyen madde. Bu otomatik olarak 'yanlış alarm' DEĞİLDİR: etiketleyici (ben) bir riski atlamış olabilir. İnsan incelemesi için `review-extra-findings.md` dosyasına bak.*\n")
L.append("## Güç ve kategori kırılımı\n")
L.append("| Site | Kesin: yakalanan | Sınırda: yakalanan | Kategori doğru (yakalananlar içinde) |")
L.append("|---|---|---|---|")
for s in per_site:
    L.append(f"| {s['site']} | {s['kes_tp']}/{s['kes']} ({pct(s['kes_tp'], s['kes'])}) | {s['sin_tp']}/{s['sin']} ({pct(s['sin_tp'], s['sin'])}) | {s['cat_ok']}/{s['tp']} ({pct(s['cat_ok'], s['tp'])}) |")
L.append(f"| **Toplam** | {tot['kes_tp']}/{tot['kes']} ({pct(tot['kes_tp'], tot['kes'])}) | {tot['sin_tp']}/{tot['sin']} ({pct(tot['sin_tp'], tot['sin'])}) | {tot['cat_ok']}/{tot['tp']} ({pct(tot['cat_ok'], tot['tp'])}) |")
L.append("\n## Doğrulayıcının attığı iddialar (neden)\n")
L.append("| Neden | Adet |")
L.append("|---|---|")
for k, v in sorted(((k[2:], v) for k, v in tot.items() if k.startswith("R:")), key=lambda x: -x[1]):
    L.append(f"| {k} | {v} |")
L.append("\n## Kaçırılan altın maddeler\n")
L.append("| Site | ID | Güç | Kategori | Alıntı (ilk 110 karakter) |")
L.append("|---|---|---|---|---|")
for name, g in all_missed:
    L.append(f"| {name} | {g['id']} | {g['guc']} | {g['kategori']} | {g['alinti'][:110].replace('|','/')}… |")
os.makedirs(os.path.join(GD, 'out'), exist_ok=True)
open(os.path.join(GD, 'out', 'RESULTS.generated.md'), 'w', encoding='utf-8').write("\n".join(L) + "\n")

R = ["# Altın dışı bulgular: insan incelemesi\n",
     "Sistemin doğrulanmış bulduğu ama gold listesinde karşılığı olmayan maddeler. Her birine bir etiket ver:\n",
     "- **GERÇEK**: gerçekten riskli, gold listesinde eksik kalmış (altın etiketi genişlet)\n- **YANLIŞ ALARM**: riskli değil / zararsız / kullanıcı lehine\n- **SINIRDA**: tartışmalı\n",
     "| # | Site | Kategori | Ciddiyet | Güven | Alıntı | Sistemin açıklaması | Senin etiketin |", "|---|---|---|---|---|---|---|---|"]
for i, (name, m) in enumerate(extras, 1):
    R.append(f"| {i} | {name} | {m['kategori']} | {m['ciddiyet']} | {m['guven']} | {m['alinti'][:220].replace('|','/')} | {m['aciklama_tr'][:160].replace('|','/')} |  |")
open(os.path.join(GD, 'out', 'review-extra-findings.generated.md'), 'w', encoding='utf-8').write("\n".join(R) + "\n")

json.dump({"per_site": per_site, "toplam": {k: v for k, v in tot.items()}}, open(os.path.join(GD, 'out', 'results.generated.json'), 'w'), ensure_ascii=False, indent=2)
print("\n".join(L))
print("\naltın dışı bulgu sayısı:", len(extras))
