import { IEnvironment, VERSION } from './types'

const API_BASE_URL = 'DOCKER_API_BASE_URL'
const DEPLOYMENT_TARGET = 'DOCKER_DEPLOYMENT_TARGET'
const CODE_XPERT_URL = 'DOCKER_CODE_XPERT_URL'
const DATA_ONTOLOGY_URL = 'DOCKER_DATA_ONTOLOGY_URL'

export const environment: IEnvironment = {
  version: VERSION,
  production: true,
  DEMO: false,
  deploymentTarget: DEPLOYMENT_TARGET,
  /**
   * Replace this with the actual API base URL in env file
   */
  API_BASE_URL,
  /**
   * Replace this with the actual ChatKit frame URL in env file
   */
  CHATKIT_FRAME_URL: 'DOCKER_CHATKIT_FRAME_URL',
  CODE_XPERT_URL,
  DATA_ONTOLOGY_URL,
  mcpOAuthEnabled: false,
  MCP_APP_SANDBOX_PROXY_URL: 'DOCKER_MCP_APP_SANDBOX_PROXY_URL',
  MCP_APP_SANDBOX_ALLOWED_DOMAINS: 'DOCKER_MCP_APP_SANDBOX_ALLOWED_DOMAINS'
}
