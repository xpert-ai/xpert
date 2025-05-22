import { IEnvironment } from './types'

export const environment: IEnvironment = {
  version: '3.2.9',
  production: true,
  DEMO: false,
  /**
   * Replace this with the actual API base URL in env file
   */
  API_BASE_URL: 'DOCKER_API_BASE_URL',
  IS_ELECTRON: false,
  /**
   * Replace this with the actual API base URL in env file
   */
  enableLocalAgent: 'DOCKER_ENABLE_LOCAL_AGENT'
}
