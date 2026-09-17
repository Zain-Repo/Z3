import type { ImageGenerationRecord } from "@t3tools/contracts";
import { flowMediaSources, type FlowBoard, type FlowNode } from "./flowModel";

export type FlowLibraryPreview = {
  readonly images: readonly { name: string; assetId?: string; url?: string }[];
  readonly error?: string;
};

/** Derives previews from the same ordered sources used for generation, without copying assets. */
export function flowLibraryPreview(
  board: FlowBoard,
  node: FlowNode,
  records: readonly ImageGenerationRecord[],
): FlowLibraryPreview {
  try {
    return {
      images: flowMediaSources(board, node).map((media) => {
        const source = board.nodes.find((item) => item.id === media.source);
        const name = source?.title ?? "Connected image";
        if (media.url || media.assetId) return { name, ...media };
        const asset = records
          .filter((record) => source?.generationIds.includes(record.id))
          .flatMap((record) => record.assets)[source?.assetIndex ?? 0];
        return { name, ...(asset ? { assetId: asset.id } : {}) };
      }),
    };
  } catch (cause) {
    return {
      images: [],
      error: cause instanceof Error ? cause.message : "Connected images could not be resolved.",
    };
  }
}
