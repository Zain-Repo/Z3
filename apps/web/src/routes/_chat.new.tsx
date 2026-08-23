import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ServerConfig } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import { buildChatDraftThread } from "../components/ChatView.logic";
import ChatView from "../components/ChatView";
import { useActiveEnvironmentId, useServerConfigs, useThreadShell } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { newThreadId } from "../lib/utils";
import {
  resolveChatEnvironmentId,
  resolveChatModelSelection,
  readChatEnvironmentSelection,
} from "../lib/chatThreadCreation";
import { NO_PROVIDER_MODEL_SELECTION } from "../providerInstances";
import { SidebarInset } from "../components/ui/sidebar";
import { buildThreadRouteParams } from "../threadRoutes";

function NewChatRouteView() {
  const navigate = useNavigate();
  const activeEnvironmentId = useActiveEnvironmentId();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const serverConfigs = useServerConfigs();
  const [threadId] = useState(newThreadId);
  const createdAt = useMemo(() => new Date().toISOString(), []);
  const environmentId = resolveChatEnvironmentId(
    readChatEnvironmentSelection(),
    activeEnvironmentId,
    primaryEnvironmentId,
    environments.map((environment) => environment.environmentId),
  );
  const modelSelection =
    (environmentId
      ? resolveChatModelSelection(serverConfigs.get(environmentId)?.providers)
      : null) ?? NO_PROVIDER_MODEL_SELECTION;
  const serverThread = useThreadShell(
    environmentId === null ? null : { environmentId, threadId },
  );

  useEffect(() => {
    if (environmentId === null) {
      return;
    }
    if (serverThread !== null) {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams({ environmentId, threadId }),
        replace: true,
      });
    }
  }, [environmentId, navigate, serverThread, threadId]);

  if (environmentId === null) {
    return null;
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <ChatView
        environmentId={environmentId}
        threadId={threadId}
        routeKind="chat-draft"
        chatDraft={buildChatDraftThread(environmentId, threadId, modelSelection, createdAt)}
        {...(serverConfigs.get(environmentId)
          ? {
              chatDraftServerConfig: serverConfigs.get(environmentId) as ServerConfig,
            }
          : {})}
        forceExpandedMobileComposer
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/new")({
  component: NewChatRouteView,
});
