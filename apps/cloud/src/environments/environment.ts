import { IEnvironment, normalizeDeploymentTarget, VERSION } from "./types"

const API_BASE_URL = getEnvValue('VITE_API_BASE_URL') || 'http://localhost:3000'
const CHATKIT_FRAME_URL = getEnvValue('VITE_CHATKIT_FRAME_URL') || '/chatkit'
const CODE_XPERT_URL = getEnvValue('VITE_CODE_XPERT_URL', 'CODE_XPERT_URL') || 'https://code.xpertai.cn/'
const DATA_XPERT_URL = getEnvValue('VITE_DATA_XPERT_URL', 'DATA_XPERT_URL') || 'https://data.xpertai.cn/'
const RESEARCH_XPERT_URL = getEnvValue('VITE_RESEARCH_XPERT_URL', 'RESEARCH_XPERT_URL') || 'https://research.xpertai.cn/'
const DEPLOYMENT_TARGET = normalizeDeploymentTarget(getEnvValue('VITE_DEPLOYMENT_TARGET', 'DEPLOYMENT_TARGET'), 'local')

export const environment: IEnvironment = {
	version: VERSION,
	production: false,
	DEMO: false,
	deploymentTarget: DEPLOYMENT_TARGET,
	API_BASE_URL: API_BASE_URL,
	CHATKIT_FRAME_URL,
	CODE_XPERT_URL,
	DATA_XPERT_URL,
	RESEARCH_XPERT_URL,
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
