import { UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ArtifactsPublicController, ArtifactsShareSessionController } from './artifacts.controller'

describe('Artifact share controllers', () => {
    it('serves interactive HTML directly with an opaque sandbox and no network capability', async () => {
        const service = {
            resolveAccessContextFromRequest: jest.fn(async () => ({ principal: {} })),
            resolveForPublicAccess: jest.fn(async () => ({
                link: {},
                artifact: {},
                version: {},
                buffer: Buffer.from('<!doctype html><script>viewer()</script>'),
                mimeType: 'text/html',
                fileName: 'viewer.html',
                disposition: 'inline',
                safeHtmlProfile: 'interactive'
            })),
            summarizeRequest: jest.fn(() => ({}))
        }
        const response = responseFixture()
        const controller = new ArtifactsPublicController(service as never)

        await controller.open('share-slug', '', requestFixture(), response.value)

        const csp = response.headers.get('Content-Security-Policy')
        expect(response.send).toHaveBeenCalledWith(expect.any(Buffer))
        expect(response.redirect).not.toHaveBeenCalled()
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(csp).toContain('sandbox allow-scripts')
        expect(csp).not.toContain('allow-same-origin')
        expect(csp).toContain("script-src 'unsafe-inline'")
        expect(csp).toContain("connect-src 'none'")
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("form-action 'none'")
        expect(csp).toContain("base-uri 'none'")
        expect(csp).toContain("frame-src 'none'")
    })

    it('redirects an unauthenticated private share to the auth handshake without rendering content', async () => {
        const service = {
            resolveAccessContextFromRequest: jest.fn(async () => ({ principal: {} })),
            resolveForPublicAccess: jest.fn(async () => {
                throw new UnauthorizedException('Login is required')
            }),
            summarizeRequest: jest.fn(() => ({}))
        }
        const response = responseFixture()
        const controller = new ArtifactsPublicController(service as never)

        await controller.open('private-slug', '', requestFixture(), response.value)

        expect(response.redirect).toHaveBeenCalledWith(302, '/artifacts/auth/private-slug')
        expect(response.send).not.toHaveBeenCalled()
    })

    it('serves strict HTML with scripts disabled', async () => {
        const service = {
            resolveAccessContextFromRequest: jest.fn(async () => ({ principal: {} })),
            resolveForPublicAccess: jest.fn(async () => ({
                link: {},
                artifact: {},
                version: {},
                buffer: Buffer.from('<!doctype html><p>strict</p>'),
                mimeType: 'text/html',
                fileName: 'strict.html',
                disposition: 'inline',
                safeHtmlProfile: 'strict'
            })),
            summarizeRequest: jest.fn(() => ({}))
        }
        const response = responseFixture()

        await new ArtifactsPublicController(service as never).open('strict-slug', '', requestFixture(), response.value)

        const csp = response.headers.get('Content-Security-Policy')
        expect(csp).toContain('sandbox')
        expect(csp).not.toContain('allow-scripts')
        expect(csp).not.toContain('script-src')
    })

    it('sets a short-lived HttpOnly share-only cookie and returns the fixed URL', async () => {
        const service = {
            createArtifactShareSession: jest.fn(async () => ({
                token: 'view-token',
                publicUrl: '/artifacts/share/private-slug'
            })),
            summarizeRequest: jest.fn(() => ({}))
        }
        const response = responseFixture()
        const controller = new ArtifactsShareSessionController(service as never)

        const result = await controller.create('private-slug', requestFixture(), response.value)

        expect(result).toEqual({ publicUrl: '/artifacts/share/private-slug' })
        expect(response.cookie).toHaveBeenCalledWith(
            'xpert_artifact_share_session',
            'view-token',
            expect.objectContaining({
                httpOnly: true,
                sameSite: 'lax',
                path: '/artifacts/share',
                maxAge: 15 * 60 * 1000
            })
        )
    })

    it('clears only the Artifact share-session cookie on logout', () => {
        const response = responseFixture()
        const controller = new ArtifactsShareSessionController({} as never)

        expect(controller.clear(requestFixture(), response.value)).toEqual({ cleared: true })
        expect(response.clearCookie).toHaveBeenCalledWith(
            'xpert_artifact_share_session',
            expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/artifacts/share' })
        )
    })
})

function requestFixture() {
    return {
        headers: {},
        secure: false,
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' }
    } as unknown as Request
}

function responseFixture() {
    const headers = new Map<string, string>()
    const send = jest.fn()
    const redirect = jest.fn()
    const cookie = jest.fn()
    const clearCookie = jest.fn()
    return {
        headers,
        send,
        redirect,
        cookie,
        clearCookie,
        value: {
            setHeader(name: string, value: string) {
                headers.set(name, value)
            },
            send,
            redirect,
            cookie,
            clearCookie
        } as unknown as Response
    }
}
