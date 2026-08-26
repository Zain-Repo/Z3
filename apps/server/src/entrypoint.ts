// @effect-diagnostics nodeBuiltinImport:off
// Entrypoint detection runs before an Effect runtime exists, so this boundary
// intentionally uses Node built-ins.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

/**
 * Detects whether a module is the process entrypoint across supported Node
 * versions, including releases that predate `import.meta.main`.
 */
export const isEntrypoint = (input: {
  readonly moduleUrl: string;
  readonly entryPath: string | undefined;
  readonly runtimeMain: boolean | undefined;
}): boolean => {
  if (input.runtimeMain !== undefined) {
    return input.runtimeMain;
  }
  if (input.entryPath === undefined || input.entryPath === "") {
    return false;
  }
  if (input.moduleUrl === NodeURL.pathToFileURL(input.entryPath).href) {
    return true;
  }

  // npm and npx commonly expose the executable through a symlink while the
  // module URL contains its resolved target.
  try {
    return input.moduleUrl === NodeURL.pathToFileURL(NodeFS.realpathSync(input.entryPath)).href;
  } catch {
    return false;
  }
};
