import { Button } from "./button";

describe("<Button />", () => {
  it("renders children", () => {
    cy.mount(<Button type="button">Subscribe</Button>);
    cy.contains("button", "Subscribe").should("be.visible");
  });

  it("invokes onClick when clicked", () => {
    const onClick = cy.stub().as("onClick");
    cy.mount(
      <Button type="button" onClick={onClick}>
        Go
      </Button>
    );
    cy.get("button").click();
    cy.get("@onClick").should("have.been.calledOnce");
  });
});
