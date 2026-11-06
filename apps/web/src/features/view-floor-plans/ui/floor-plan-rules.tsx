"use client";

import Accordion from "@codegouvfr/react-dsfr/Accordion";
import Button from "@codegouvfr/react-dsfr/Button";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import Input from "@codegouvfr/react-dsfr/Input";
import Select from "@codegouvfr/react-dsfr/Select";
import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";

export function FloorPlanRules({
  rules,
  classes,
  onChange,
}: {
  rules: FloorPlanRule[];
  classes: string[];
  onChange: (rules: FloorPlanRule[]) => void;
}) {
  function update(id: string, patch: Partial<FloorPlanRule>) {
    onChange(
      rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  }
  return (
    <div>
      <p className="mb-3 text-sm">
        Les règles remplacent le style choisi. La dernière règle applicable est
        prioritaire.
      </p>
      {rules.map((rule) => (
        <Accordion key={rule.id} label={rule.name || "Nouvelle règle"}>
          <Input
            label="Nom de la règle"
            nativeInputProps={{
              value: rule.name,
              maxLength: 80,
              required: true,
              onChange: (e) => update(rule.id, { name: e.target.value }),
            }}
          />
          <Select
            label="Classe IFC"
            nativeSelectProps={{
              value: rule.ifcType,
              onChange: (e) => update(rule.id, { ifcType: e.target.value }),
            }}
          >
            {Array.from(new Set([...classes, rule.ifcType]))
              .sort()
              .map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Remplissage"
              nativeInputProps={{
                type: "color",
                value: rule.fillColor,
                onChange: (e) => update(rule.id, { fillColor: e.target.value }),
              }}
            />
            <Input
              label="Contour"
              nativeInputProps={{
                type: "color",
                value: rule.strokeColor,
                onChange: (e) =>
                  update(rule.id, { strokeColor: e.target.value }),
              }}
            />
          </div>
          <Select
            label="Épaisseur du trait"
            nativeSelectProps={{
              value: rule.lineWeight,
              onChange: (e) =>
                update(rule.id, { lineWeight: Number(e.target.value) }),
            }}
          >
            {[0.1, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2].map((weight) => (
              <option key={weight} value={weight}>
                {weight.toLocaleString("fr-FR")} mm
              </option>
            ))}
          </Select>
          <Checkbox
            options={[
              {
                label: "Règle active",
                nativeInputProps: {
                  checked: rule.enabled,
                  onChange: (e) =>
                    update(rule.id, { enabled: e.target.checked }),
                },
              },
            ]}
          />
          <Button
            size="small"
            priority="tertiary"
            iconId="fr-icon-delete-line"
            onClick={() =>
              onChange(rules.filter((item) => item.id !== rule.id))
            }
          >
            Supprimer la règle
          </Button>
        </Accordion>
      ))}
      <Button
        className="mt-3"
        size="small"
        priority="secondary"
        iconId="fr-icon-add-line"
        disabled={!classes.length || rules.length >= 50}
        onClick={() =>
          onChange([
            ...rules,
            {
              id: crypto.randomUUID(),
              name: "Nouvelle règle",
              enabled: true,
              ifcType: classes.includes("IfcWall") ? "IfcWall" : classes[0],
              fillColor: "#808080",
              strokeColor: "#000000",
              lineWeight: 0.35,
            },
          ])
        }
      >
        Ajouter une règle
      </Button>
    </div>
  );
}
