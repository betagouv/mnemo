"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { frFR } from "@mui/x-data-grid/locales";
import MuiDsfrThemeProvider from "@codegouvfr/react-dsfr/mui";
import Alert from "@codegouvfr/react-dsfr/Alert";
import Badge from "@codegouvfr/react-dsfr/Badge";
import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import Select from "@codegouvfr/react-dsfr/Select";
import Tabs from "@codegouvfr/react-dsfr/Tabs";
import { createModal } from "@codegouvfr/react-dsfr/Modal";
import type {
  AccountQuery,
  AdminUser,
  AdminUserList,
} from "@mnemo/contracts/accounts";
import { useAdminUsers } from "../model/use-admin-users";

const roleModal = createModal({
  id: "admin-user-roles",
  isOpenedByDefault: false,
});
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR");

export function ManageUsers({
  initial,
  initialQuery,
  actorId,
}: {
  initial: AdminUserList;
  initialQuery: AccountQuery;
  actorId: string;
}) {
  const state = useAdminUsers(initial, initialQuery);
  const { acting, loading, act } = state;
  const router = useRouter();
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [adminRole, setAdminRole] = useState(false);
  const columns = useMemo<GridColDef<AdminUser>[]>(
    () => [
      { field: "name", headerName: "Nom", flex: 1, minWidth: 180 },
      {
        field: "email",
        headerName: "Adresse e-mail",
        flex: 1.4,
        minWidth: 240,
      },
      {
        field: "emailVerified",
        headerName: "E-mail",
        sortable: false,
        width: 130,
        renderCell: ({ row }) => (
          <Badge small noIcon severity={row.emailVerified ? "success" : "new"}>
            {row.emailVerified ? "Vérifié" : "À confirmer"}
          </Badge>
        ),
      },
      {
        field: "approvedAt",
        headerName: "Compte",
        sortable: false,
        width: 130,
        renderCell: ({ row }) => (
          <Badge small noIcon severity={row.approvedAt ? "success" : "warning"}>
            {row.approvedAt ? "Approuvé" : "En attente"}
          </Badge>
        ),
      },
      {
        field: "roles",
        headerName: "Rôle",
        sortable: false,
        width: 155,
        valueGetter: (_value, row) =>
          row.roles.includes("admin") ? "Administrateur" : "Utilisateur",
      },
      {
        field: "createdAt",
        headerName: "Inscription",
        width: 135,
        valueFormatter: (value: string) => date(value),
      },
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        width: 240,
        display: "flex",
        renderCell: ({ row }) => (
          <div className="flex items-center gap-2">
            {!row.approvedAt && (
              <Button
                size="small"
                disabled={acting || loading}
                onClick={() => void act(row.id)}
              >
                Approuver
              </Button>
            )}
            <Button
              size="small"
              priority="tertiary"
              disabled={acting || loading}
              onClick={() => {
                setEditing(row);
                setAdminRole(row.roles.includes("admin"));
                roleModal.open();
              }}
            >
              Modifier le rôle
            </Button>
          </div>
        ),
      },
    ],
    [acting, loading, act],
  );
  return (
    <MuiDsfrThemeProvider>
      <Tabs
        selectedTabId={state.query.status}
        tabs={[
          {
            tabId: "pending",
            label: `Demandes en attente (${state.data.pendingCount})`,
          },
          { tabId: "all", label: "Tous les utilisateurs" },
          { tabId: "approved", label: "Comptes approuvés" },
        ]}
        onTabChange={(status) =>
          state.setQuery((query) => ({
            ...query,
            status: status as AccountQuery["status"],
            page: 0,
          }))
        }
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <Input
            className="mb-0 w-full max-w-md"
            label="Rechercher un utilisateur"
            nativeInputProps={{
              type: "search",
              placeholder: "Nom ou adresse e-mail",
              maxLength: 160,
              value: state.query.search,
              onChange: (event) =>
                state.setQuery((query) => ({
                  ...query,
                  search: event.target.value,
                  page: 0,
                })),
            }}
          />
          <Button
            iconId="fr-icon-refresh-line"
            priority="secondary"
            disabled={state.loading}
            onClick={state.refresh}
          >
            Actualiser
          </Button>
        </div>
        {state.error && (
          <Alert
            className="mb-4"
            severity="error"
            small
            description={state.error}
          />
        )}
        {state.success && (
          <Alert
            className="mb-4"
            severity="success"
            small
            description={state.success}
          />
        )}
        <div
          className="h-[38rem] min-w-0"
          aria-label="Gestion des utilisateurs"
        >
          <DataGrid
            aria-label="Utilisateurs Mnemo"
            rows={state.data.users}
            columns={columns}
            rowCount={state.data.total}
            loading={state.loading}
            disableRowSelectionOnClick
            disableColumnFilter
            disableColumnMenu
            paginationMode="server"
            sortingMode="server"
            pageSizeOptions={[10, 25, 50, 100]}
            paginationModel={{
              page: state.query.page,
              pageSize: state.query.pageSize,
            }}
            onPaginationModelChange={({ page, pageSize }) =>
              state.setQuery((query) => ({
                ...query,
                page,
                pageSize: pageSize as AccountQuery["pageSize"],
              }))
            }
            sortModel={[
              { field: state.query.sortBy, sort: state.query.sortDirection },
            ]}
            onSortModelChange={(sort) =>
              state.setQuery((query) => ({
                ...query,
                sortBy: (sort[0]?.field ??
                  "createdAt") as AccountQuery["sortBy"],
                sortDirection: sort[0]?.sort ?? "desc",
                page: 0,
              }))
            }
            localeText={{
              ...frFR.components.MuiDataGrid.defaultProps.localeText,
              noRowsLabel:
                state.query.status === "pending"
                  ? "Aucune demande de compte en attente"
                  : "Aucun utilisateur trouvé",
            }}
            sx={{
              backgroundColor: "background.paper",
              borderRadius: 0,
              "& .MuiDataGrid-cell": { alignItems: "center", display: "flex" },
            }}
          />
        </div>
      </Tabs>
      <roleModal.Component
        title="Modifier le rôle"
        buttons={[
          {
            children: "Annuler",
            priority: "secondary",
            disabled: state.acting,
          },
          {
            children: state.acting ? "Enregistrement…" : "Enregistrer",
            disabled: state.acting || !editing,
            doClosesModal: false,
            onClick: async () => {
              if (!editing) return;
              if (
                await state.act(
                  editing.id,
                  adminRole ? ["user", "admin"] : ["user"],
                )
              ) {
                roleModal.close();
                if (editing.id === actorId && !adminRole) {
                  router.replace("/projets");
                  router.refresh();
                }
              }
            },
          },
        ]}
      >
        {editing && (
          <>
            <p className="mb-2 font-bold">{editing.name}</p>
            <p>{editing.email}</p>
            <Select
              label="Rôle du compte"
              hint="Les administrateurs conservent aussi le rôle utilisateur. Les accès aux dossiers sont gérés séparément."
              nativeSelectProps={{
                value: adminRole ? "admin" : "user",
                onChange: (event) =>
                  setAdminRole(event.target.value === "admin"),
              }}
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </Select>
            {state.error && (
              <Alert severity="error" small description={state.error} />
            )}
          </>
        )}
      </roleModal.Component>
    </MuiDsfrThemeProvider>
  );
}
