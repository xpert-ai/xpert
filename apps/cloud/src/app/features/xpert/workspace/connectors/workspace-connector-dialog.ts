import { InjectionToken } from '@angular/core'

/** Supplied only after the host resolves the Assistant workspace and checks management permission. */
export type WorkspaceConnectorDialogContext = {
  workspaceId: string
  bindingId: string
  /** Desktop has already opened the system browser; OAuth can use that tab without a popup. */
  authorizationNavigation?: 'current-tab'
}
export const WORKSPACE_CONNECTOR_DIALOG = new InjectionToken<WorkspaceConnectorDialogContext>(
  'WorkspaceConnectorDialog'
)
