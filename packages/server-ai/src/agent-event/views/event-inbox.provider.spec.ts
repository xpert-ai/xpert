import { randomUUID } from 'node:crypto'
import {
    AGENT_WORKBENCH_SLOT,
    EVENT_INBOX_FEATURE,
    EVENT_INBOX_VIEW_KEY,
    USER_EVENT_INBOX_SLOT,
    type XpertResolvedViewHostContext
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    normalizeManifest,
    isManifestActiveForContext
} from '../../../../server/src/view-extension/view-extension.utils'
import { EventInboxViewProvider } from './event-inbox.provider'
import { UserInboxHostDefinition } from './user-inbox-host.definition'
import type { EventInboxService } from './event-inbox.service'

jest.mock('./event-inbox.service', () => ({ EventInboxService: class {} }))
describe('Built-in Event Inbox slots', () => {
    afterEach(() => jest.restoreAllMocks())
    it('discovers one public iframe key for the personal and Assistant hosts under the real slot activation policy', () => {
        const userId = randomUUID(),
            organizationId = randomUUID(),
            tenantId = randomUUID()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const host = new UserInboxHostDefinition()
        const view = new EventInboxViewProvider({} as EventInboxService)
        const personal: XpertResolvedViewHostContext = {
            hostType: 'user',
            hostId: 'me',
            organizationId,
            tenantId,
            userId,
            slots: host.slots
        }
        const agent: XpertResolvedViewHostContext = {
            ...personal,
            hostType: 'agent',
            hostId: randomUUID(),
            slots: [
                { key: AGENT_WORKBENCH_SLOT, mode: 'sections', manifestPolicy: { requireFeatureActivation: true } }
            ],
            capabilities: { features: [EVENT_INBOX_FEATURE] }
        }
        expect(host.canRead(personal)).toBe(true)
        expect(host.resolve(userId)).toBeNull()
        for (const [context, slot] of [
            [personal, USER_EVENT_INBOX_SLOT],
            [agent, AGENT_WORKBENCH_SLOT]
        ] as const) {
            const [viewManifest] = view.getViewManifests(context, slot)
            const manifest = normalizeManifest(viewManifest, EVENT_INBOX_FEATURE, context, slot)
            expect(manifest.key).toBe(EVENT_INBOX_VIEW_KEY)
            expect(manifest.icon).toMatchObject({ type: 'svg', value: expect.stringContaining('<svg') })
            if (context.hostType === 'agent') expect(manifest.workbench?.menu?.icon).toEqual(manifest.icon)
            expect(manifest.view).toMatchObject({ type: 'remote_component', component: { entry: 'event-inbox' } })
            expect(isManifestActiveForContext(manifest, context, 'open')).toBe(true)
            expect(manifest.dataSource.cache?.enabled).toBe(false)
        }
        expect(view.getViewManifests(personal, AGENT_WORKBENCH_SLOT)).toEqual([])
        expect(view.supports({ ...personal, userId: randomUUID() })).toBe(false)
        expect(view.supports({ ...personal, organizationId: randomUUID() })).toBe(false)
        expect(host.canRead({ ...personal, hostId: randomUUID() })).toBe(false)
    })
})
