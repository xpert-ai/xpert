import {
    appPlatformDefinitionSchema,
    appPlatformEnvironmentSchema,
    AppPlatformConfiguration,
    MembershipLedgerSourceEnum,
    MembershipRenewalModeEnum,
    MembershipStatusEnum
} from '@xpert-ai/contracts'
import { getConfig } from '@xpert-ai/server-config'
import { EntityManager } from 'typeorm'
import { AppPlatformDelivery } from '../../plugin-resource/app-platform/app-platform-delivery.entity'
import {
    createMembership,
    createPlan,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'

jest.mock('../../xpert/xpert.entity', () => ({ Xpert: class Xpert {} }))
jest.mock('@xpert-ai/server-config', () => ({
    ...jest.requireActual('@xpert-ai/server-config'),
    getConfig: jest.fn(jest.requireActual('@xpert-ai/server-config').getConfig)
}))

const originalConfig = getConfig()
const configuration: AppPlatformConfiguration = {
    definition: appPlatformDefinitionSchema.parse({
        schemaVersion: 1,
        key: 'platform',
        version: 1,
        branding: { name: 'Test' },
        registration: { role: 'APP_USER', organization: 'per-account' },
        apps: [
            {
                key: 'main',
                appRef: { pluginName: '@test/app', appName: 'app' },
                required: true,
                configurationRef: 'default'
            }
        ],
        experience: { home: 'main', navigation: ['main'] },
        entitlements: { defaultPlanRef: 'trial' }
    }),
    environment: appPlatformEnvironmentSchema.parse({
        schemaVersion: 1,
        configurations: { default: { primary: { provider: 'provider', model: 'model' } } },
        plans: {
            trial: { trialDays: 7, creditLimit: 120, maxProjects: 10, maxUploadBytes: 1000, maxConcurrentRuns: 2 }
        }
    }),
    digest: 'a'.repeat(64)
}

describe('managed application trial membership issuance', () => {
    beforeEach(() => jest.mocked(getConfig).mockReturnValue({ ...originalConfig, appPlatform: configuration }))
    afterEach(() => jest.mocked(getConfig).mockReturnValue(originalConfig))

    function fixture(emailVerified = true, enrolled = true) {
        const f = createScopeInitializationHarness()
        f.plans.push(createPlan({ id: 'plan-default', includedPoints: 1000 }))
        const user = f.userRepository.findOne.getMockImplementation()
        f.userRepository.findOne.mockImplementation(async (options) => ({ ...(await user(options)), emailVerified }))
        const delivery = {
            findOneBy: jest.fn().mockResolvedValue(enrolled ? { configuration: structuredClone(configuration) } : null)
        }
        const input = { tenantId: 'tenant-1', userId: 'trial-user' }
        const grant = () =>
            f.dataSource.transaction(async (manager: EntityManager) => {
                const original = manager.getRepository.bind(manager)
                manager.getRepository = (entity) =>
                    entity === AppPlatformDelivery ? (delivery as never) : original(entity)
                return f.service.ensureTenantDefaultMembership(input, manager)
            })
        return { ...f, delivery, grant, input }
    }

    it('does not grant points before email verification', async () => {
        const f = fixture(false)
        await expect(f.grant()).resolves.toBeNull()
        expect(f.memberships).toHaveLength(0)
        expect(f.ledgers).toHaveLength(0)
    })

    it('uses the enrolled snapshot for duration and points, without automatic renewal', async () => {
        const f = fixture()
        const changed = structuredClone(configuration)
        changed.environment.plans.trial.creditLimit = 900
        changed.environment.plans.trial.trialDays = 30
        jest.mocked(getConfig).mockReturnValue({ ...originalConfig, appPlatform: changed })
        const membership = await f.grant()
        expect(membership).toMatchObject({
            userId: 'trial-user',
            organizationId: null,
            pointsGranted: 120,
            pointsUsed: 0,
            renewalMode: MembershipRenewalModeEnum.Manual
        })
        expect(membership.currentPeriodEnd.getTime() - membership.currentPeriodStart.getTime()).toBe(7 * 86_400_000)
        expect(f.ledgers).toEqual([
            expect.objectContaining({ source: MembershipLedgerSourceEnum.Grant, pointsDelta: 120 })
        ])
        expect(f.delivery.findOneBy).toHaveBeenCalledWith({ ...f.input, platformKey: 'platform' })
    })

    it('grants once under concurrent retries and preserves consumed points on later requests', async () => {
        const f = fixture()
        const results = await Promise.all([f.grant(), f.grant()])
        expect(results[0].id).toBe(results[1].id)
        expect(f.memberships).toHaveLength(1)
        expect(f.ledgers).toHaveLength(1)
        f.memberships[0].pointsUsed = 40
        await expect(f.grant()).resolves.toMatchObject({ pointsUsed: 40, pointsGranted: 120 })
        expect(f.ledgers).toHaveLength(1)
    })

    it('does not issue another trial after the membership expires', async () => {
        const f = fixture()
        f.memberships.push(
            createMembership({ organizationId: null, userId: f.input.userId, status: MembershipStatusEnum.Expired })
        )
        await expect(f.grant()).resolves.toBeNull()
        expect(f.delivery.findOneBy).not.toHaveBeenCalled()
        expect(f.ledgers).toHaveLength(0)
    })

    it('preserves the ordinary default grant for accounts without enrollment', async () => {
        const f = fixture(false, false)
        await expect(f.grant()).resolves.toMatchObject({
            pointsGranted: 1000,
            renewalMode: MembershipRenewalModeEnum.Auto
        })
    })

    it('does not query enrollment when managed applications are disabled', async () => {
        const f = fixture()
        jest.mocked(getConfig).mockReturnValue({ ...originalConfig, appPlatform: null })
        await expect(f.grant()).resolves.toMatchObject({
            pointsGranted: 1000,
            renewalMode: MembershipRenewalModeEnum.Auto
        })
        expect(f.delivery.findOneBy).not.toHaveBeenCalled()
    })
})
