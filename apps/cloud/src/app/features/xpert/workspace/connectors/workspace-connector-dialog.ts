import { InjectionToken } from '@angular/core'

/** Supplied only after the host resolves the Assistant workspace and checks management permission. */
export type WorkspaceConnectorDialogContext = { workspaceId: string; bindingId: string }
export const WORKSPACE_CONNECTOR_DIALOG = new InjectionToken<WorkspaceConnectorDialogContext>(
  'WorkspaceConnectorDialog'
)
