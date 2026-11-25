jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { AgentInvocationError } from '../../agent-invocation/invocation-errors'
import { DefaultProjectReviewEnvironment } from './default-project-review.environment'
import type { AgentTarget } from '@xpert-ai/plugin-sdk'

const target: AgentTarget = {
    bindingId: 'binding',
    provider: 'opencode',
    reference: 'runtime',
    revision: '1',
    configuration: { executionEnvironment: { type: 'computer' } }
}

it('advertises only modes admitted by the installed host environment', () => {
    const environment = new DefaultProjectReviewEnvironment()
    expect(environment.supportedModes(target)).toEqual(['evidence_only'])
    expect(environment.supportedModes({ ...target, provider: 'codex' })).toEqual([])
})
it('does not convert unavailable authority into an unsupported catalog mode', () => {
    const environment = new DefaultProjectReviewEnvironment()
    const failure = new AgentInvocationError('InvalidScope')
    jest.spyOn(environment, 'assertSupported').mockImplementation(() => {
        throw failure
    })
    expect(() => environment.supportedModes(target)).toThrow(failure)
})
