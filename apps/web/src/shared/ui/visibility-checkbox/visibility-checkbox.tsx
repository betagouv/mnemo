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
  const mixed = exceptionCount > 0;
  const stateLabel = mixed ? "Visibilité mixte" : modeLabels[mode];

  return (
    <button
      aria-checked={mixed || mode === "opacity" ? "mixed" : mode === "show"}
      aria-label={`${label} : ${stateLabel}. ${mixed ? "Afficher tout le groupe" : "Activer l’état suivant"}`}
      className={styles.visibility}
      data-exceptions={exceptionCount > 0}
      data-mode={mode}
      onClick={() =>
        onChange(
          mixed ? "show" : modes[(modes.indexOf(mode) + 1) % modes.length],
        )
      }
      role="checkbox"
      title={`${label} : ${stateLabel}`}
      type="button"
    >
      <span aria-hidden="true">
        {mixed || mode === "opacity" ? "−" : mode === "show" ? "✓" : ""}
      </span>
    </button>
  );
}
