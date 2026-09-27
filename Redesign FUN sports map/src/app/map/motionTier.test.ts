import { describe, it, expect } from "vitest";
import {
  AMBIENT_BURST_MS,
  ambientGain,
  classifyCinematicTier,
  getCinematicIntroPitch,
  getPulseTickMs,
  isSoftwareRendererName,
} from "./mapConfig";

describe("classifyCinematicTier", () => {
  const base = { reducedMotion: false, softwareRenderer: false };

  it("honours reduced motion above everything else", () => {
    expect(classifyCinematicTier({ ...base, reducedMotion: true, softwareRenderer: true })).toBe("off");
  });

  it("drops a software renderer to lite", () => {
    expect(classifyCinematicTier({ ...base, softwareRenderer: true })).toBe("lite");
  });

  it("drops small-memory devices to lite", () => {
    expect(classifyCinematicTier({ ...base, deviceMemory: 4 })).toBe("lite");
    expect(classifyCinematicTier({ ...base, deviceMemory: 2 })).toBe("lite");
  });

  it("keeps devices that report nothing on full — Safari reports no deviceMemory", () => {
    expect(classifyCinematicTier(base)).toBe("full");
    expect(classifyCinematicTier({ ...base, deviceMemory: 8 })).toBe("full");
  });
});

describe("isSoftwareRendererName", () => {
  it("recognises the renderers that draw on the CPU", () => {
    expect(
      isSoftwareRendererName(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"
      )
    ).toBe(true);
    expect(isSoftwareRendererName("Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRendererName("Microsoft Basic Render Driver")).toBe(true);
  });

  it("leaves real GPUs alone", () => {
    expect(isSoftwareRendererName("ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)")).toBe(false);
    expect(isSoftwareRendererName("NVIDIA GeForce RTX 3080/PCIe/SSE2")).toBe(false);
    expect(isSoftwareRendererName(null)).toBe(false);
    expect(isSoftwareRendererName("")).toBe(false);
  });
});

describe("ambient motion budget", () => {
  it("runs at full amplitude during the burst and stops after the fade", () => {
    expect(ambientGain(0, 1000)).toBe(1);
    expect(ambientGain(1000, 1000)).toBe(1);
    expect(ambientGain(1000 + 700, 1000, 700)).toBe(0);
    expect(ambientGain(9999, 1000, 700)).toBe(0);
  });

  it("eases down rather than cutting off", () => {
    const mid = ambientGain(1350, 1000, 700);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // monotonically decreasing across the fade
    const samples = [0, 100, 200, 300, 400, 500, 600, 699].map((d) => ambientGain(1000 + d, 1000, 700));
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]!);
  });

  it("a burst is long enough to read as a breath", () => {
    expect(AMBIENT_BURST_MS).toBeGreaterThanOrEqual(2000);
  });
});

describe("tier budgets", () => {
  it("animates the halo only on full", () => {
    expect(getPulseTickMs("full")).toBe(50);
    expect(getPulseTickMs("lite")).toBe(Number.POSITIVE_INFINITY);
    expect(getPulseTickMs("off")).toBe(Number.POSITIVE_INFINITY);
  });

  it("tilts the intro camera only on full", () => {
    expect(getCinematicIntroPitch("full")).toBe(62);
    expect(getCinematicIntroPitch("lite")).toBe(0);
    expect(getCinematicIntroPitch("off")).toBe(0);
  });
});
