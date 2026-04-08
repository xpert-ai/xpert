import { IEnvironment, VERSION } from './types'

const API_BASE_URL = 'DOCKER_API_BASE_URL'

export const environment: IEnvironment = {
  version: VERSION,
  production: true,
  DEMO: false,
  /**
   * Replace this with the actual API base URL in env file
   */
  API_BASE_URL,
  /**
   * Replace this with the actual ChatKit frame URL in env file
   */
  CHATKIT_FRAME_URL: '/chatkit',
  /**
   * Replace this with the actual API base URL in env file
   */
  enableLocalAgent: 'DOCKER_ENABLE_LOCAL_AGENT'
}
