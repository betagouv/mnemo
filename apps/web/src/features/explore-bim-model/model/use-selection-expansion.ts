import { useState } from "react";
import type { IfcElementSummary } from "@mnemo/ifc-viewer-adapter";

export function useSelectionExpansion(
  selection: IfcElementSummary | null,
  defaultExpanded = false,
): [boolean, (expanded: boolean) => void] {
  const [state, setState] = useState({
    expanded: defaultExpanded || selection !== null,
    revealed: selection,
  });
  if (selection && state.revealed !== selection) {
    setState({ expanded: true, revealed: selection });
  }
  return [
    state.expanded,
    (expanded) => setState({ expanded, revealed: selection }),
  ];
}
