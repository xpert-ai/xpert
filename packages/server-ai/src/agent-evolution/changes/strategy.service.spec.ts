import {
    FEEDBACK_LEARNING_STRATEGY,
    HUMAN_PROPOSAL_STRATEGY,
    evidenceDrivenStrategy,
    type EvolutionTargetProvider,
    type LearningEvent
} from '@xpert-ai/contracts'
import { qualifiesLearning, validateStrategy } from './strategy.service'
const capable = {
    draftBuilder: {},
    candidateBuilder: {},
    checkEvaluator: {},
    replayEvaluator: {},
    versionPublisher: {},
    releaseProvider: {},
    descriptor: { capabilities: { install: true } }
} as EvolutionTargetProvider
it('allows manual input with staged publication and learned input with direct publication independently', () => {
    expect(() =>
        validateStrategy(
            { ...HUMAN_PROPOSAL_STRATEGY, publication: { mode: 'staged_rollout', effect: 'activation' } },
            capable
        )
    ).not.toThrow()
    expect(() =>
        validateStrategy(
            { ...FEEDBACK_LEARNING_STRATEGY, publication: { mode: 'version_write', effect: 'explicit_adoption' } },
            capable
        )
    ).not.toThrow()
    expect(() =>
        validateStrategy(
            { ...HUMAN_PROPOSAL_STRATEGY, publication: { mode: 'staged_rollout', effect: 'activation' } },
            { ...capable, releaseProvider: undefined }
        )
    ).toThrow()
})
it('retains the trusted multi-subject learning gate only for strategies which require learning', () => {
    const now = Date.now()
    const event = (id: string, subjectRef: string, trustLevel: LearningEvent['trustLevel'], age = 0) =>
        ({
            eventId: id,
            subjectRef,
            trustLevel,
            eventTime: new Date(now - age * 86400000).toISOString(),
            classification: 'internal',
            redactionStatus: 'not_required'
        }) as LearningEvent
    const events = [event('1', 'a', 'L2'), event('2', 'b', 'L3'), event('3', 'b', 'L2')]
    expect(qualifiesLearning(events, FEEDBACK_LEARNING_STRATEGY, now)).toBe(true)
    expect(qualifiesLearning(events.slice(1), FEEDBACK_LEARNING_STRATEGY, now)).toBe(false)
    expect(
        qualifiesLearning(
            events.map((item) => ({ ...item, subjectRef: 'a' })),
            FEEDBACK_LEARNING_STRATEGY,
            now
        )
    ).toBe(false)
    expect(qualifiesLearning([events[0], events[1], event('3', 'b', 'L1')], FEEDBACK_LEARNING_STRATEGY, now)).toBe(
        false
    )
    expect(qualifiesLearning([events[0], events[1], event('3', 'b', 'L3', 91)], FEEDBACK_LEARNING_STRATEGY, now)).toBe(
        false
    )
    expect(
        qualifiesLearning([], evidenceDrivenStrategy({ version: '1', evidenceKinds: ['document'], requiredChecks: [] }))
    ).toBe(true)
})
it('rejects ambiguous evaluator identities instead of overwriting results', () => {
    expect(() =>
        validateStrategy(
            {
                ...FEEDBACK_LEARNING_STRATEGY,
                evaluations: [FEEDBACK_LEARNING_STRATEGY.evaluations[0], FEEDBACK_LEARNING_STRATEGY.evaluations[0]]
            },
            capable
        )
    ).toThrow()
})
