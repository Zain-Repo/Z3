import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const runner = NodeURL.fileURLToPath(new URL("./dev-runner.ts", import.meta.url));
const [major, minor, patch] = process.versions.node.split(".").map(Number);
const supported = major === 24 && (minor > 13 || (minor === 13 && patch >= 1));
// Package scripts put the project-local vp first, which lacks runtime management.
const manager = NodePath.join(
  process.env.VP_HOME || NodePath.join(NodeOS.homedir(), ".vite-plus"),
  "bin",
  // This bootstrap must run before TypeScript-based runtime services can load.
  // oxlint-disable-next-line t3code/no-global-process-runtime
  NodeOS.platform() === "win32" ? "vp.exe" : "vp",
);

if (!supported && !NodeFS.existsSync(manager)) {
  console.error(
    `Z3 requires Node.js ^24.13.1; found ${process.version}. Install Node.js 24 or Vite Plus, then retry.`,
  );
  process.exit(1);
}

const args = [runner, ...process.argv.slice(2)];
const child = NodeChildProcess.spawn(
  supported ? process.execPath : manager,
  supported ? args : ["env", "exec", "--", "node", ...args],
  { stdio: "inherit", env: process.env },
);

child.on("error", (error) => {
  console.error(`Unable to start Z3 development runner: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
