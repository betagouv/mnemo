export type BimFilterControls = {
  resetVisuals: () => {
    undo: () => void;
    canUndo: () => boolean;
  } | null;
};
