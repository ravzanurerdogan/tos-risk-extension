import { installChromeShim } from "../support/chromeShim";

describe("Yan panel (duman testi)", () => {
  it("açılır ve hukuki tavsiye uyarısını gösterir", () => {
    cy.visit("/sidepanel.html", {
      onBeforeLoad(win) {
        installChromeShim(win, { targetPath: "/test-pages/injection-test.html" });
      },
    });
    cy.contains("Bu araç hukuki tavsiye vermez").should("be.visible");
    cy.get("#analyze").should("be.visible");
  });
});