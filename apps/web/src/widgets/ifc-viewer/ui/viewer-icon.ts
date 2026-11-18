import type { ViewerIcon } from "../model/viewer-tool-catalog";
import styles from "./viewer-icons.module.css";

export function viewerIconClass(icon: ViewerIcon) {
  return icon === "floorPlan" ? styles.floorPlan : icon;
}
