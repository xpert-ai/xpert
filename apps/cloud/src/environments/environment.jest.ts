import { IEnvironment, VERSION } from './types'

export const environment: IEnvironment = {
  version: VERSION,
  production: false,
  DEMO: false,
  deploymentTarget: 'local',
  API_BASE_URL: 'http://localhost:3000',
  CHATKIT_FRAME_URL: '/chatkit',
  CODE_XPERT_URL: 'https://code.xpertai.cn/',
  DATA_ONTOLOGY_URL: 'https://data.xpertai.cn/',
  mcpOAuthEnabled: false,
  MCP_APP_SANDBOX_PROXY_URL: '',
  MCP_APP_SANDBOX_ALLOWED_DOMAINS: ''
}
