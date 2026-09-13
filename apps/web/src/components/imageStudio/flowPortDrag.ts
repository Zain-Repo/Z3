import type { DragEvent } from "react";
import type { FlowEdge } from "./flowModel";

const OUTPUT_TYPE = "application/x-zimage-output";
export function outputPortDrag(id: string, disabled: boolean) {
  return {
    draggable: !disabled,
    onDragStart: (event: DragEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.dataTransfer.setData(OUTPUT_TYPE, id);
      event.dataTransfer.effectAllowed = "link";
    },
  };
}
export function inputPortDrop(
  id: string,
  port: FlowEdge["port"],
  disabled: boolean,
  connect: (id: string, port: FlowEdge["port"], source: string) => void,
) {
  return {
    onDragOver: (event: DragEvent<HTMLButtonElement>) => {
      if (!disabled && event.dataTransfer.types.includes(OUTPUT_TYPE)) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "link";
      }
    },
    onDrop: (event: DragEvent<HTMLButtonElement>) => {
      const source = event.dataTransfer.getData(OUTPUT_TYPE);
      if (!disabled && source) {
        event.preventDefault();
        event.stopPropagation();
        connect(id, port, source);
      }
    },
  };
}
