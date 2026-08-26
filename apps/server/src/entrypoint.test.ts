// @effect-diagnostics nodeBuiltinImport:off - entrypoint detection is a Node filesystem boundary.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { isEntrypoint } from "./entrypoint.ts";

const tempDirectories = new Set<string>();

const makeTempDir = () => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-entrypoint-test-"));
  tempDirectories.add(directory);
  return directory;
};

afterEach(() => {
  for (const directory of tempDirectories) {
    NodeFS.rmSync(directory, { force: true, recursive: true });
  }
  tempDirectories.clear();
});

describe("isEntrypoint", () => {
  it("uses the runtime answer when Node provides one", () => {
    expect(
      isEntrypoint({
        moduleUrl: "file:///somewhere/bin.mjs",
        entryPath: "/elsewhere/other.mjs",
        runtimeMain: true,
      }),
    ).toBe(true);
    expect(
      isEntrypoint({
        moduleUrl: "file:///somewhere/bin.mjs",
        entryPath: "/somewhere/bin.mjs",
        runtimeMain: false,
      }),
    ).toBe(false);
  });

  it("falls back to the entrypoint path on older Node releases", () => {
    const dir = makeTempDir();
    const entry = NodePath.join(dir, "bin.mjs");
    NodeFS.writeFileSync(entry, "");

    expect(
      isEntrypoint({
        moduleUrl: NodeURL.pathToFileURL(entry).href,
        entryPath: entry,
        runtimeMain: undefined,
      }),
    ).toBe(true);
  });

  it("resolves a symlinked npm entrypoint", () => {
    const dir = makeTempDir();
    const realDirectory = NodePath.join(dir, "package");
    const linkedDirectory = NodePath.join(dir, "package-link");
    NodeFS.mkdirSync(realDirectory);
    const real = NodePath.join(realDirectory, "bin.mjs");
    const link = NodePath.join(linkedDirectory, "bin.mjs");
    NodeFS.writeFileSync(real, "");
    // A directory junction exercises the same realpath fallback and remains
    // available on Windows without elevated symlink privileges.
    NodeFS.symlinkSync(realDirectory, linkedDirectory, "junction");

    expect(
      isEntrypoint({
        moduleUrl: NodeURL.pathToFileURL(real).href,
        entryPath: link,
        runtimeMain: undefined,
      }),
    ).toBe(true);
  });

  it("does not match an imported module or a missing entrypoint argument", () => {
    const dir = makeTempDir();
    const entry = NodePath.join(dir, "bin.mjs");
    const imported = NodePath.join(dir, "cli.mjs");
    NodeFS.writeFileSync(entry, "");
    NodeFS.writeFileSync(imported, "");

    expect(
      isEntrypoint({
        moduleUrl: NodeURL.pathToFileURL(imported).href,
        entryPath: entry,
        runtimeMain: undefined,
      }),
    ).toBe(false);
    expect(
      isEntrypoint({
        moduleUrl: NodeURL.pathToFileURL(entry).href,
        entryPath: undefined,
        runtimeMain: undefined,
      }),
    ).toBe(false);
  });
});
