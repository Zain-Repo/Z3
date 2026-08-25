import { type ApprovalRequestId, type ProviderApprovalDecision } from "@t3tools/contracts";
import { memo } from "react";
import { Button } from "../ui/button";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  supportedDecisions?: ReadonlyArray<ProviderApprovalDecision>;
  isResponding: boolean;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  supportedDecisions,
  isResponding,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  return (
    <>
      {(supportedDecisions?.includes("cancel") ?? true) ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={isResponding}
          onClick={() => void onRespondToApproval(requestId, "cancel")}
        >
          Cancel turn
        </Button>
      ) : null}
      {(supportedDecisions?.includes("decline") ?? true) ? (
        <Button
          size="sm"
          variant="destructive-outline"
          disabled={isResponding}
          onClick={() => void onRespondToApproval(requestId, "decline")}
        >
          Decline
        </Button>
      ) : null}
      {(supportedDecisions?.includes("acceptForSession") ?? true) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isResponding}
          onClick={() => void onRespondToApproval(requestId, "acceptForSession")}
        >
          Always allow this session
        </Button>
      ) : null}
      {(supportedDecisions?.includes("accept") ?? true) ? (
        <Button
          size="sm"
          variant="default"
          disabled={isResponding}
          onClick={() => void onRespondToApproval(requestId, "accept")}
        >
          Approve once
        </Button>
      ) : null}
    </>
  );
});
