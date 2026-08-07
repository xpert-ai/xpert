import { IUser, IXpertTask } from '@xpert-ai/contracts'
import { environment as env } from '@xpert-ai/server-config'
import { LocalOutboundActorTokenProvider } from '@xpert-ai/server-core'
import { verify, type JwtPayload } from 'jsonwebtoken'
import { applyScheduledTaskOidcContext } from './scheduled-task-oidc-token'

describe('scheduled task actor token', () => {
    const originalJwtSecret = process.env.JWT_SECRET
    const originalEnvironmentJwtSecret = env.JWT_SECRET
    const originalAudience = process.env.XPERT_TASK_OIDC_TOKEN_AUDIENCE
    const originalTtl = process.env.XPERT_TASK_OIDC_TOKEN_TTL_SECONDS

    afterEach(() => {
        restoreEnv('JWT_SECRET', originalJwtSecret)
        env.JWT_SECRET = originalEnvironmentJwtSecret
        restoreEnv('XPERT_TASK_OIDC_TOKEN_AUDIENCE', originalAudience)
        restoreEnv('XPERT_TASK_OIDC_TOKEN_TTL_SECONDS', originalTtl)
    })

    it('mints a host actor token for scheduled task context', () => {
        process.env.JWT_SECRET = 'scheduled-task-actor-secret'
        env.JWT_SECRET = undefined
        process.env.XPERT_TASK_OIDC_TOKEN_AUDIENCE = 'xpert-task-api'
        process.env.XPERT_TASK_OIDC_TOKEN_TTL_SECONDS = '60'

        const task = {
            id: 'task-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'user-1',
            xpertId: 'xpert-1',
            options: {
                automationContext: {
                    source: 'data-xpert',
                    assistantCode: 'cfo-assistant',
                    businessAssistantId: 'business-assistant-1',
                    assistantId: 'assistant-runtime-1',
                    oidcClientId: 'data-x-web'
                }
            }
        } as unknown as IXpertTask
        const user = {
            id: 'user-1',
            tenantId: 'tenant-1',
            email: 'user@example.test',
            username: 'user@example.test',
            firstName: 'Ada',
            lastName: 'Lovelace',
            role: { name: 'ADMIN' }
        } as IUser

        const result = applyScheduledTaskOidcContext(task, user, {}, new LocalOutboundActorTokenProvider())
        const token = (result.context as { env?: { oidc_token?: string } }).env?.oidc_token

        expect(token).toBeTruthy()
        expect((result.context as { env?: { business_assistant_id?: string } }).env?.business_assistant_id).toBe(
            'business-assistant-1'
        )

        const payload = verify(token!, 'scheduled-task-actor-secret', {
            algorithms: ['HS256'],
            audience: 'xpert-task-api'
        }) as JwtPayload

        expect(payload.sub).toBe('user-1')
        expect(payload.typ).toBe('actor')
        expect(payload.tenant_id).toBe('tenant-1')
        expect(payload.org_id).toBe('org-1')
        expect(payload.email).toBe('user@example.test')
        expect(payload.client_id).toBe('data-x-web')
        expect(payload.roles).toEqual(['ADMIN'])
        expect(payload.act).toMatchObject({
            sub: 'xpert_task',
            task_id: 'task-1',
            xpert_id: 'xpert-1',
            automation_source: 'data-xpert',
            business_assistant_id: 'business-assistant-1',
            assistant_code: 'cfo-assistant',
            assistant_id: 'assistant-runtime-1'
        })
    })
})

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name]
        return
    }

    process.env[name] = value
}
