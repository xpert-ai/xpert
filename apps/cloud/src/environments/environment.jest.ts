import { IEnvironment, VERSION } from './types'

export const environment: IEnvironment = {
  version: VERSION,
  production: false,
  DEMO: false,
  deploymentTarget: 'local',
  API_BASE_URL: 'http://localhost:3000',
  CHATKIT_FRAME_URL: '/chatkit',
  CODE_XPERT_URL: 'https://code.xpertai.cn/',
  DATA_ONTOLOGY_URL: 'https://data.xpertai.cn/',const DEPLOYMENT_TARGET = 'DOCKER_DEPLOYMENT_TARGET'
const CODE_XPERT_URL = 'DOCKER_CODE_XPERT_URL'
const DATA_ONTOLOGY_URL = 'DOCKER_DATA_ONTOLOGY_URL'CHATKIT_FRAME_URL: 'DOCKER_CHATKIT_FRAME_URL',
  CODE_XPERT_URL,
  DATA_ONTOLOGY_URL,
  mcpOAuthEnabled: false,
  MCP_APP_SANDBOX_PROXY_URL: '',
  MCP_APP_SANDBOX_ALLOWED_DOMAINS: ''
}
