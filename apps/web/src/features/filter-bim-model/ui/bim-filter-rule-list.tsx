"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import type { IfcBimCatalog } from "@mnemo/ifc-viewer-adapter";
import {
  bimFilterActionLabels,
  type BimFilterRule,
} from "../model/bim-filter-rules";
import { bimFilterLabel } from "../model/bim-filter";
import styles from "./bim-filter-panel.module.css";

export function BimFilterRuleList({
  rules,
  catalog,
  onToggle,
  onEdit,
  onRemove,
}: {
  rules: BimFilterRule[];
  catalog: IfcBimCatalog;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className={styles.rules} aria-label="Filtres configurés">
      {rules.map((rule) => {
        const action = bimFilterActionLabels[rule.action];
        const criteria =
          rule.action === "storey-colors"
            ? "Tous les niveaux"
            : bimFilterLabel(catalog, rule.query);
        const label = `${action} · ${criteria}`;
        return (
          <li
            className={styles.rule}
            key={rule.id}
            data-enabled={rule.enabled}
            aria-label={label}
          >
            <Checkbox
              small
              className={styles.ruleToggle}
              options={[
                {
                  label: (
                    <span className={styles.ruleLabel} title={label}>
                      <strong>
                        {action}
                        {rule.action === "color" ? (
                          <span
                            className={styles.swatch}
                            style={{ backgroundColor: rule.color }}
                            aria-hidden="true"
                          />
                        ) : null}
                      </strong>
                      <span>{criteria}</span>
                    </span>
                  ),
                  nativeInputProps: {
                    checked: rule.enabled,
                    "aria-label": label,
                    onChange: () => onToggle(rule.id),
                  },
                },
              ]}
            />
            <div className={styles.ruleActions}>
              {rule.action !== "storey-colors" ? (
                <Button
                  size="small"
                  priority="tertiary no outline"
                  iconId="fr-icon-edit-line"
                  title={`Modifier ${label}`}
                  onClick={() => onEdit(rule.id)}
                />
              ) : null}
              <Button
                size="small"
                priority="tertiary no outline"
                iconId="fr-icon-delete-line"
                title={`Supprimer ${label}`}
                onClick={() => onRemove(rule.id)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
