"use client";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  SavedMeasurement,
  SaveMeasurementInput,
} from "@mnemo/contracts/measurements";
import {
  saveMeasurement,
  deleteMeasurement,
} from "@/server/measurements/actions";

function useMeasurementStore(
  projectId: string,
  initial: SavedMeasurement[],
  canManage: boolean,
) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  async function save(input: Omit<SaveMeasurementInput, "projectId">) {
    if (locked.current || !canManage) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await saveMeasurement({ ...input, projectId });
      if (!result.measurement) {
        setError(result.error);
        return;
      }
      const saved = result.measurement;
      setItems((current) =>
        current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      );
      return saved;
    } catch {
      setError("Enregistrement impossible. Vérifiez votre connexion.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function remove(item: SavedMeasurement) {
    if (locked.current || !canManage) return false;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteMeasurement({
        projectId,
        id: item.id,
        version: item.version,
      });
      if (result.error) {
        setError(result.error);
        return false;
      }
      setItems((current) => current.filter((value) => value.id !== item.id));
      return true;
    } catch {
      setError("Suppression impossible. Vérifiez votre connexion.");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { items, busy, error, canManage, save, remove };
}
const Context = createContext<ReturnType<typeof useMeasurementStore> | null>(
  null,
);
export function ProjectMeasurementsProvider({
  projectId,
  initial,
  canManage,
  children,
}: {
  projectId: string;
  initial: SavedMeasurement[];
  canManage: boolean;
  children: ReactNode;
}) {
  const store = useMeasurementStore(projectId, initial, canManage);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useProjectMeasurements() {
  const store = useContext(Context);
  if (!store) throw new Error("ProjectMeasurementsProvider is required");
  return store;
}
