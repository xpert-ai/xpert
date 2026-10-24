import type { ConnectorBinding, ConnectorStrategyDefinition } from '@xpert-ai/plugin-sdk/connector'

const workspaceScope = { type: 'workspace' as const, workspaceId: 'workspace-1' }

export const connectorDefinition: ConnectorStrategyDefinition = {
  provider: 'example',
  label: 'Example Connector',
  description: 'Connect an external workspace service',
  authorizationModes: ['personal', 'shared'],
  auth: {
    type: 'oauth2',
    authorizationUrl: '',
    tokenUrl: ''
  }
}

export const legacyDefinition: ConnectorStrategyDefinition = {
  provider: 'legacy',
  label: 'Legacy Connector',
  auth: {
    type: 'oauth2',
    authorizationUrl: '',
    tokenUrl: ''
  }
}

export const githubDefinition: ConnectorStrategyDefinition = {
  provider: 'github',
  label: 'GitHub',
  authorizationModes: ['personal', 'shared'],
  authMethods: [
    {
      id: 'github-app-oauth',
      type: 'oauth2',
      label: 'GitHub App OAuth',
      appCredentials: {
        fields: [
          { name: 'clientId', label: 'Client ID', required: true },
          { name: 'clientSecret', label: 'Client secret', required: true, type: 'password', secret: true }
        ]
      }
    },
    {
      id: 'pat',
      type: 'api_key',
      label: 'PAT',
      credentials: {
        fields: [{ name: 'token', label: 'Token', required: true, type: 'password', secret: true }]
      }
    }
  ]
}

export const embeddedDefinition: ConnectorStrategyDefinition = {
  provider: 'wecom',
  label: 'WeCom',
  description: 'Connect WeCom with a QR code',
  authorizationModes: ['personal', 'shared'],
  authMethods: [
    {
      id: 'wecom-qr',
      type: 'oauth2',
      label: 'WeCom QR',
      authorizationPresentation: {
        mode: 'embedded_qr',
        title: 'Scan to authorize',
        description: 'Use WeCom to scan this QR code.',
        ariaLabel: 'WeCom authorization QR code',
        completionHint: 'This window closes after authorization.',
        cancelLabel: 'Cancel authorization',
        copyLinkLabel: 'Copy authorization link',
        copyLinkError: 'Could not copy authorization link.'
      }
    }
  ]
}

export const workspaceBinding: ConnectorBinding = {
  id: 'workspace-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'shared',
  provider: 'example',
  status: 'disconnected'
}

export const sharedBinding: ConnectorBinding = {
  id: 'shared-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'shared',
  provider: 'example',
  status: 'active',
  profile: { name: 'Team Account' }
}

export const githubBinding: ConnectorBinding = {
  id: 'github-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'shared',
  provider: 'github',
  authMethodId: 'pat',
  status: 'disconnected'
}

export const embeddedBinding: ConnectorBinding = {
  id: 'wecom-binding',
  workspaceId: 'workspace-1',
  scopeType: 'workspace',
  scope: workspaceScope,
  authorizationMode: 'shared',
  provider: 'wecom',
  authMethodId: 'wecom-qr',
  status: 'disconnected'
}

export function createAuthorizationPopup() {
  const navigate = jest.fn()
  const focus = jest.fn()
  const close = jest.fn()
  const location = {}
  Object.defineProperty(location, 'href', { set: navigate })
  const popup = {
    opener: window,
    closed: false,
    close,
    focus,
    location
  } as unknown as Window
  return { popup, navigate, focus, close }
}

export function integrationDefinition(type: 'oauth2' | 'api_key'): ConnectorStrategyDefinition {
  const credentials = { integration: { provider: 'example-app', fields: [] } }
  return {
    provider: 'example',
    label: 'Example',
    authMethods: [
      type === 'oauth2'
        ? { id: 'app-auth', type, label: 'App', appCredentials: credentials }
        : { id: 'app-auth', type, label: 'App', credentials },
      { id: 'other-method', type: 'api_key', label: 'Other', credentials: { fields: [] } }
    ]
  }
}
