import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { loadPrimaryVideoAsset } from "./videoAssetLoader";

const readBearer = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
const resolvePrimaryUrl = vi.hoisted(() => vi.fn(() => "https://primary.test/"));

vi.mock("./desktopAuth", () => ({ readDesktopPrimaryBearerToken: readBearer }));
vi.mock("./target", () => ({ resolvePrimaryEnvironmentHttpUrl: resolvePrimaryUrl }));

describe("loadPrimaryVideoAsset", () => {
  const createObjectUrl = vi.fn(() => "blob:video-preview");
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    readBearer.mockClear();
    vi.stubGlobal("window", {
      location: new URL("https://primary.test/"),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["video"])),
    }));
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectUrl);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectUrl);
    readBearer.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses same-origin credentials without desktop auth", async () => {
    await expect(loadPrimaryVideoAsset("/api/videos/assets/video-1")).resolves.toBe(
      "blob:video-preview",
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://primary.test/api/videos/assets/video-1"),
      { credentials: "include" },
    );
    expect(readBearer).not.toHaveBeenCalled();
  });

  it("uses the desktop bearer for a non-browser primary request", async () => {
    Object.defineProperty(window, "desktopBridge", { configurable: true, value: {} });
    readBearer.mockResolvedValue("desktop-token");

    await loadPrimaryVideoAsset("/api/videos/assets/video-2");

    expect(fetch).toHaveBeenCalledWith(
      new URL("https://primary.test/api/videos/assets/video-2"),
      {
        credentials: "omit",
        headers: { Authorization: "Bearer desktop-token" },
      },
    );
  });

  it("rejects HTTP failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(loadPrimaryVideoAsset("/api/videos/assets/forbidden")).rejects.toThrow(
      "status 403",
    );
  });

  it.each([
    "https://attacker.test/api/videos/assets/steal",
    "/api/images/assets/not-video",
    "/api/videos/assets-extra/not-video",
  ])("rejects unsafe asset path %s", async (assetPath) => {
    await expect(loadPrimaryVideoAsset(assetPath)).rejects.toThrow("outside the primary");
    expect(fetch).not.toHaveBeenCalled();
    expect(readBearer).not.toHaveBeenCalled();
  });
});
