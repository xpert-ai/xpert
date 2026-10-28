import pino from 'pino'
import { HTTP_LOG_REDACTION } from './pino-redaction'

function logRequest(req: object): string {
	let output = ''
	const logger = pino(
		{ redact: HTTP_LOG_REDACTION },
		{
			write: (chunk: string) => {
				output += chunk
			}
		}
	)
	logger.info({ req }, 'request completed')
	return output
}

describe('HTTP credential log redaction', () => {
	it('redacts share bearer tokens from URL paths, parameters and referrers', () => {
		const secret = 'Abc234Def567'
		const url = `/api/ai/shared-conversations/${secret}/authenticated`
		const output = logRequest({
			url,
			originalUrl: url,
			params: { token: secret, path: ['ai', 'shared-conversations', secret, 'authenticated'] },
			headers: { referer: `https://app.example/s/${secret}` }
		})
		expect(output).not.toContain(secret)
		expect(JSON.parse(output).req.url).toBe('/api/ai/shared-conversations/[Redacted]/authenticated')
	})
	it('redacts Artifact content slugs and route parameters', () => {
		const secret = 'Abc234Def567'
		for (const prefix of [
			'/api/artifacts/share/',
			'/artifacts/share/',
			'/api/artifacts/shared-links/',
			'/artifacts/snapshot/',
			'/artifacts/view/'
		]) {
			const output = logRequest({ url: `${prefix}${secret}`, params: { artifactLinkSlug: secret, slug: secret } })
			expect(output).not.toContain(secret)
			expect(JSON.parse(output).req.url).toBe(`${prefix}[Redacted]`)
		}
	})
	it('redacts lease tokens from URLs and parsed queries without changing the live request', () => {
		const url = '/api/ai/mcp-apps/app-1/resource?messageId=message%2F1&token=fake-lease&view=map+list'
		const req = { url, originalUrl: url, query: { messageId: 'message/1', token: 'fake-lease' } }
		const output = logRequest(req)
		expect(output).not.toContain('fake-lease')
		expect(JSON.parse(output).req).toEqual({
			url: '/api/ai/mcp-apps/app-1/resource?messageId=message%2F1&token=[Redacted]&view=map+list',
			originalUrl: '/api/ai/mcp-apps/app-1/resource?messageId=message%2F1&token=[Redacted]&view=map+list',
			query: { messageId: 'message/1', token: '[Redacted]' }
		})
		expect(req.url).toBe(url)
		expect(req.originalUrl).toBe(url)
		expect(req.query.token).toBe('fake-lease')
	})

	it('redacts repeated and encoded credential parameter names while preserving URL spelling', () => {
		const output = logRequest({
			url: '/api/ai/mcp-apps/app-1/resource?%74oken=fake-first&token=fake-second&accessToken=fake-access&refreshToken=fake-refresh&query=a%20b%2Bc&bad%ZZ=x#result',
			query: { token: ['fake-first', 'fake-second'], accessToken: 'fake-access', refreshToken: 'fake-refresh' }
		})
		expect(output).not.toContain('fake-')
		expect(JSON.parse(output).req).toEqual({
			url: '/api/ai/mcp-apps/app-1/resource?%74oken=[Redacted]&token=[Redacted]&accessToken=[Redacted]&refreshToken=[Redacted]&query=a%20b%2Bc&bad%ZZ=x#result',
			query: { token: '[Redacted]', accessToken: '[Redacted]', refreshToken: '[Redacted]' }
		})
	})

	it('preserves existing header/body protections and URLs without credentials', () => {
		const url = '/api/ai/mcp-apps/app-1/history?messageId=message%2F1'
		const output = logRequest({
			url,
			headers: { authorization: 'fake-auth', cookie: 'fake-cookie', 'x-api-key': 'fake-key' },
			body: {
				password: 'fake-password',
				token: 'fake-token',
				accessToken: 'fake-access',
				refreshToken: 'fake-refresh'
			}
		})
		expect(output).not.toContain('fake-')
		expect(JSON.parse(output).req.url).toBe(url)
		expect(JSON.parse(logRequest({ url: '/api/health' })).req.url).toBe('/api/health')
	})
})
