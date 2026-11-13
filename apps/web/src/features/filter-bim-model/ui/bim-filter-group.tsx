"use client";
import { useId, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import type { IfcBimCatalog } from "@mnemo/ifc-viewer-adapter";
import type { BimFilterGroup as FilterGroup } from "@mnemo/contracts/bim-filters";
import type { BimFilterViewer } from "../model/viewer-target";
import { BimFilterEditor } from "./bim-filter-editor";
import { BimFilterRuleList } from "./bim-filter-rule-list";
import { BimFilterGroupName } from "./bim-filter-group-name";
import { BimFilterGroupMenu } from "./bim-filter-group-menu";
import styles from "./bim-filter-panel.module.css";

export function BimFilterGroup({
  group,
  catalog,
  getViewer,
  onChange,
  onDuplicate,
  onRemove,
}: {
  group: FilterGroup;
  catalog: IfcBimCatalog;
  getViewer: () => BimFilterViewer | null;
  onChange: (group: FilterGroup) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(
    group.enabled || !group.rules.length,
  );
  const [renaming, setRenaming] = useState(false);
  const [editor, setEditor] = useState<{
    id: string;
    autoFocus: boolean;
  } | null>(group.rules.length ? null : { id: "new", autoFocus: false });
  const editing = group.rules.find((rule) => rule.id === editor?.id);
  const showEditor = editor?.id === "new" || Boolean(editing);
  return (
    <section className={styles.group} aria-label={`Groupe ${group.name}`}>
      <div className={styles.groupHeading}>
        <Checkbox
          small
          className={styles.groupToggle}
          options={[
            {
              label: (
                <span>
                  <strong>{group.name}</strong>
                  <small>
                    {group.rules.length} filtre
                    {group.rules.length > 1 ? "s" : ""}
                  </small>
                </span>
              ),
              nativeInputProps: {
                checked: group.enabled,
                "aria-label": `Activer le groupe ${group.name}`,
                onChange: () => onChange({ ...group, enabled: !group.enabled }),
              },
            },
          ]}
        />
        <BimFilterGroupMenu
          name={group.name}
          onRename={() => {
            setRenaming(true);
            setExpanded(true);
          }}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
        <Button
          size="small"
          priority="tertiary no outline"
          iconId={
            expanded ? "fr-icon-arrow-up-s-line" : "fr-icon-arrow-down-s-line"
          }
          title={`${expanded ? "Replier" : "Déplier"} ${group.name}`}
          nativeButtonProps={{ "aria-expanded": expanded, "aria-controls": id }}
          onClick={() => setExpanded(!expanded)}
        />
      </div>
      <div id={id} hidden={!expanded} className={styles.groupBody}>
        {renaming ? (
          <BimFilterGroupName
            initial={group.name}
            onCancel={() => setRenaming(false)}
            onSave={(name) => {
              onChange({ ...group, name });
              setRenaming(false);
            }}
          />
        ) : null}
        {group.rules.length ? (
          <BimFilterRuleList
            rules={group.rules}
            catalog={catalog}
            onToggle={(ruleId) =>
              onChange({
                ...group,
                rules: group.rules.map((rule) =>
                  rule.id === ruleId
                    ? { ...rule, enabled: !rule.enabled }
                    : rule,
                ),
              })
            }
            onEdit={(ruleId) => setEditor({ id: ruleId, autoFocus: true })}
            onDuplicate={(ruleId) => {
              const source = group.rules.find((rule) => rule.id === ruleId);
              if (!source) return;
              const copy = { ...source, id: crypto.randomUUID() };
              onChange({ ...group, rules: [...group.rules, copy] });
              setEditor({ id: copy.id, autoFocus: true });
            }}
            onRemove={(ruleId) =>
              onChange({
                ...group,
                rules: group.rules.filter((rule) => rule.id !== ruleId),
              })
            }
          />
        ) : null}
        {showEditor ? (
          <BimFilterEditor
            key={editor?.id}
            catalog={catalog}
            getViewer={getViewer}
            initial={editing}
            editing={Boolean(editing)}
            autoFocus={editor?.autoFocus}
            onCancel={() => setEditor(null)}
            onSave={(draft) => {
              const rule = {
                ...draft,
                id: editing?.id ?? crypto.randomUUID(),
                enabled: editing?.enabled ?? true,
              };
              onChange({
                ...group,
                rules: editing
                  ? group.rules.map((item) =>
                      item.id === rule.id ? rule : item,
                    )
                  : [...group.rules, rule],
              });
              setEditor(null);
            }}
          />
        ) : (
          <Button
            className={styles.addButton}
            size="small"
            priority="tertiary no outline"
            iconId="fr-icon-add-line"
            nativeButtonProps={{ autoFocus: editor === null }}
            onClick={() => setEditor({ id: "new", autoFocus: true })}
          >
            Ajouter un filtre
          </Button>
        )}
      </div>
    </section>
  );
}
