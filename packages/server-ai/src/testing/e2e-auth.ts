import axios from 'axios'

export type E2EAuthConfig = {
	apiBaseUrl?: string
	authEmail?: string
	authPassword?: string
	authToken?: string
}

export const getE2EAuthConfig = (): Required<Omit<E2EAuthConfig, 'authToken'>> & Pick<E2EAuthConfig, 'authToken'> => ({
	apiBaseUrl: process.env.E2E_API_URL || 'http://localhost:3000/api',
	authEmail: process.env.E2E_AUTH_EMAIL || 'admin@xpertai.cn',
	authPassword: process.env.E2E_AUTH_PASSWORD || 'admin',
	authToken: process.env.E2E_AUTH_TOKEN
})

const formatAuthError = (error: unknown) => {
	if (!axios.isAxiosError(error)) {
		return String(error)
	}
	const status = error.response?.status
	const data = error.response?.data
	const detail = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : error.message
	return `${status ?? 'unknown'} ${detail}`
}

export const resolveE2EAuthToken = async (config: E2EAuthConfig = {}) => {
	const defaults = getE2EAuthConfig()
	const resolved = {
		apiBaseUrl: config.apiBaseUrl ?? defaults.apiBaseUrl,
		authEmail: config.authEmail ?? defaults.authEmail,
		authPassword: config.authPassword ?? defaults.authPassword,
		authToken: config.authToken ?? defaults.authToken
	}

	if (resolved.authToken?.trim()) {
		return resolved.authToken
	}

	try {
		const response = await axios.post(`${resolved.apiBaseUrl}/auth/login`, {
			email: resolved.authEmail,
			password: resolved.authPassword
		})
		const token = response.data?.token
		if (!token) {
			throw new Error('Missing token in auth response')
		}
		return token as string
	} catch (error) {
		console.error('Authentication error:', error)
		throw new Error(`Failed to authenticate against ${resolved.apiBaseUrl}: ${formatAuthError(error)}`)
	}
}
