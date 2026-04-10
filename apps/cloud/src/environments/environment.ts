import { IEnvironment, VERSION } from "./types"

const API_BASE_URL = 'http://localhost:3000'

export const environment: IEnvironment = {
	version: VERSION,
	production: false,
	DEMO: false,
	API_BASE_URL: API_BASE_URL,
	CHATKIT_FRAME_URL: '/chatkit',
	enableLocalAgent: false,
}
