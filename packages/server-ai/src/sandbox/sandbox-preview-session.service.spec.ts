import { ISandboxManagedService, SandboxManagedServiceErrorCode } from '@xpert-ai/contracts'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'
import { SANDBOX_PREVIEW_COOKIE_NAME, SandboxPreviewSessionService } from './sandbox-preview-session.service'

const serviceModel: ISandboxManagedService = {
    id: 'service-1',
    conversationId: 'conversation-1',
    provider: 'local-shell-sandbox',
    name: 'web',
    command: 'npm run dev',
    workingDirectory: '/workspace/project-1',
    status: 'running',
    transportMode: 'http',
    previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/dashboard?theme=dark'
}

function createService(overrides?: ReadonlyMap<string, string>) {
    const values = new Map<string, string>([
        ['JWT_SECRET', 'sandbox-preview-secret'],
        ['SANDBOX_PREVIEW_BASE_URL', 'https://preview.exampleusercontent.com'],
        ['CLIENT_BASE_URL', 'https://app.example.com'],
        ['API_BASE_URL', 'https://api.example.com']
    ])
    for (const [key, value] of overrides ?? []) {
        values.set(key, value)
    }

    const configService = {
        get: jest.fn((key: string) => values.get(key))
    } as unknown as ConfigService
    return new SandboxPreviewSessionService(configService)
}

function requestWithHeaders(headers: Request['headers']): Request {
    return {
        headers
    } as Request
}

function readBootstrapParameters(previewUrl: URL): URLSearchParams {
    return new URLSearchParams(previewUrl.hash.slice(1))
}

describe('SandboxPreviewSessionService', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-07-29T08:00:00.000Z'))
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('creates a short-lived bootstrap URL on the configured preview origin', () => {
        const previewSessionService = createService()

        const session = previewSessionService.createSession(serviceModel)
        const previewUrl = new URL(session.previewUrl)
        const parameters = readBootstrapParameters(previewUrl)

        expect(session.expiresAt).toBe('2026-07-29T09:00:00.000Z')
        expect(previewUrl.origin).toMatch(/^https:\/\/s-[0-9a-f]{52}\.preview\.exampleusercontent\.com$/)
        expect(previewUrl.pathname).toBe(
            '/api/sandbox/conversations/conversation-1/services/service-1/preview-bootstrap'
        )
        expect(previewUrl.search).toMatch(/^\?__xpert_preview=[0-9a-f-]+$/)
        expect(parameters.get('ticket')).toEqual(expect.any(String))
        expect(parameters.get('target')).toBe(
            '/api/sandbox/conversations/conversation-1/services/service-1/proxy/dashboard?theme=dark'
        )
    })

    it('exchanges a valid bootstrap ticket for a host-only preview cookie', () => {
        const previewSessionService = createService()
        const session = previewSessionService.createSession(serviceModel)
        const previewUrl = new URL(session.previewUrl)
        const parameters = readBootstrapParameters(previewUrl)
        const targetPath = parameters.get('target') ?? undefined

        const result = previewSessionService.bootstrapSession({
            conversationId: 'conversation-1',
            serviceId: 'service-1',
            request: requestWithHeaders({ host: previewUrl.host }),
            targetPath,
            ticket: parameters.get('ticket') ?? undefined
        })

        expect(result).toEqual({
            cookie: {
                name: SANDBOX_PREVIEW_COOKIE_NAME,
                options: {
                    httpOnly: true,
                    maxAge: 60 * 60 * 1000,
                    partitioned: true,
                    path: '/',
                    sameSite: 'none',
                    secure: true
                },
                value: expect.any(String)
            },
            redirectPath: targetPath
        })
        expect(result?.cookie?.options).not.toHaveProperty('domain')
    })

    it('authorizes only the configured preview host and matching service binding', () => {
        const previewSessionService = createService()
        const session = previewSessionService.createSession(serviceModel)
        const previewUrl = new URL(session.previewUrl)
        const parameters = readBootstrapParameters(previewUrl)
        const bootstrap = previewSessionService.bootstrapSession({
            conversationId: 'conversation-1',
            serviceId: 'service-1',
            request: requestWithHeaders({ host: previewUrl.host }),
            targetPath: parameters.get('target') ?? undefined,
            ticket: parameters.get('ticket') ?? undefined
        })
        const cookie = `${SANDBOX_PREVIEW_COOKIE_NAME}=${encodeURIComponent(bootstrap?.cookie?.value ?? '')}`

        expect(
            previewSessionService.authorizeRequest(requestWithHeaders({ cookie, host: previewUrl.host }), {
                conversationId: 'conversation-1',
                serviceId: 'service-1'
            })
        ).toBe(true)
        expect(
            previewSessionService.authorizeRequest(requestWithHeaders({ cookie, host: 'app.example.com' }), {
                conversationId: 'conversation-1',
                serviceId: 'service-1'
            })
        ).toBe(false)
        expect(
            previewSessionService.authorizeRequest(requestWithHeaders({ cookie, host: previewUrl.host }), {
                conversationId: 'conversation-1',
                serviceId: 'service-2'
            })
        ).toBe(false)
    })

    it('allows an existing preview session to reload after the bootstrap ticket expires', () => {
        const previewSessionService = createService()
        const session = previewSessionService.createSession(serviceModel)
        const previewUrl = new URL(session.previewUrl)
        const parameters = readBootstrapParameters(previewUrl)
        const targetPath = parameters.get('target') ?? undefined
        const initialBootstrap = previewSessionService.bootstrapSession({
            conversationId: 'conversation-1',
            serviceId: 'service-1',
            request: requestWithHeaders({ host: previewUrl.host }),
            targetPath,
            ticket: parameters.get('ticket') ?? undefined
        })
        jest.advanceTimersByTime(61_000)

        const reloaded = previewSessionService.bootstrapSession({
            conversationId: 'conversation-1',
            serviceId: 'service-1',
            request: requestWithHeaders({
                cookie: `${SANDBOX_PREVIEW_COOKIE_NAME}=${initialBootstrap?.cookie?.value}`,
                host: previewUrl.host
            }),
            targetPath,
            ticket: parameters.get('ticket') ?? undefined
        })

        expect(reloaded).toEqual({
            redirectPath: targetPath
        })
    })

    it('rejects host, ticket, and redirect target mismatches', () => {
        const previewSessionService = createService()
        const session = previewSessionService.createSession(serviceModel)
        const previewUrl = new URL(session.previewUrl)
        const parameters = readBootstrapParameters(previewUrl)
        const ticket = parameters.get('ticket') ?? undefined

        expect(
            previewSessionService.bootstrapSession({
                conversationId: 'conversation-1',
                serviceId: 'service-1',
                request: requestWithHeaders({ host: `${previewUrl.hostname}:8443` }),
                targetPath: parameters.get('target') ?? undefined,
                ticket
            })
        ).toBeNull()
        expect(
            previewSessionService.bootstrapSession({
                conversationId: 'conversation-1',
                serviceId: 'service-2',
                request: requestWithHeaders({ host: previewUrl.host }),
                targetPath: '/api/sandbox/conversations/conversation-1/services/service-2/proxy/',
                ticket
            })
        ).toBeNull()
        expect(
            previewSessionService.bootstrapSession({
                conversationId: 'conversation-1',
                serviceId: 'service-1',
                request: requestWithHeaders({ host: previewUrl.host }),
                targetPath: '/api/auth/me',
                ticket
            })
        ).toBeNull()
    })

    it('fails closed for public HTTP, shared hostnames, and shared cookie sites', () => {
        const publicHttp = createService(
            new Map([['SANDBOX_PREVIEW_BASE_URL', 'http://preview.exampleusercontent.com']])
        )
        const publicIp = createService(new Map([['SANDBOX_PREVIEW_BASE_URL', 'https://203.0.113.1']]))
        const sameHostname = createService(
            new Map([
                ['SANDBOX_PREVIEW_BASE_URL', 'https://app.example.com:8443'],
                ['CLIENT_BASE_URL', 'https://app.example.com']
            ])
        )
        const sameCookieSite = createService(
            new Map([
                ['SANDBOX_PREVIEW_BASE_URL', 'https://preview.example.com'],
                ['CLIENT_BASE_URL', 'https://app.example.com']
            ])
        )

        for (const previewSessionService of [publicHttp, publicIp, sameHostname, sameCookieSite]) {
            expect(() => previewSessionService.createSession(serviceModel)).toThrow(
                expect.objectContaining({
                    code: SandboxManagedServiceErrorCode.ProviderUnavailable
                })
            )
        }
    })

    it('allows an isolated loopback hostname for local development', () => {
        const previewSessionService = createService(
            new Map([
                ['SANDBOX_PREVIEW_BASE_URL', 'http://localhost:3001'],
                ['CLIENT_BASE_URL', 'http://localhost:4200'],
                ['API_BASE_URL', 'http://localhost:3000']
            ])
        )

        expect(new URL(previewSessionService.createSession(serviceModel).previewUrl).origin).toMatch(
            /^http:\/\/s-[0-9a-f]{52}\.localhost:3001$/
        )
    })

    it('uses a different browser origin for every managed service', () => {
        const previewSessionService = createService()
        const firstOrigin = new URL(previewSessionService.createSession(serviceModel).previewUrl).origin
        const secondOrigin = new URL(
            previewSessionService.createSession({
                ...serviceModel,
                id: 'service-2',
                previewUrl: '/api/sandbox/conversations/conversation-1/services/service-2/proxy/'
            }).previewUrl
        ).origin

        expect(firstOrigin).not.toBe(secondOrigin)
    })
})
