import { IEnvironment, normalizeDeploymentTarget, VERSION } from './types'

const API_BASE_URL = getEnvValue('VITE_API_BASE_URL') || 'http://localhost:3000'
const CHATKIT_FRAME_URL = getEnvValue('VITE_CHATKIT_FRAME_URL') || '/chatkit'
const MCP_APP_SANDBOX_PROXY_URL = getEnvValue('VITE_MCP_APP_SANDBOX_PROXY_URL')
const MCP_APP_SANDBOX_ALLOWED_DOMAINS = getEnvValue('VITE_MCP_APP_SANDBOX_ALLOWED_DOMAINS')
const DEPLOYMENT_TARGET = normalizeDeploymentTarget(getEnvValue('VITE_DEPLOYMENT_TARGET', 'DEPLOYMENT_TARGET'), 'local')

export const environment: IEnvironment = {
  version: VERSION,
  production: false,
  DEMO: false,
  deploymentTarget: DEPLOYMENT_TARGET,
  API_BASE_URL: API_BASE_URL,
  CHATKIT_FRAME_URL,
  mcpOAuthEnabled: false,
  MCP_APP_SANDBOX_PROXY_URL,
  MCP_APP_SANDBOX_ALLOWED_DOMAINS
}

function getEnvValue(...keys: string[]): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
  for (const key of keys) {
    const value = env?.[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}
