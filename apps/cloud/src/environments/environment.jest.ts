import { IEnvironment, VERSION } from './types'

export const environment: IEnvironment = {
  version: VERSION,
  production: false,
  DEMO: false,
  API_BASE_URL: 'http://localhost:3000',
  CHATKIT_FRAME_URL: '/chatkit',
  /**
   * @deprecated
   */
  enableLocalAgent: false
}
