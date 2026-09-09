import { FolderIcon, HeartIcon, ImageIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { isElectron } from "../env";
import { IMAGE_COLLECTION_NAME_LIMIT } from "../lib/imageLibrary";
import { usePrimaryEnvironmentId } from "../state/environments";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { WorkspaceContextRail } from "./sidebar/WorkspaceSwitcher";
import { useImageLibrary } from "./useImageLibrary";

function ImageLibraryNavigation() {
  const library = useImageLibrary();
  const [editor, setEditor] = useState<{ id: string | null; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <SidebarContent className="gap-0">
      <SidebarGroup className="px-3 py-4">
        <SidebarGroupContent>
          <Button
            className="mb-4 w-full justify-start"
            onClick={() => {
              library.setFilter("all");
              document.getElementById("zimage-prompt")?.focus();
            }}
          >
            <PlusIcon aria-hidden="true" /> New generation
          </Button>
          <SidebarMenu aria-label="Image library">
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={library.filter === "all"}
                aria-current={library.filter === "all" ? "page" : undefined}
                onClick={() => library.setFilter("all")}
              >
                <ImageIcon aria-hidden="true" /> <span>All generations</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={!library.ready}
                isActive={library.filter === "favorites"}
                aria-current={library.filter === "favorites" ? "page" : undefined}
                onClick={() => library.setFilter("favorites")}
              >
                <HeartIcon aria-hidden="true" /> <span>Favorites</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {library.favoriteIds.length}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="px-3">
        <div className="mb-2 flex items-center justify-between">
          <SidebarGroupLabel className="text-sm">Collections</SidebarGroupLabel>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!library.ready}
            aria-label="Create collection"
            onClick={() => {
              setEditor({ id: null, name: "" });
              setDeleting(null);
            }}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>
        <SidebarGroupContent>
          {editor && (
            <form
              className="mb-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (editor.id === null) {
                  const id = library.createCollection(editor.name);
                  if (id) {
                    library.setFilter({ collectionId: id });
                    setEditor(null);
                  }
                } else if (library.renameCollection(editor.id, editor.name)) setEditor(null);
              }}
            >
              <label htmlFor="zimage-collection-name" className="text-xs text-muted-foreground">
                {editor.id === null ? "New collection name" : "Collection name"}
              </label>
              <Input
                id="zimage-collection-name"
                autoFocus
                required
                maxLength={IMAGE_COLLECTION_NAME_LIMIT}
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditor(null);
                }}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!editor.name.trim()}>
                  {editor.id === null ? "Create" : "Save"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          <SidebarMenu>
            {library.collections.map((collection) => {
              const active =
                typeof library.filter === "object" && library.filter.collectionId === collection.id;
              return (
                <SidebarMenuItem key={collection.id}>
                  <div className="flex min-w-0 items-center gap-1">
                    <SidebarMenuButton
                      isActive={active}
                      aria-current={active ? "page" : undefined}
                      onClick={() => library.setFilter({ collectionId: collection.id })}
                    >
                      <FolderIcon aria-hidden="true" />
                      <span className="truncate">{collection.name}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {collection.generationIds.length}
                      </span>
                    </SidebarMenuButton>
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Manage ${collection.name}`}
                          />
                        }
                      >
                        <MoreHorizontalIcon aria-hidden="true" />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem
                          onClick={() => {
                            setEditor({ id: collection.id, name: collection.name });
                            setDeleting(null);
                          }}
                        >
                          Rename collection
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            setDeleting(collection.id);
                            setEditor(null);
                          }}
                        >
                          Delete collection
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </div>
                  {deleting === collection.id && (
                    <div className="space-y-2 px-2 py-3">
                      <p className="text-xs text-muted-foreground">
                        Delete this collection? Its images stay in All generations.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive-outline"
                          onClick={() => {
                            if (library.deleteCollection(collection.id)) setDeleting(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          {library.collections.length === 0 && !editor && (
            <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
              Create a collection to group generations by project or idea.
            </p>
          )}
          {library.error && (
            <p role="alert" className="mt-3 px-2 text-xs text-destructive">
              {library.error}
            </p>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
      <p className="mt-auto px-5 py-4 text-xs leading-relaxed text-muted-foreground">
        Favorites and collections are saved in this browser for this environment.
      </p>
    </SidebarContent>
  );
}

export function ImageWorkspaceSidebar() {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <WorkspaceContextRail />
      <ImageLibraryNavigation key={environmentId ?? "pending"} />
      <SidebarChromeFooter />
    </>
  );
}
