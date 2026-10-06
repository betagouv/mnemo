import styles from "./visibility-checkbox.module.css";

type VisibilityMode = "show" | "opacity" | "hide";

const modeLabels: Record<VisibilityMode, string> = {
  show: "Afficher",
  opacity: "En transparence",
  hide: "Masquer",
};

export function VisibilityCheckbox({
  label,
  mode,
  cycle = "three-state",
  exceptionCount = 0,
  onChange,
}: {
  label: string;
  mode: VisibilityMode;
  cycle?: "two-state" | "three-state";
  exceptionCount?: number;
  onChange: (mode: VisibilityMode) => void;
}) {
  const modes: VisibilityMode[] =
    cycle === "two-state" ? ["show", "hide"] : ["show", "opacity", "hide"];

  return (
    <button
      aria-checked={mode === "opacity" ? "mixed" : mode === "show"}
      aria-label={`${label} : ${modeLabels[mode]}${exceptionCount ? `, ${exceptionCount} exception${exceptionCount > 1 ? "s" : ""} dans ce groupe` : ""}. Activer l’état suivant`}
      className={styles.visibility}
      data-exceptions={exceptionCount > 0}
      data-mode={mode}
      onClick={() => onChange(modes[(modes.indexOf(mode) + 1) % modes.length])}
      role="checkbox"
      title={`${label} : ${modeLabels[mode]}`}
      type="button"
    >
      <span aria-hidden="true">
        {mode === "show" ? "✓" : mode === "opacity" ? "−" : ""}
      </span>
    </button>
  );
}
