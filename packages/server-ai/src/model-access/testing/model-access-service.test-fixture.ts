import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { createModelAccessFixture } from './model-access.test-fixture'

export function queryBuilder<T>(result: T, results: T[] = []) {
    const builder = {
        leftJoinAndSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        setLock: jest.fn(),
        take: jest.fn(),
        skip: jest.fn(),
        getOne: jest.fn().mockResolvedValue(result),
        getMany: jest.fn().mockResolvedValue(results),
        getManyAndCount: jest.fn().mockResolvedValue([results, results.length])
    }
    builder.leftJoinAndSelect.mockReturnValue(builder)
    builder.where.mockReturnValue(builder)
    builder.andWhere.mockReturnValue(builder)
    builder.orderBy.mockReturnValue(builder)
    builder.setLock.mockReturnValue(builder)
    builder.take.mockReturnValue(builder)
    builder.skip.mockReturnValue(builder)
    return builder
}

export function createFixture() {
    const grantQueryBuilder = queryBuilder<unknown>(null)
    const requestQueryBuilder = queryBuilder<unknown>(null)
    const featureQueryBuilder = queryBuilder({ isEnabled: true })
    const dataSource = {
        transaction: jest.fn()
    }
    const membershipService = {
        resolveBillableUserId: jest.fn().mockResolvedValue('creator-user'),
        isMembershipAccessEnabled: jest.fn().mockResolvedValue(true),
        isMembershipPlanEnabled: jest.fn().mockResolvedValue(true),
        hasActiveMembershipPlan: jest.fn().mockResolvedValue(true),
        findModelAccess: jest.fn(),
        isModelAllowed: jest.fn(),
        resolveModelMultiplierForPlan: jest.fn().mockReturnValue(2),
        hasConsumableBalance: jest.fn().mockResolvedValue(true),
        assertCanUse: jest.fn().mockResolvedValue(undefined)
    }
    const copilotRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({
            id: 'copilot-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Primary',
            enabled: true,
            modelProvider: {
                id: 'provider-1',
                providerName: 'openai',
                isValid: true
            }
        })
    }
    const providerModelRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null)
    }
    const grantRepository = {
        createQueryBuilder: jest.fn(() => grantQueryBuilder),
        find: jest.fn().mockResolvedValue([])
    }
    const requestRepository = {
        createQueryBuilder: jest.fn(() => requestQueryBuilder)
    }
    const eventRepository = {
        find: jest.fn().mockResolvedValue([])
    }
    const publicationRepository = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((input) => ({
            id: `publication-${input.copilotModelId}`,
            createdAt: new Date('2026-07-27T00:00:00.000Z'),
            ...input
        })),
        save: jest.fn(async (input) => input)
    }
    const userRepository = {
        findOne: jest.fn().mockResolvedValue({ id: 'creator-user', type: 'user' })
    }
    const organizationRepository = {
        findOne: jest.fn().mockResolvedValue({
            id: 'default-org',
            timeZone: 'Asia/Shanghai'
        })
    }
    const providersService = {
        getProvider: jest.fn().mockReturnValue({
            getProviderModels: jest.fn().mockReturnValue([
                {
                    model: 'gpt-4.1',
                    model_type: AiModelTypeEnum.LLM,
                    label: { en_US: 'GPT-4.1', zh_Hans: 'GPT-4.1' }
                }
            ]),
            getProviderSchema: jest.fn().mockReturnValue({
                provider: 'openai',
                label: { en_US: 'OpenAI', zh_Hans: 'OpenAI' }
            })
        })
    }
    const queryBus = {
        execute: jest.fn()
    }
    const { service, lifecycle, automationCommands } = createModelAccessFixture(
        dataSource as never,
        requestRepository as never,
        grantRepository as never,
        eventRepository as never,
        publicationRepository as never,
        copilotRepository as never,
        providerModelRepository as never,
        userRepository as never,
        organizationRepository as never,
        { createQueryBuilder: jest.fn(() => featureQueryBuilder) } as never,
        queryBus as never,
        providersService as never,
        membershipService as never
    )
    jest.spyOn(lifecycle, 'processDueGrants').mockResolvedValue(0)

    const input = {
        tenantId: 'tenant-1',
        organizationId: 'runtime-org',
        userId: 'technical-runtime-user',
        xpertId: 'xpert-1',
        copilotId: 'copilot-1',
        copilotModelId: 'gpt-4.1',
        modelType: AiModelTypeEnum.LLM
    }

    return {
        automationCommands,
        lifecycle,
        featureQueryBuilder,
        copilotRepository,
        dataSource,
        eventRepository,
        grantQueryBuilder,
        grantRepository,
        input,
        membershipService,
        organizationRepository,
        publicationRepository,
        providerModelRepository,
        providersService,
        queryBus,
        requestQueryBuilder,
        service,
        userRepository
    }
}
