import { IEnvironment, VERSION } from './types'

export const environment: IEnvironment = {
  version: VERSION,
  production: false,
  DEMO: false,
  deploymentTarget: 'local',
  API_BASE_URL: 'http://localhost:3000',
  CHATKIT_FRAME_URL: '/chatkit',
  CODE_XPERT_URL: 'https://code.xpertai.cn/',
  DATA_XPERT_URL: 'https://data.xpertai.cn/',
  RESEARCH_XPERT_URL: 'https://research.xpertai.cn/',
  /**
   * @deprecated
   */
  enableLocalAgent: false
}
