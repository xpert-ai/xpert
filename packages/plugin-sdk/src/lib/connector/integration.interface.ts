export type ConnectorIntegrationOption = {
  id: string
  name: string
  organizationId: string | null
}

export type ConnectorIntegrationSelection =
  | { type: 'existing'; integrationId: string }
  | { type: 'new'; requestId: string; name: string; values: { [field: string]: string } }

export type ConnectorIntegrationRequest = {
  authMethodId: string
  selection: ConnectorIntegrationSelection
}
