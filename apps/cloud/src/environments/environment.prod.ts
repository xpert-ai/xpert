import { getRuntimeEnv } from './runtime-env'
import { IEnvironment, VERSION } from './types'

const API_BASE_URL = 'DOCKER_API_BASE_URL'
const runtimeEnv = getRuntimeEnv()

export const environment: IEnvironment = {
  version: VERSION,
  production: true,
  DEMO: false,
  CHATKIT_FRAME_URL: runtimeEnv.CHATKIT_FRAME_URL || 'https://app.xpertai.cn/chatkit',
  CHATKIT_API_URL: runtimeEnv.CHATKIT_API_URL || API_BASE_URL + '/api/ai',
  CHATKIT_API_KEY: runtimeEnv.CHATKIT_API_KEY,
  CHATKIT_XPERT_ID: runtimeEnv.CHATKIT_XPERT_ID,
  /**
   * Replace this with the actual API base URL in env file
   */
  API_BASE_URL,
  /**
   * Replace this with the actual API base URL in env file
   */
  enableLocalAgent: 'DOCKER_ENABLE_LOCAL_AGENT'
}
