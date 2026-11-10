"use client";

import { Upload } from "@codegouvfr/react-dsfr/Upload";
import {
  beginAssetUploadInputSchema,
  type AssetKind,
  type AssetSummary,
} from "@mnemo/contracts/assets";
import { supportsAssetFile } from "@mnemo/domain/asset";
import { type DragEvent, useRef, useState } from "react";

import { beginAssetUpload, completeAssetUpload } from "@/server/assets/actions";

import styles from "./upload-asset-controls.module.css";
import { uploadFile } from "./upload-file";

const acceptedFiles = ".ifc,.ifczip,.las,.laz,.ply,.e57";

type FileSystemHandleItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

function fileFromEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
}

async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const files = Array.from(transfer.files);
  if (files.length > 0) return files;

  const pendingFiles: Promise<File | null>[] = [];
  for (const item of transfer.items) {
    if (item.kind !== "file") continue;

    const file = item.getAsFile();
    if (file) {
      pendingFiles.push(Promise.resolve(file));
      continue;
    }

    // These accessors must be called synchronously during the drop event.
    const handlePromise = (
      item as FileSystemHandleItem
    ).getAsFileSystemHandle?.();
    const entry = item.webkitGetAsEntry();
    pendingFiles.push(
      (async () => {
        const handle = await handlePromise?.catch(() => null);
        if (handle?.kind === "file") {
          const fileHandle = handle as FileSystemFileHandle;
          const file = await fileHandle.getFile().catch(() => null);
          if (file) return file;
        }
        return entry?.isFile
          ? fileFromEntry(entry as FileSystemFileEntry)
          : null;
      })(),
    );
  }

  return (await Promise.all(pendingFiles)).filter(
    (file): file is File => file !== null,
  );
}

export function UploadAssetControls({
  projectId,
  onUploaded,
  label = "Fichier à ajouter",
}: {
  projectId: string;
  label?: string;
  onUploaded: (asset: AssetSummary) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeDropIdRef = useRef(0);
  const isUploading = progress !== null;

  async function startUpload(kind: AssetKind, file: File) {
    setError(null);
    setCurrentFile(file.name);
    setProgress(0);

    try {
      const target = await beginAssetUpload({
        projectId,
        kind,
        fileName: file.name,
        mediaType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      await uploadFile({
        file,
        url: target.uploadUrl,
        headers: target.requiredHeaders,
        onProgress: setProgress,
      });
      const asset = await completeAssetUpload({
        projectId,
        assetId: target.asset.id,
      });
      onUploaded(asset);
    } catch {
      setError(
        "L’envoi n’a pas abouti. Vérifiez le format, la taille et la connexion au stockage.",
      );
    } finally {
      setCurrentFile(null);
      setProgress(null);
    }
  }

  function onFileSelected(file: File | undefined) {
    if (!file || isUploading) return;

    const kind: AssetKind | null = supportsAssetFile("ifc", file.name)
      ? "ifc"
      : supportsAssetFile("point_cloud", file.name)
        ? "point_cloud"
        : null;

    if (!kind) {
      setError(
        "Format non pris en charge. Utilisez IFC, IFCZIP, LAS, LAZ, PLY ou E57.",
      );
      return;
    }

    if (
      !beginAssetUploadInputSchema.shape.sizeBytes.safeParse(file.size).success
    ) {
      setError("Le fichier doit être non vide et ne pas dépasser 5 Gio.");
      return;
    }

    void startUpload(kind, file);
  }

  function onDroppedFiles(files: File[]) {
    if (files.length === 0) {
      setError(
        "Le navigateur n’a transmis aucun fichier. Utilisez le champ « Ajouter un fichier » pour l’ajouter.",
      );
      return;
    }
    if (files.length > 1) {
      setError(`${files.length} fichiers détectés. Déposez-les un par un.`);
      return;
    }
    onFileSelected(files[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    void filesFromDrop(event.dataTransfer).then(onDroppedFiles);
  }

  return (
    <div className={styles.controls}>
      <div
        aria-busy={isUploading}
        aria-label="Ajouter un fichier au projet"
        className={`${styles.dropzone} ${isDragging ? styles.dragging : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isUploading) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => {
          if (!isUploading) setIsDragging(true);
          if (event.target === fileInputRef.current) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = isUploading ? "none" : "copy";
        }}
        onDrop={(event) => {
          if (event.target !== fileInputRef.current) onDrop(event);
        }}
        role="group"
      >
        <Upload
          label={label}
          hint="Formats acceptés: IFC, IFCZIP, LAS, LAZ, PLY, E57. Un seul fichier, jusqu’à 5 Gio."
          disabled={isUploading}
          nativeInputProps={{
            accept: acceptedFiles,
            onChange: (event) => {
              nativeDropIdRef.current += 1;
              setIsDragging(false);
              onFileSelected(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            },
            onDrop: (event) => {
              event.stopPropagation();
              setIsDragging(false);
              if (isUploading) return;

              const directFiles = Array.from(event.dataTransfer.files);
              if (directFiles.length > 0) {
                event.preventDefault();
                onDroppedFiles(directFiles);
                return;
              }

              // Let the native file input receive the drop first. Some browsers
              // populate input.files even when DataTransfer exposes no File.
              const dropId = ++nativeDropIdRef.current;
              const files = filesFromDrop(event.dataTransfer);
              window.setTimeout(() => {
                if (nativeDropIdRef.current !== dropId) return;
                void files.then(onDroppedFiles);
              }, 300);
            },
            ref: fileInputRef,
          }}
        />
        <p className={styles.dropHint}>
          Vous pouvez aussi glisser-déposer un fichier dans cette zone.
        </p>
      </div>

      {progress !== null ? (
        <div className={styles.progress} role="status">
          <div>
            <span>{currentFile}</span>
            <strong>{progress} %</strong>
          </div>
          <progress max={100} value={progress} />
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
