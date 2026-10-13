jest.mock('./xpert.service', () => ({ XpertService: class {} }))
jest.mock('@xpert-ai/server-core', () => ({ normalizePluginName: (value: string) => value }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'org',
        currentUserId: () => 'user'
    }
}))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { XpertService } from './xpert.service'
import { loadReservedTemplateAssistant } from './template-import-recovery'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { IXpert, TXpertTemplateSource } from '@xpert-ai/contracts'

describe('reserved template import identity', () => {
    const source: TXpertTemplateSource = { templateId: 'template', templateKey: 'template' }
    const existing: IXpert = {
        id: 'reserved',
        name: 'test',
        slug: 'test',
        type: XpertTypeEnum.Agent,
        tenantId: 'tenant',
        organizationId: 'org',
        createdById: 'user',
        workspaceId: 'workspace',
        agent: { key: 'primary' },
        options: { templateSource: source }
    }
    const findOne = jest.fn()
    const service = { repository: { findOne } } as unknown as XpertService
    it('permits a not-yet-created reserved identity', async () => {
        findOne.mockResolvedValue(null)
        expect(await loadReservedTemplateAssistant(service, 'reserved', 'workspace', source)).toBeNull()
    })
    it('recovers only an unpublished import owned by this user, scope, workspace and template', async () => {
        findOne.mockResolvedValue(existing)
        expect(await loadReservedTemplateAssistant(service, 'reserved', 'workspace', source)).toEqual(existing)
    })
    it.each([
        { tenantId: 'other' },
        { organizationId: 'other' },
        { createdById: 'other' },
        { workspaceId: 'other' },
        { options: {} },
        { publishAt: new Date() },
        { agent: null }
    ])('rejects a mismatched or published reserved Assistant', async (change) => {
        findOne.mockResolvedValue({ ...existing, ...change })
        await expect(loadReservedTemplateAssistant(service, 'reserved', 'workspace', source)).rejects.toThrow()
    })
})
