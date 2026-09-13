import type { FlowEdge, FlowNode } from "./flowModel";

/** Limits paid requests to two cards at once and isolates failures to their descendants. */
export async function executeFlowPlan(
  waves: readonly (readonly FlowNode[])[],
  edges: readonly FlowEdge[],
  callbacks: {
    readonly shouldStop: () => boolean;
    readonly execute: (node: FlowNode) => Promise<void>;
    readonly onError: (node: FlowNode, cause: unknown) => void;
    readonly onSkipped: (node: FlowNode) => void;
  },
): Promise<void> {
  const failed = new Set<string>();
  const execute = async (node: FlowNode) => {
    if (callbacks.shouldStop()) return;
    if (edges.some((edge) => edge.target === node.id && failed.has(edge.source))) {
      failed.add(node.id);
      callbacks.onSkipped(node);
      return;
    }
    try {
      await callbacks.execute(node);
    } catch (cause) {
      failed.add(node.id);
      callbacks.onError(node, cause);
    }
  };
  for (const wave of waves) {
    for (let index = 0; index < wave.length && !callbacks.shouldStop(); index += 2) {
      await Promise.all(wave.slice(index, index + 2).map(execute));
    }
    if (callbacks.shouldStop()) break;
  }
}
