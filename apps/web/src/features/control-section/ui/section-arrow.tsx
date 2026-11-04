import type { ComponentPropsWithRef } from "react";

import styles from "./section-gizmo.module.css";

/** Fixed-size SVG handle shared by the section plane and box. */
export function SectionArrow({
  className,
  ...props
}: ComponentPropsWithRef<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={`${styles.handle} ${className ?? ""}`}
    >
      <svg aria-hidden="true" viewBox="0 0 80 44" className={styles.arrow}>
        <path className={styles.halo} d="M16 22H65M53 13L67 22L53 31Z" />
        <path className={styles.shaft} d="M16 22H56" />
        <path className={styles.tip} d="M53 13L67 22L53 31Z" />
      </svg>
    </button>
  );
}
