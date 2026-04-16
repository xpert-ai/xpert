import { IEnvironment, VERSION } from "./types"

const API_BASE_URL = 'http://localhost:3000'
const CHATKIT_FRAME_URL = getEnvValue('VITE_CHATKIT_FRAME_URL') || '/chatkit'

export const environment: IEnvironment = {
	version: VERSION,
	production: false,
	DEMO: false,
	API_BASE_URL: API_BASE_URL,
	CHATKIT_FRAME_URL,
	/**
	 * @deprecated
	 */
	enableLocalAgent: false,
}

function getEnvValue(...keys: string[]): string | undefined {
	const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
	for (const key of keys) {
		const value = env?.[key]

		if (typeof value === 'string' && value.trim()) {
			return value.trim()
		}
	}

	return undefined
}