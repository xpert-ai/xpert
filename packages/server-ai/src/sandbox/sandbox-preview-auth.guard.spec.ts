import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { SandboxPreviewAuthGuard } from './sandbox-preview-auth.guard'
import { SandboxPreviewSessionService } from './sandbox-preview-session.service'

function createContext() {
    const request = {
        headers: {
            cookie: 'xpert_sandbox_preview=session-token',
            host: 'preview.exampleusercontent.com'
        },
        params: {
            conversationId: 'conversation-1',
            serviceId: 'service-1'
        }
    }
    const context = {
        switchToHttp: () => ({
            getRequest: () => request
        })
    } as unknown as ExecutionContext

    return {
        context,
        request
    }
}

describe('SandboxPreviewAuthGuard', () => {
    it('allows a request authorized for the preview host and service binding', () => {
        const previewSessionService = {
            authorizeRequest: jest.fn(() => true)
        } as unknown as SandboxPreviewSessionService
        const guard = new SandboxPreviewAuthGuard(previewSessionService)
        const { context, request } = createContext()

        expect(guard.canActivate(context)).toBe(true)
        expect(previewSessionService.authorizeRequest).toHaveBeenCalledWith(request, {
            conversationId: 'conversation-1',
            serviceId: 'service-1'
        })
    })

    it('rejects a request that is not authorized for the preview host and binding', () => {
        const previewSessionService = {
            authorizeRequest: jest.fn(() => false)
        } as unknown as SandboxPreviewSessionService
        const guard = new SandboxPreviewAuthGuard(previewSessionService)
        const { context } = createContext()

        expect(() => guard.canActivate(context)).toThrow(UnauthorizedException)
    })
})
