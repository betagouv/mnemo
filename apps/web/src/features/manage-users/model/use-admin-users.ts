"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  AccountQuery,
  AdminUserList,
  UserRole,
} from "@mnemo/contracts/accounts";
import {
  approveAccount,
  listAdminUsers,
  updateUserRoles,
} from "@/server/accounts/actions";

export function useAdminUsers(
  initial: AdminUserList,
  initialQuery: AccountQuery,
) {
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (query === initialQuery && revision === 0) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void listAdminUsers(query)
        .then((result) => {
          if (active) {
            setData(result);
          }
        })
        .catch(() => {
          if (active)
            setError("Impossible de charger les utilisateurs. Réessayez.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, revision, initialQuery]);

  const act = useCallback(async (userId: string, roles?: UserRole[]) => {
    setActing(true);
    setError("");
    setSuccess("");
    try {
      const result = roles
        ? await updateUserRoles({ userId, roles })
        : await approveAccount({ userId });
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setSuccess(
        roles ? "Les rôles ont été modifiés." : "Le compte a été approuvé.",
      );
      setRevision((value) => value + 1);
      return true;
    } catch {
      setError("L'opération a échoué. Actualisez la page et réessayez.");
      return false;
    } finally {
      setActing(false);
    }
  }, []);
  return {
    data,
    query,
    setQuery,
    loading,
    acting,
    error,
    success,
    act,
    refresh: () => setRevision((value) => value + 1),
  };
}
