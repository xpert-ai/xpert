import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { WORKBENCH_CONTENT_DRAFT_COMMAND } from '@xpert-ai/contracts'
import { createExecutionIdentity, runWithExecutionIdentity } from '../user/execution-identity/execution-identity'
import { ViewExtensionService } from './view-extension.service'
import { ViewExtensionPermissionService } from './view-extension.permission.service'
import type { ViewHostResolution } from './host-definition.interface'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
function asActor<T>(identity: typeof actor, work: () => Promise<T>) {
	return runWithExecutionIdentity(
		createExecutionIdentity(
			{ id: identity.userId, tenantId: identity.tenantId, isActive: true },
			{ ...identity, kind: 'user' }
		),
		work
	)
}
function fixture() {
	const manifest: XpertExtensionViewManifest = {
		key: 'editor',
		title: { en_US: 'Editor' },
		hostType: 'agent',
		slot: 'main',
		source: { provider: 'drafts', plugin: 'fixture' },
		view: { type: 'raw_json' },
		dataSource: { mode: 'platform' },
		clientCommands: [{ key: WORKBENCH_CONTENT_DRAFT_COMMAND }]
	}
	const authorizeResource = jest.fn<Promise<unknown>, [XpertResolvedViewHostContext, string, string]>(
		async (_context, _view, resource) => resource
	)
	const provider = {
		supports: async () => true,
		getViewManifests: async () => [manifest],
		authorizeLocalDraftResource: authorizeResource
	}
	const canRead = jest.fn(async () => true)
	const resolution: ViewHostResolution = { context: { runtimeScope: { projectId: 'project-a' } } }
	const host = { hostType: 'agent', slots: [{ key: 'main' }], resolve: async () => resolution, canRead }
	const cache = { getOrSetSlotViews: jest.fn(), getOrSetViewData: jest.fn() }
	const service = new ViewExtensionService(
		{ get: () => provider } as never,
		{ get: () => host } as never,
		new ViewExtensionPermissionService(),
		cache as never
	)
	const read = (resource = 'resource', identity = actor, hostId = 'assistant') =>
		asActor(identity, () => service.getLocalDraftBinding('agent', hostId, 'drafts__editor', resource))
	return { service, manifest, provider, authorizeResource, canRead, resolution, cache, read }
}

it('isolates local drafts by trusted actor, Project, view host and canonical resource without caching access', async () => {
	const f = fixture(),
		first = await f.read()
	expect(await f.read()).toEqual(first)
	for (const identity of [
		{ ...actor, tenantId: 'other' },
		{ ...actor, organizationId: 'other' },
		{ ...actor, userId: 'other' }
	])
		expect((await f.read('resource', identity)).scopeKey).not.toBe(first.scopeKey)
	expect((await f.read('resource', actor, 'other-assistant')).scopeKey).not.toBe(first.scopeKey)
	expect((await f.read('other-resource')).scopeKey).not.toBe(first.scopeKey)
	f.manifest.key = 'other-editor'
	const otherView = await asActor(actor, () =>
		f.service.getLocalDraftBinding('agent', 'assistant', 'drafts__other-editor', 'resource')
	)
	expect(otherView.scopeKey).not.toBe(first.scopeKey)
	f.manifest.key = 'editor'
	f.resolution.context = { runtimeScope: { projectId: 'project-b' } }
	expect((await f.read()).scopeKey).not.toBe(first.scopeKey)
	f.resolution.context = { runtimeScope: { projectId: 'project-a' } }
	f.authorizeResource.mockResolvedValueOnce('resource')
	expect(await f.read('an-alias')).toEqual(first)
	expect(f.authorizeResource).toHaveBeenLastCalledWith(expect.objectContaining(actor), 'editor', 'an-alias')
	expect(f.cache.getOrSetSlotViews).not.toHaveBeenCalled()
	expect(f.cache.getOrSetViewData).not.toHaveBeenCalled()
})

it.each(['host', 'view', 'resource'] as const)(
	'rejects %s access revoked after an earlier successful binding',
	async (boundary) => {
		const f = fixture()
		await f.read()
		f.authorizeResource.mockClear()
		if (boundary === 'host') f.canRead.mockResolvedValue(false)
		if (boundary === 'view') f.manifest.visible = false
		if (boundary === 'resource') f.authorizeResource.mockRejectedValue(new ForbiddenException())
		await expect(f.read()).rejects.toBeInstanceOf(ForbiddenException)
		if (boundary !== 'resource') expect(f.authorizeResource).not.toHaveBeenCalled()
	}
)

it.each([false, true])(
	'requires provider authorization and an explicit draft command (authorizer missing: %s)',
	async (missingAuthorizer) => {
		const f = fixture()
		if (missingAuthorizer) Reflect.deleteProperty(f.provider, 'authorizeLocalDraftResource')
		else f.manifest.clientCommands = []
		await expect(f.read()).rejects.toBeInstanceOf(ForbiddenException)
		expect(f.authorizeResource).not.toHaveBeenCalled()
	}
)

it.each([0, 7, {}, [], null, '', '   ', 'x'.repeat(257)])(
	'rejects malformed provider resource identifiers: %p',
	async (value) => {
		const f = fixture()
		f.authorizeResource.mockResolvedValueOnce(value)
		await expect(f.read()).rejects.toBeInstanceOf(BadRequestException)
	}
)
