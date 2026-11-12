"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import Select from "@codegouvfr/react-dsfr/Select";
import Badge from "@codegouvfr/react-dsfr/Badge";
import Alert from "@codegouvfr/react-dsfr/Alert";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import { bcfLabel } from "@/entities/bcf";
import { BcfTopicEditor } from "./topic-editor";
import { BcfExchange } from "./exchange";
import { uploadViewpoint } from "../api/upload-viewpoint";
import styles from "./bcf-panel.module.css";
import { BcfTopicDetail } from "./topic-detail";
import { useBcfWorkspace } from "../model/use-bcf-workspace";
import type { BcfWorkspaceProps } from "../model/bcf-workspace-types";

export function BcfPanel(props: BcfWorkspaceProps) {
  const {
    projectId,
    permissions,
    selection,
    queryObjects,
    previewObjects,
    capture,
    canCapture,
    focusObject,
    onMarkersChange,
  } = props;
  const {
    topics,
    create,
    creation,
    options,
    members,
    screen,
    setScreen,
    active,
    busy,
    error,
    setError,
    search,
    setSearch,
    status,
    setStatus,
    assignee,
    setAssignee,
    markers,
    setMarkers,
    backToList,
    readWorkspace,
    open,
    saved,
    filtered,
    safeApply,
  } = useBcfWorkspace(props);
  return (
    <div className={styles.root}>
      {error ? <Alert severity="error" small description={error} /> : null}
      {busy ? <p role="status">Chargement…</p> : null}
      <div className={styles.content} data-screen={screen}>
        {screen === "create" || screen === "edit" ? (
          <>
            <h2 className={styles.screenTitle}>
              {screen === "create"
                ? "Nouvelle remarque"
                : "Modifier la remarque"}
            </h2>
            <BcfTopicEditor
              key={
                screen === "create"
                  ? `create-${creation.revision}`
                  : `edit-${active?.id}`
              }
              projectId={projectId}
              topic={screen === "edit" ? (active ?? undefined) : undefined}
              initialObjects={
                screen === "create" ? creation.objects : undefined
              }
              options={options}
              members={members}
              selection={selection}
              queryObjects={queryObjects}
              previewObjects={previewObjects}
              capture={capture}
              canCapture={canCapture}
              upload={(view) => uploadViewpoint(projectId, view)}
              onSaved={saved}
              onCancel={() => setScreen(screen === "edit" ? "detail" : "list")}
            />
          </>
        ) : screen === "detail" && active ? (
          <BcfTopicDetail
            key={active.id}
            projectId={projectId}
            active={active}
            permissions={permissions}
            members={members}
            canCapture={canCapture}
            capture={capture}
            focusObject={focusObject}
            queryObjects={queryObjects}
            onSaved={saved}
            onApply={safeApply}
            onBack={backToList}
            onEdit={() => setScreen("edit")}
            onError={setError}
          />
        ) : (
          <>
            {permissions.createTopic ? (
              <Button
                size="small"
                iconId="fr-icon-add-line"
                onClick={() => create()}
              >
                Nouvelle remarque
              </Button>
            ) : null}
            <Input
              label="Rechercher une remarque"
              nativeInputProps={{
                value: search,
                onChange: (event) => setSearch(event.target.value),
                placeholder: "Titre ou numéro",
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Statut"
                nativeSelectProps={{
                  value: status,
                  onChange: (event) => setStatus(event.target.value),
                }}
              >
                <option value="">Tous</option>
                {[
                  ...new Set([
                    ...options.statuses,
                    ...topics.map((topic) => topic.status),
                  ]),
                ].map((value) => (
                  <option key={value} value={value}>
                    {bcfLabel(value)}
                  </option>
                ))}
              </Select>
              <Select
                label="Responsable"
                nativeSelectProps={{
                  value: assignee,
                  onChange: (event) => setAssignee(event.target.value),
                }}
              >
                <option value="">Tous</option>
                {[
                  ...new Set(
                    topics.flatMap((topic) =>
                      topic.assignedTo ? [topic.assignedTo] : [],
                    ),
                  ),
                ].map((email) => (
                  <option key={email} value={email}>
                    {members.find((member) => member.email === email)?.name ??
                      email}
                  </option>
                ))}
              </Select>
            </div>
            <Checkbox
              options={[
                {
                  label: "Afficher les repères dans la scène",
                  nativeInputProps: {
                    checked: markers,
                    onChange: (event) => {
                      setMarkers(event.target.checked);
                      if (!event.target.checked) onMarkersChange([]);
                    },
                  },
                },
              ]}
            />
            <p className="text-sm !m-0" role="status">
              {filtered.length} remarque(s)
            </p>
            <ul className="!p-0 !m-0 list-none grid gap-2">
              {filtered.map((topic) => (
                <li
                  key={topic.id}
                  className="border-b border-[var(--border-default-grey)] pb-3"
                >
                  <Button
                    className="!justify-start !text-left !px-0"
                    priority="tertiary no outline"
                    onClick={() => void open(topic.id)}
                  >
                    #{topic.number} · {topic.title}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Badge small noIcon>
                      {bcfLabel(topic.status)}
                    </Badge>
                    <span className="text-sm">
                      {topic.commentCount} commentaire(s)
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-mention-grey)] !mt-1 !mb-0">
                    {members.find((member) => member.email === topic.assignedTo)
                      ?.name ??
                      topic.assignedTo ??
                      "Non attribué"}
                    {topic.dueDate ? ` · ${topic.dueDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            {!filtered.length ? (
              <p className="!m-0">
                {topics.length
                  ? "Aucune remarque ne correspond aux filtres."
                  : "Aucune remarque dans ce dossier."}
              </p>
            ) : null}
            <BcfExchange
              projectId={projectId}
              canImport={permissions.createTopic}
              onImported={() =>
                void readWorkspace().catch(() =>
                  setError("Rechargement impossible."),
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
