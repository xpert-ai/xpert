import { createServer, type Server } from 'node:http'
import { RestClientTransport } from './rest-client.transport'
import { apiKeyHeaders } from '../provider/openapi/api-key-headers'

describe('REST transport against a real HTTP server', () => {
    let server: Server, origin: string
    const received: { path: string; authorization?: string }[] = []
    const credential = {
        auth_type: 'api_key',
        api_key_header: 'Authorization',
        api_key_header_prefix: 'bearer',
        api_key_value: 'test-only-secret'
    }
    beforeAll(async () => {
        server = createServer((request, response) => {
            received.push({ path: request.url, authorization: request.headers.authorization })
            response.setHeader('Content-Type', request.url === '/html' ? 'text/html' : 'application/json')
            if (request.url === '/redirect') {
                response.writeHead(302, { Location: origin + '/leaked' })
                response.end()
                return
            }
            if (request.url === '/error') {
                response.writeHead(500)
                response.end('private-error-body')
                return
            }
            if (request.url === '/large') {
                response.end(JSON.stringify('x'.repeat(2_500_001)))
                return
            }
            if (request.url === '/invalid') {
                response.end('not json')
                return
            }
            if (request.url === '/slow') {
                setTimeout(() => response.end('{}'), 100)
                return
            }
            response.end(JSON.stringify({ rows: [{ region: 'East', amount: '100.00' }] }))
        })
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('HTTP fixture failed')
        origin = `http://127.0.0.1:${address.port}`
    })
    afterAll(async () => {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
    })
    it('reuses API key/Bearer/Basic formats without mutating credentials or duplicating prefixes', async () => {
        for (let i = 0; i < 2; i++)
            await new RestClientTransport().request(
                { url: origin + '/data', method: 'GET', body: undefined },
                credential,
                new AbortController().signal,
                1000
            )
        expect(received.slice(-2).map((r) => r.authorization)).toEqual([
            'Bearer test-only-secret',
            'Bearer test-only-secret'
        ])
        expect(credential.api_key_value).toBe('test-only-secret')
        expect(apiKeyHeaders({ ...credential, api_key_header_prefix: 'basic' })).toEqual({
            Authorization: 'Basic test-only-secret'
        })
    })
    it('does not follow redirects or return non-JSON, oversized or failed HTTP bodies', async () => {
        const transport = new RestClientTransport()
        for (const path of ['/redirect', '/html', '/error', '/invalid', '/large'])
            await expect(
                transport.request(
                    { url: origin + path, method: 'GET', body: undefined },
                    credential,
                    new AbortController().signal,
                    1000
                )
            ).rejects.toThrow()
        expect(received.some((r) => r.path === '/leaked')).toBe(false)
    })
    it('accepts historical UI prefixes using the same saved credential without mutation', async () => {
        for (const [prefix, expected] of [
            ['bearar', 'Bearer test-only-secret'],
            ['', 'test-only-secret']
        ]) {
            const saved = Object.freeze({ ...credential, api_key_header_prefix: prefix })
            await new RestClientTransport().request(
                { url: origin + '/data', method: 'GET', body: undefined },
                saved,
                new AbortController().signal,
                1000
            )
            expect(received[received.length - 1].authorization).toBe(expected)
            expect(saved.api_key_value).toBe('test-only-secret')
        }
    })
    it('propagates parent cancellation and timeout to the socket', async () => {
        await expect(
            new RestClientTransport().request(
                { url: origin + '/slow', method: 'GET', body: undefined },
                {},
                new AbortController().signal,
                10
            )
        ).rejects.toThrow()
        const controller = new AbortController()
        controller.abort()
        await expect(
            new RestClientTransport().request(
                { url: origin + '/data', method: 'GET', body: undefined },
                {},
                controller.signal,
                1000
            )
        ).rejects.toThrow()
    })
    it('rejects invalid credential configuration and reserved authentication headers', async () => {
        const before = received.length
        for (const credentials of [
            { auth_type: 'unknown' },
            { ...credential, api_key_header: 'Host' },
            { ...credential, api_key_value: 'bad\r\nHeader: injected' }
        ])
            await expect(
                new RestClientTransport().request(
                    { url: origin + '/data', method: 'GET', body: undefined },
                    credentials,
                    new AbortController().signal,
                    1000
                )
            ).rejects.toThrow()
        expect(received.length).toBe(before)
    })
})
