import { Test } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ViewExtensionService } from '@xpert-ai/server-core'
import { PublishedXpertAccessService } from '../../published-xpert-access.service'
import { XpertProjectAccessService } from '../../../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../../../xpert-project/services/project-xpert-binding.service'
import { AssistantWorkbenchEntryHandler, AssistantWorkbenchEntryQuery } from './assistant-workbench-entry.query'

describe('Assistant Workbench entry authorization', () => {
    const published = { getAccessiblePublishedXpert: jest.fn() }
    const projects = { assertCanUseXpert: jest.fn() }
    const bindings = { resolveCurrentById: jest.fn() }
    const views = { listSlotViews: jest.fn() }
    let handler: AssistantWorkbenchEntryHandler
    beforeEach(async () => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        published.getAccessiblePublishedXpert.mockResolvedValue({ id: 'canonical', name: 'Assistant' })
        bindings.resolveCurrentById.mockResolvedValue({ id: 'canonical', name: 'Assistant' })
        projects.assertCanUseXpert.mockResolvedValue({})
        views.listSlotViews.mockResolvedValue([{ key: 'orders__review' }, { key: 'audit__timeline' }])
        const module = await Test.createTestingModule({
            providers: [
                AssistantWorkbenchEntryHandler,
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: XpertProjectAccessService, useValue: projects },
                { provide: XpertProjectXpertBindingService, useValue: bindings },
                { provide: ViewExtensionService, useValue: views }
            ]
        }).compile()
        handler = module.get(AssistantWorkbenchEntryHandler)
    })
    afterEach(() => jest.restoreAllMocks())
    it.each(['orders__review', 'audit__timeline'])(
        'resolves a declared non-Project View %s without business-specific routing',
        async (viewKey) => {
            const view = { viewKey, selectionId: 'item', parameters: { section: 'evidence', page: 2 } }
            expect(
                await handler.execute(new AssistantWorkbenchEntryQuery('source', { projectId: null, ...view }))
            ).toEqual({
                assistant: { id: 'canonical', name: 'Assistant' },
                projectId: null,
                organizationId: 'org',
                view
            })
            expect(published.getAccessiblePublishedXpert).toHaveBeenCalledWith('source')
            expect(projects.assertCanUseXpert).not.toHaveBeenCalled()
            expect(views.listSlotViews).toHaveBeenCalledWith('agent', 'canonical', 'agent.workbench', {
                runtimeScope: { projectId: null }
            })
        }
    )
    it('keeps exact Project authorization separate from catalog visibility and rechecks canonical aliases', async () => {
        await handler.execute(
            new AssistantWorkbenchEntryQuery('source', { projectId: 'project', viewKey: 'audit__timeline' })
        )
        expect(projects.assertCanUseXpert.mock.calls).toEqual([
            ['project', 'source'],
            ['project', 'canonical']
        ])
        expect(bindings.resolveCurrentById).toHaveBeenCalledWith('source', {
            tenantId: 'tenant',
            organizationId: 'org'
        })
        expect(published.getAccessiblePublishedXpert).not.toHaveBeenCalled()
        expect(views.listSlotViews).toHaveBeenCalledWith('agent', 'canonical', 'agent.workbench', {
            runtimeScope: { projectId: 'project' }
        })
    })
    it('retains tenant scope and rejects revoked runtime access before loading View metadata', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        expect(
            await handler.execute(
                new AssistantWorkbenchEntryQuery('source', { projectId: null, viewKey: 'audit__timeline' })
            )
        ).toMatchObject({ organizationId: null })
        views.listSlotViews.mockClear()
        published.getAccessiblePublishedXpert.mockRejectedValue(new ForbiddenException())
        await expect(
            handler.execute(new AssistantWorkbenchEntryQuery('source', { projectId: null, viewKey: 'audit__timeline' }))
        ).rejects.toThrow(ForbiddenException)
        expect(views.listSlotViews).not.toHaveBeenCalled()
    })
    it('rejects missing, hidden, inactive or ambiguous short View keys without enabling a feature', async () => {
        for (const available of [[], [{ key: 'orders__review', visible: false }], [{ key: 'other__review' }]]) {
            views.listSlotViews.mockResolvedValue(available)
            await expect(
                handler.execute(
                    new AssistantWorkbenchEntryQuery('source', { projectId: null, viewKey: 'orders__review' })
                )
            ).rejects.toMatchObject({ status: 404 })
        }
        views.listSlotViews.mockResolvedValue([{ key: 'orders__review' }])
        await expect(
            handler.execute(new AssistantWorkbenchEntryQuery('source', { projectId: null, viewKey: 'review' }))
        ).rejects.toMatchObject({ status: 404 })
        projects.assertCanUseXpert.mockRejectedValue(new ForbiddenException())
        bindings.resolveCurrentById.mockClear()
        await expect(
            handler.execute(
                new AssistantWorkbenchEntryQuery('source', { projectId: 'foreign', viewKey: 'orders__review' })
            )
        ).rejects.toThrow(ForbiddenException)
        expect(bindings.resolveCurrentById).not.toHaveBeenCalled()
    })
})
