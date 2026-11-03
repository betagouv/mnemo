"use client";
import { useEffect, useState } from "react";
import Input from "@codegouvfr/react-dsfr/Input";
import Select from "@codegouvfr/react-dsfr/Select";
import RadioButtons from "@codegouvfr/react-dsfr/RadioButtons";
import Button from "@codegouvfr/react-dsfr/Button";
import Alert from "@codegouvfr/react-dsfr/Alert";
import type {
  BcfProjectOptions,
  BcfTopic,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import type { CapturedBcfViewpoint } from "@mnemo/ifc-viewer-adapter";
import { bcfLabel } from "@/entities/bcf";
import { ViewpointDraft } from "@/entities/bcf";
import type { BcfViewpointDraft } from "@mnemo/contracts/bcf";
import { createBcfTopic, updateBcfTopic } from "@/server/bcf/actions";
import styles from "./editor.module.css";

export type BcfObject = CreateBcfTopicInput["components"][number] & {
  name: string;
};
export type BcfEditorProps = {
  projectId: string;
  topic?: BcfTopic;
  options: BcfProjectOptions;
  members: Array<{ id: string; name: string; email: string }>;
  canCapture: boolean;
  capture: (
    objects?: CreateBcfTopicInput["components"],
  ) => Promise<CapturedBcfViewpoint>;
  selection: BcfObject | null;
  queryObjects: () => BcfObject[];
  onSaved: (topic: BcfTopic) => void;
  onCancel: () => void;
  previewObjects?: (objects: CreateBcfTopicInput["components"]) => void;
  upload: (
    view: CapturedBcfViewpoint | null,
  ) => Promise<BcfViewpointDraft | undefined>;
};
export function BcfTopicEditor({
  projectId,
  topic,
  options,
  members,
  canCapture,
  capture,
  selection,
  queryObjects,
  onSaved,
  onCancel,
  upload,
  previewObjects,
}: BcfEditorProps) {
  const [title, setTitle] = useState(topic?.title ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [type, setType] = useState(topic?.type ?? options.types[0]);
  const [priority, setPriority] = useState(
    topic?.priority ??
      (options.priorities.includes("Normal")
        ? "Normal"
        : options.priorities[0]),
  );
  const [status, setStatus] = useState(topic?.status ?? "Open");
  const [assignedTo, setAssignedTo] = useState(topic?.assignedTo ?? "");
  const [dueDate, setDueDate] = useState(topic?.dueDate ?? "");
  const [objects, setObjects] = useState<BcfObject[]>(
    topic?.components.map((component) => ({
      assetId: component.assetId,
      expressId: component.expressId,
      globalId: component.globalId,
      name: component.globalId,
    })) ?? [],
  );
  const [scope, setScope] = useState(
    topic?.components.length ? "objects" : "general",
  );
  const [view, setView] = useState<CapturedBcfViewpoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    previewObjects?.(scope === "objects" ? objects : []);
    return () => previewObjects?.([]);
  }, [objects, scope, previewObjects]);
  const add = (items: BcfObject[]) => {
    const next = [
      ...new Map(
        [...objects, ...items].map((item) => [
          `${item.assetId}:${item.globalId}`,
          item,
        ]),
      ).values(),
    ];
    if (next.length > 10000) {
      setError(
        "Une remarque peut concerner au maximum 10 000 objets. Affinez le filtre.",
      );
      return;
    }
    setObjects(next);
  };
  const choose = (
    label: string,
    value: string,
    values: string[],
    change: (value: string) => void,
  ) => (
    <Select
      label={label}
      nativeSelectProps={{
        value,
        onChange: (event) => change(event.target.value),
        disabled: busy,
      }}
    >
      {[...new Set([value, ...values])].map((value) => (
        <option key={value} value={value}>
          {bcfLabel(value)}
        </option>
      ))}
    </Select>
  );
  const dirty =
    title !== (topic?.title ?? "") ||
    description !== (topic?.description ?? "") ||
    Boolean(view) ||
    objects.length !== (topic?.components.length ?? 0) ||
    type !== (topic?.type ?? options.types[0]) ||
    assignedTo !== (topic?.assignedTo ?? "") ||
    dueDate !== (topic?.dueDate ?? "") ||
    Boolean(topic && status !== topic.status);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const cancel = () => {
    if (!dirty || confirm("Abandonner les modifications de cette remarque ?"))
      onCancel();
  };
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        void (async () => {
          if (scope === "objects" && !objects.length)
            throw new Error(
              "Ajoutez au moins un objet ou choisissez « Le projet en général ».",
            );
          const fields = {
            projectId,
            title,
            description,
            type,
            priority,
            assignedTo: assignedTo || null,
            dueDate: dueDate || null,
            labels: topic?.labels ?? [],
            components:
              scope === "objects"
                ? objects.map(({ name: _name, ...object }) => {
                    void _name;
                    return object;
                  })
                : [],
          };
          const result = topic
            ? await updateBcfTopic({ ...fields, topicId: topic.id, status })
            : await createBcfTopic({
                ...fields,
                viewpoint: await upload(view),
              });
          onSaved(result);
        })()
          .catch((error: unknown) =>
            setError(
              error instanceof Error
                ? error.message
                : "L’enregistrement a échoué.",
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <div className={styles.fields}>
        <Input
          label="Titre"
          nativeInputProps={{
            value: title,
            onChange: (event) => setTitle(event.target.value),
            required: true,
            maxLength: 255,
            disabled: busy,
            autoFocus: true,
          }}
        />
        <Input
          label="Description"
          textArea
          nativeTextAreaProps={{
            value: description,
            onChange: (event) => setDescription(event.target.value),
            maxLength: 10000,
            rows: 2,
            disabled: busy,
          }}
        />
        <RadioButtons
          small
          orientation="horizontal"
          legend="Cette remarque concerne"
          options={[
            {
              label: "Le projet en général",
              nativeInputProps: {
                checked: scope === "general",
                onChange: () => setScope("general"),
                disabled: busy,
              },
            },
            {
              label: "Des objets de la maquette",
              nativeInputProps: {
                checked: scope === "objects",
                onChange: () => setScope("objects"),
                disabled: busy,
              },
            },
          ]}
        />
        {scope === "objects" ? (
          <details className={styles.objects} open={!objects.length}>
            <summary>Objets concernés ({objects.length})</summary>
            <div className={styles.objectFields}>
              <Button
                type="button"
                priority="secondary"
                size="small"
                disabled={!selection || busy}
                onClick={() => selection && add([selection])}
              >
                Ajouter l’objet sélectionné
              </Button>
              <Input
                label="Filtrer les objets à ajouter"
                hintText="Nom ou classe IFC, par exemple IfcFireSuppressionTerminal."
                nativeInputProps={{
                  value: filter,
                  onChange: (event) => setFilter(event.target.value),
                  disabled: busy,
                }}
              />
              <Button
                type="button"
                priority="secondary"
                size="small"
                disabled={!filter.trim() || busy}
                onClick={() =>
                  add(
                    queryObjects().filter((object) =>
                      object.name
                        .toLocaleLowerCase()
                        .includes(filter.trim().toLocaleLowerCase()),
                    ),
                  )
                }
              >
                Ajouter les résultats du filtre
              </Button>
              <p className="!m-0">
                {objects.length} objet{objects.length > 1 ? "s" : ""} retenu
                {objects.length > 1 ? "s" : ""}
              </p>
              <ul className="max-h-40 overflow-auto !pl-0 list-none">
                {objects.map((object) => (
                  <li
                    key={`${object.assetId}:${object.globalId}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate" title={object.name}>
                      {object.name}
                    </span>
                    <Button
                      type="button"
                      size="small"
                      priority="tertiary no outline"
                      title={`Retirer ${object.name}`}
                      iconId="fr-icon-close-line"
                      disabled={busy}
                      onClick={() =>
                        setObjects((items) =>
                          items.filter((item) => item !== object),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}
        {!topic ? (
          <ViewpointDraft
            value={view}
            onChange={setView}
            onBusyChange={setCaptureBusy}
            capture={() => capture(scope === "objects" ? objects : [])}
            disabled={!canCapture || busy}
          />
        ) : null}
        {topic ? choose("Statut", status, options.statuses, setStatus) : null}
        <div className="grid grid-cols-2 gap-3">
          {choose("Type", type, options.types, setType)}
          {choose("Priorité", priority, options.priorities, setPriority)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Responsable"
            nativeSelectProps={{
              value: assignedTo,
              onChange: (event) => setAssignedTo(event.target.value),
              disabled: busy,
            }}
          >
            <option value="">Non attribué</option>
            {assignedTo &&
            !members.some((member) => member.email === assignedTo) ? (
              <option value={assignedTo}>{assignedTo} (importé)</option>
            ) : null}
            {members.map((member) => (
              <option key={member.id} value={member.email}>
                {member.name}
              </option>
            ))}
          </Select>
          <Input
            label="Échéance"
            nativeInputProps={{
              type: "date",
              value: dueDate,
              onChange: (event) => setDueDate(event.target.value),
              disabled: busy,
            }}
          />
        </div>
        {error ? <Alert severity="error" small description={error} /> : null}
      </div>
      <div className={styles.actions}>
        <Button size="small" type="submit" disabled={busy || captureBusy}>
          {busy
            ? "Enregistrement…"
            : topic
              ? "Enregistrer"
              : "Créer la remarque"}
        </Button>
        <Button
          size="small"
          type="button"
          priority="secondary"
          disabled={busy || captureBusy}
          onClick={cancel}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
