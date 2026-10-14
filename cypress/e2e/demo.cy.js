import { installChromeShim } from "../support/chromeShim";

const API = "https://api.groq.com/openai/v1/chat/completions";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

// Kayıtlı (sahte) model cevabı. Alıntılar demo-tos.html ile birebir aynı olmalı.
// Son madde kasıtlı olarak UYDURMA: doğrulayıcının atması gerekiyor.
const FAKE_LLM = {
  maddeler: [
    { kategori: "otomatik_yenileme", ciddiyet: "orta", guven: 0.9,
      alinti: "Aboneliğiniz her ay otomatik olarak yenilenir ve iptal etmediğiniz sürece kayıtlı kartınızdan ücret tahsil edilir.",
      aciklama_tr: "Abonelik kendiliğinden yenilenir; iptal etmezseniz kartınızdan her ay para çekilir." },
    { kategori: "iade_yok", ciddiyet: "orta", guven: 0.9,
      alinti: "Yenilemeden sonra yapılan iptallerde kısmi dönem için iade yapılmaz.",
      aciklama_tr: "Yenilemeden sonra iptal ederseniz o dönemin parasını geri alamazsınız." },
    { kategori: "veri_paylasimi", ciddiyet: "yuksek", guven: 0.9,
      alinti: "Şirket, konum ve gezinme geçmişinizi reklam ortaklarıyla önceden onayınızı almadan paylaşabilir.",
      aciklama_tr: "Konumunuz ve gezinme geçmişiniz, sizden izin istenmeden reklam şirketlerine verilebilir." },
    { kategori: "tek_tarafli_degisiklik", ciddiyet: "yuksek", guven: 0.85,
      alinti: "Şirket bu koşulları dilediği zaman bildirimde bulunmadan değiştirebilir; hizmeti kullanmaya devam etmeniz değişiklikleri kabul ettiğiniz anlamına gelir.",
      aciklama_tr: "Şirket kuralları size haber vermeden değiştirebilir; kullanmaya devam etmek kabul sayılır." },
    { kategori: "tahkim_dava_hakki", ciddiyet: "yuksek", guven: 0.9,
      alinti: "Tüm uyuşmazlıklar yalnızca zorunlu bireysel tahkim ile çözülür ve kullanıcı toplu dava açma hakkından vazgeçer.",
      aciklama_tr: "Sorun yaşarsanız mahkemeye gidemezsiniz; toplu dava hakkınızdan da vazgeçmiş olursunuz." },
    { kategori: "sorumluluk_sinirlamasi", ciddiyet: "orta", guven: 0.4,
      alinti: "Şirket, hizmeti makul ölçüde kesintisiz sunmak için çaba gösterir ancak kesintilerden doğan zararlardan, yasaların izin verdiği ölçüde sorumlu tutulamaz.",
      aciklama_tr: "Kesintilerden doğan zararlar için şirket sorumluluk kabul etmiyor; ancak yasal sınırlar saklı." },
    { kategori: "veri_paylasimi", ciddiyet: "dusuk", guven: 0.8,
      alinti: "Şirket kullanıcı verilerini hiçbir koşulda üçüncü taraflarla paylaşmaz ve satmaz.",
      aciklama_tr: "(Bu madde sayfada yok; modelin uydurması.)" },
  ],
  enjeksiyon_suphesi: "",
};

function caption(text) {
  cy.document().then((doc) => {
    let el = doc.getElementById("demo-caption");
    if (!el) {
      el = doc.createElement("div");
      el.id = "demo-caption";
      el.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;background:#111;color:#fff;padding:10px 12px;font:13px system-ui;z-index:99999";
      doc.body.appendChild(el);
    }
    el.textContent = text;
  });
}

describe("Demo: ToS risk raporu", () => {
  beforeEach(() => {
    cy.viewport(520, 860);
    // LLM isteğini yakala: gerçek Groq'a gitmez (CORS ön isteği + asıl istek)
    cy.intercept("OPTIONS", API, { statusCode: 204, headers: CORS });
    cy.intercept("POST", API, {
      statusCode: 200,
      headers: CORS,
      body: { choices: [{ message: { content: JSON.stringify(FAKE_LLM) } }] },
    }).as("llm");
  });

  it("mutlu yol, belirsizlik ve uydurma alıntının atılması", () => {
    cy.visit("/sidepanel.html", {
      onBeforeLoad(win) {
        installChromeShim(win, { targetPath: "/test-pages/demo-tos.html" });
      },
    });

    caption("DEMO: LLM cevabı kayıtlı (Groq'a istek atılmadı). Doğrulama, skor ve arayüz gerçek kod.");
    cy.contains("Bu araç hukuki tavsiye vermez").should("be.visible");
    cy.wait(3500);

    // 1) Mutlu yol
    caption("1) Sayfa metni okunur, LLM'e 'güvenilmeyen veri' olarak gönderilir.");
    cy.get("#analyze").click();
    cy.wait("@llm");
    cy.get("#report", { timeout: 15000 }).should("contain", "Risk skoru:");
    cy.get("#report").should("contain", "6 doğrulanmış madde");
    caption("Risk skoru kodla hesaplanır. Her madde sayfadan birebir alıntıyla gösterilir.");
    cy.wait(4000);

    // 2) Belirsizlik anı
    cy.contains("Model bu maddeden emin değil").scrollIntoView({ duration: 700 }).should("be.visible");
    caption("2) Belirsizlik: model bu maddeden emin değil (güven 0.4). Sistem bunu gizlemez.");
    cy.wait(5000);

    // 3) Uydurma alıntının atılması
    cy.get("#report").should("contain", "1 madde doğrulamadan geçemedi");
    cy.contains("Atılan iddialar").scrollIntoView({ duration: 700 }).should("be.visible");
    caption("3) Modelin uydurduğu madde: alıntı sayfada yok, doğrulayıcı attı. Kanıtsız iddia geçersiz.");
    cy.wait(5000);

    // Kapanış: uyarı tekrar görünsün
    cy.scrollTo("top", { duration: 600 });
    caption("Bu araç hukuki tavsiye vermez. Sonuçlar bilgilendirme amaçlıdır.");
    cy.wait(3000);
  });
});