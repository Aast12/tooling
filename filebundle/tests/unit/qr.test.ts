import { describe, it, expect } from "vitest";
import { qrSvg } from "@/lib/qr";

describe("qrSvg", () => {
  it("returns an SVG string containing the payload", async () => {
    const svg = await qrSvg("https://files.alamst.me/red-flower");
    expect(svg.startsWith("<svg") || svg.startsWith("<?xml")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });
});
