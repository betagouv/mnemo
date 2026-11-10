# Administrator approval and global account roles

- Status: Accepted
- Date: 2026-11-09

## Context

Public registration needs an administrator approval step in addition to email
verification. Global account administration and per-project permissions have
separate scopes.

## Decision

- Store global roles as a PostgreSQL enum array. Every account has `user`;
  administrators additionally have `admin`.
- Store `approved_at` and the approving account in `approved_by`. New registrations
  start without approval. The migration approves pre-existing accounts to preserve
  their access. Bootstrap the initial administrator through an explicit database
  update of a verified account.
- Better Auth continues to own credentials, email verification and sessions.
  Request authentication reads approval and roles live from PostgreSQL. Pending
  accounts can view their status and sign out, but cannot obtain a workspace actor.
- Keep administrative use cases and ports in `server/accounts/application`, with
  PostgreSQL transactions in its infrastructure adapter. Serialize role changes
  and approval using a transaction-scoped advisory lock, recheck the actor inside
  the transaction and preserve the final verified, approved administrator.
- Keep project membership authorization independent from global roles.
- Notify approved, verified administrators on registration and notify the user
  after approval through the existing Brevo HTML template. Provider failures are
  logged and do not roll back account creation or approval. Delivery is best
  effort and is not backed by a durable retry queue.
- Use the MUI community Data Grid with the react-dsfr theme for the administration
  feature. Scope its Emotion App Router cache to `/admin`; use server pagination,
  search and sorting and DSFR actions and dialogs.

## Consequences

Role changes apply to existing sessions on their next request. The initial
administrator requires an explicit bootstrap operation. Email delivery failures
need operator investigation. Other privileged authentication controls, including
administrator MFA, remain outside this account-approval iteration.
