jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import type { AgentInvocationScope, AgentTarget } from '@xpert-ai/plugin-sdk'
import { ProjectReviewModule } from './project-review.module'
import { ProjectReviewEnvironment } from './project-review.environment'
import { DefaultProjectReviewEnvironment } from './default-project-review.environment'

const target: AgentTarget = { bindingId: 'binding', provider: 'opencode', reference: 'reviewer', revision: '1',
    configuration: { executionEnvironment: { type: 'computer' } } }
const scope: AgentInvocationScope = { tenantId: 'tenant', organizationId: 'org', userId: 'user',
    parentExecutionId: 'parent', callerAgentKey: 'leader', projectId: 'project', conversationId: 'conversation' }

describe('Default Project review environment wiring', () => {
    it('exports the OS adapter and preserves existing evidence-only admission', async () => {
        const module = await Test.createTestingModule({ imports: [ProjectReviewModule] }).compile()
        try {
            const environment = module.get(ProjectReviewEnvironment)
            expect(environment).toBeInstanceOf(DefaultProjectReviewEnvironment)
            expect(() => environment.assertSupported(target, 'evidence_only')).not.toThrow()
        } finally { await module.close() }
    })

    it('fails module initialization if the required environment provider is absent', async () => {
        // Consumers receive a required constructor dependency, never an optional service lookup.
        const module = Test.createTestingModule({ providers: [{ provide: 'consumer',
            inject: [ProjectReviewEnvironment], useFactory: (environment: ProjectReviewEnvironment) => environment }] })
        await expect(module.compile()).rejects.toThrow()
    })

    it('does not let target configuration enable an unavailable execution verifier', async () => {
        const environment = new DefaultProjectReviewEnvironment()
        expect(() => environment.assertSupported({ ...target,
            configuration: { ...target.configuration, reviewModes: ['execution'] } }, 'execution'))
            .toThrow(expect.objectContaining({ code: 'Unsupported' }))
        expect(() => environment.executionInstructions()).toThrow(expect.objectContaining({ code: 'Unsupported' }))
        await expect(environment.verify(scope, 'review')).rejects.toMatchObject({ code: 'Unsupported' })
    })

    it.each([
        { ...target, provider: 'unconfined' },
        { ...target, configuration: { executionEnvironment: { type: 'sandbox' } } }
    ])('rejects evidence-only targets without the existing confinement: %j', (unsupported) => {
        expect(() => new DefaultProjectReviewEnvironment().assertSupported(unsupported, 'evidence_only'))
            .toThrow(expect.objectContaining({ code: 'Unsupported' }))
    })
})
