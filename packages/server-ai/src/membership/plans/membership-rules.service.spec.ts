import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { normalizeAllowedModels } from './membership-rules'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))
import { createMembershipService, createPlan } from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'

describe('MembershipService: rules', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('maps one CNY of settled model cost to ten existing membership points', () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)

        expect(service.calculatePointsFromCny(1)).toBe(10)
        expect(service.calculatePointsFromCny(0.125)).toBe(1.25)
    })

    it('matches explicitly allowed membership models and keeps empty rules unrestricted', () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)

        expect(service.isModelAllowed(createPlan({ allowedModels: [] }), 'tongyi', 'qwen3.6-plus')).toBe(true)
        expect(
            service.isModelAllowed(
                createPlan({ allowedModels: [{ provider: 'tongyi', model: 'qwen3.6-plus' }] }),
                'tongyi',
                'qwen3.6-plus'
            )
        ).toBe(true)
        expect(
            service.isModelAllowed(
                createPlan({ allowedModels: [{ provider: 'tongyi', model: '*' }] }),
                'tongyi',
                'qwen-max'
            )
        ).toBe(true)
        expect(
            service.isModelAllowed(
                createPlan({ allowedModels: [{ provider: 'tongyi', model: 'qwen3.6-plus' }] }),
                'tongyi',
                'qwen-max'
            )
        ).toBe(false)
        const exactPlan = createPlan({
            allowedModels: [{ provider: 'tongyi', model: 'qwen3.6-plus', copilotId: 'copilot-1' }]
        })
        expect(service.isModelAllowed(exactPlan, 'tongyi', 'qwen3.6-plus', 'copilot-1')).toBe(true)
        expect(service.isModelAllowed(exactPlan, 'tongyi', 'qwen3.6-plus', 'copilot-2')).toBe(false)
    })

    it('preserves model types through plan normalization and runtime authorization', () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const allowedModels = normalizeAllowedModels([
            { provider: 'tongyi', model: '*', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
        ])
        const plan = createPlan({ allowedModels })
        expect(service.isModelAllowed(plan, 'tongyi', 'shared-name', undefined, AiModelTypeEnum.TEXT_EMBEDDING)).toBe(
            true
        )
        expect(service.isModelAllowed(plan, 'tongyi', 'shared-name', undefined, AiModelTypeEnum.LLM)).toBe(false)
        expect(service.isModelAllowed(plan, 'tongyi', 'shared-name')).toBe(false)
        expect(() => normalizeAllowedModels([{ provider: 'tongyi', model: '*', modelType: 'invalid' }])).toThrow()
    })

    it('keeps legacy allowed model rules compatible with runtime Copilot ids', () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const legacyPlan = createPlan({
            allowedModels: [{ provider: 'tongyi', model: 'qwen3.6-plus' }]
        })

        expect(service.isModelAllowed(legacyPlan, 'tongyi', 'qwen3.6-plus', 'copilot-1')).toBe(true)
        expect(service.isModelAllowed(legacyPlan, 'tongyi', 'qwen3.6-plus', 'copilot-2')).toBe(true)
    })
})
