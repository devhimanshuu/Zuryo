import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolveDark, themeBootstrapScript } from "@/lib/theme";

describe("parseThemeChoice", () => {
  it("accepts the two explicit choices and treats everything else as system", () => {
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice(null)).toBe("system");
    expect(parseThemeChoice("sepia")).toBe("system");
  });
});

describe("resolveDark", () => {
  it("lets an explicit choice override the system", () => {
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });
});

describe("themeBootstrapScript", () => {
  it("reads the shared storage key and handles system preference", () => {
    const script = themeBootstrapScript();
    expect(script).toContain("zuryofit-theme");
    expect(script).toContain("prefers-color-scheme: dark");
    expect(script).toContain("classList.toggle");
  });
});
