import { IEnvironment, VERSION } from './types'

const API_BASE_URL = 'DOCKER_API_BASE_URL'
const DEPLOYMENT_TARGET = 'DOCKER_DEPLOYMENT_TARGET'

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
  /**
   * @deprecated
   */
  enableLocalAgent: 'DOCKER_ENABLE_LOCAL_AGENT'
}
