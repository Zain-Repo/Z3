import { readDesktopPrimaryBearerToken } from "./desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "./target";

function isSameOriginBrowserPrimary(assetUrl: URL): boolean {
  return (
    typeof window !== "undefined" &&
    window.desktopBridge === undefined &&
    window.location.origin.startsWith("http") &&
    assetUrl.origin === window.location.origin
  );
}

export async function loadPrimaryVideoAsset(assetPath: string): Promise<string> {
  const assetUrl = new URL(assetPath, resolvePrimaryEnvironmentHttpUrl("/"));
  const primaryOrigin = new URL(resolvePrimaryEnvironmentHttpUrl("/")).origin;
  if (assetUrl.origin !== primaryOrigin || !assetUrl.pathname.startsWith("/api/videos/assets/")) {
    throw new Error("Video asset URL is outside the primary video asset route.");
  }
  const sameOrigin = isSameOriginBrowserPrimary(assetUrl);
  const bearerToken = sameOrigin ? null : await readDesktopPrimaryBearerToken();
  const requestInit: RequestInit = {
    credentials: sameOrigin ? "include" : "omit",
    ...(bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : {}),
  };
  const response = await fetch(assetUrl, requestInit);
  if (!response.ok) {
    throw new Error(`Video asset request failed with status ${response.status}.`);
  }
  return URL.createObjectURL(await response.blob());
}
