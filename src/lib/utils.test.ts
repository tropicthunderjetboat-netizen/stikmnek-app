import { cn, formatVT } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
});

describe("formatVT", () => {
  it("formats numbers as VT currency", () => {
    expect(formatVT(5500)).toBe("VT 5,500");
  });
});
