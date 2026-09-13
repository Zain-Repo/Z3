import {
  createFlowSheet,
  deleteFlowSheet,
  initializeFlowSheets,
  listFlowSheets,
  type FlowSheet,
} from "./flowSheets";

export type FlowSheetSnapshot = {
  readonly sheets: readonly FlowSheet[];
  readonly activeId: string | null;
  readonly ready: boolean;
  readonly transitioning: boolean;
  readonly generating: boolean;
  readonly libraryOpen: boolean;
  readonly error: string;
};
type SheetRepository = {
  readonly initialize: (environmentId: string) => Promise<void>;
  readonly list: (environmentId: string) => Promise<FlowSheet[]>;
  readonly create: (environmentId: string, title: string) => Promise<FlowSheet>;
  readonly remove: (environmentId: string, id: string) => Promise<FlowSheet[]>;
  readonly preferred: (environmentId: string) => string | null;
  readonly remember: (environmentId: string, id: string) => void;
};
const repository: SheetRepository = {
  initialize: initializeFlowSheets,
  list: listFlowSheets,
  create: createFlowSheet,
  remove: deleteFlowSheet,
  preferred: (id) => {
    try {
      return localStorage.getItem(`zimage.active-sheet:${id}`);
    } catch {
      return null;
    }
  },
  remember: (id, sheetId) => {
    try {
      localStorage.setItem(`zimage.active-sheet:${id}`, sheetId);
    } catch {
      /* The saved sheets remain accessible even when selection preferences are unavailable. */
    }
  },
};

export class FlowSheetSession {
  private snapshot: FlowSheetSnapshot = {
    sheets: [],
    activeId: null,
    ready: false,
    transitioning: false,
    generating: false,
    libraryOpen: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private initializing: Promise<void> | null = null;
  private editor: { id: string; flush: () => Promise<void> } | null = null;
  private refreshVersion = 0;
  constructor(
    readonly environmentId: string,
    private readonly storage: SheetRepository = repository,
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(update: Partial<FlowSheetSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((listener) => listener());
  }
  initialize = async () => {
    if (this.snapshot.ready) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        await this.storage.initialize(this.environmentId);
        const sheets = await this.storage.list(this.environmentId);
        const preferred = this.storage.preferred(this.environmentId);
        const activeId =
          sheets.find((sheet) => sheet.id === preferred)?.id ?? sheets[0]?.id ?? null;
        this.publish({ sheets, activeId, ready: true, error: "" });
      } catch (cause) {
        this.publish({
          error: cause instanceof Error ? cause.message : "Canvases could not load.",
        });
      } finally {
        this.initializing = null;
      }
    })();
    return this.initializing;
  };
  registerEditor = (id: string, flush: () => Promise<void>) => {
    const editor = { id, flush };
    this.editor = editor;
    return () => {
      if (this.editor === editor) {
        this.editor = null;
        this.publish({ generating: false });
      }
    };
  };
  setGenerating = (generating: boolean) => {
    if (generating !== this.snapshot.generating) this.publish({ generating });
  };
  setLibrary = (libraryOpen: boolean) => this.publish({ libraryOpen });
  refresh = async () => {
    const version = ++this.refreshVersion;
    try {
      const sheets = await this.storage.list(this.environmentId);
      if (version === this.refreshVersion) {
        const open = this.snapshot.sheets.find((sheet) => sheet.id === this.snapshot.activeId);
        if (open && !sheets.some((sheet) => sheet.id === open.id)) {
          this.publish({
            sheets: [open, ...sheets],
            error:
              "This open canvas was deleted in another window. Export it to keep unsaved work, then reload to view saved canvases.",
          });
        } else this.publish({ sheets });
      }
    } catch (cause) {
      this.publish({
        error: cause instanceof Error ? cause.message : "Canvas list could not refresh.",
      });
    }
  };
  private async transition(target: string | null): Promise<boolean> {
    if (this.snapshot.transitioning || !this.snapshot.ready) return false;
    if (this.snapshot.generating) {
      this.publish({ error: "Finish or stop the current run before changing canvases." });
      return false;
    }
    if (target && !this.snapshot.sheets.some((sheet) => sheet.id === target)) return false;
    this.publish({ transitioning: true, error: "" });
    try {
      if (this.editor?.id === this.snapshot.activeId) await this.editor.flush();
      const created =
        target === null
          ? await this.storage.create(
              this.environmentId,
              `Canvas ${this.snapshot.sheets.length + 1}`,
            )
          : null;
      const activeId = created?.id ?? target;
      if (!activeId) return false;
      if (created) this.publish({ sheets: [created, ...this.snapshot.sheets] });
      this.storage.remember(this.environmentId, activeId);
      this.publish({ activeId, libraryOpen: false });
      void this.refresh();
      return true;
    } catch (cause) {
      this.publish({
        error:
          cause instanceof Error
            ? cause.message
            : "Canvas could not be saved. Your current canvas is still open.",
      });
      return false;
    } finally {
      this.publish({ transitioning: false });
    }
  }
  remove = async (id: string): Promise<boolean> => {
    if (!this.snapshot.ready || this.snapshot.transitioning || this.snapshot.generating)
      return false;
    if (!this.snapshot.sheets.some((sheet) => sheet.id === id)) return false;
    this.publish({ transitioning: true, error: "" });
    ++this.refreshVersion;
    try {
      if (this.editor?.id === id) await this.editor.flush();
      const sheets = await this.storage.remove(this.environmentId, id);
      ++this.refreshVersion;
      const activeId =
        sheets.find((sheet) => sheet.id === this.snapshot.activeId)?.id ?? sheets[0]?.id ?? null;
      if (activeId) this.storage.remember(this.environmentId, activeId);
      this.publish({ sheets, activeId });
      return true;
    } catch (cause) {
      this.publish({
        error: cause instanceof Error ? cause.message : "Canvas could not be deleted.",
      });
      return false;
    } finally {
      this.publish({ transitioning: false });
    }
  };
  create = () => this.transition(null);
  select = (id: string) =>
    id === this.snapshot.activeId
      ? (this.setLibrary(false), Promise.resolve(true))
      : this.transition(id);
}

const sessions = new Map<string, FlowSheetSession>();
export function flowSheetSession(environmentId: string): FlowSheetSession {
  let session = sessions.get(environmentId);
  if (!session) {
    session = new FlowSheetSession(environmentId);
    sessions.set(environmentId, session);
  }
  return session;
}
