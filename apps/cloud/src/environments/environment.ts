import { getRuntimeEnv } from './runtime-env'
import { IEnvironment, VERSION } from "./types"

let API_BASE_URL = 'http://localhost:3000'
const runtimeEnv = getRuntimeEnv()

export const environment: IEnvironment = {
	version: VERSION,
	production: false,
	DEMO: false,
	API_BASE_URL: API_BASE_URL,
	CHATKIT_FRAME_URL: runtimeEnv.CHATKIT_FRAME_URL || 'https://app.xpertai.cn/chatkit',
	CHATKIT_API_URL: runtimeEnv.CHATKIT_API_URL || API_BASE_URL + '/api/ai',
	CHATKIT_API_KEY: runtimeEnv.CHATKIT_API_KEY,
	CHATKIT_XPERT_ID: runtimeEnv.CHATKIT_XPERT_ID,
	enableLocalAgent: false,

	GOOGLE_AUTH_LINK: API_BASE_URL + '/api/auth/google',
	FACEBOOK_AUTH_LINK: API_BASE_URL + '/api/auth/facebook',
	LINKEDIN_AUTH_LINK: API_BASE_URL + '/api/auth/linkedin',
	GITHUB_AUTH_LINK: API_BASE_URL + '/api/auth/github',
	TWITTER_AUTH_LINK: API_BASE_URL + '/api/auth/twitter',
	MICROSOFT_AUTH_LINK: API_BASE_URL + '/api/auth/microsoft',
	AUTH0_AUTH_LINK: API_BASE_URL + '/api/auth/auth0'
}
