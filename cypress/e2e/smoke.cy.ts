describe("smoke", () => {
  it("loads the home page", () => {
    cy.visit("/");
    cy.get("body").should("be.visible");
  });
});
