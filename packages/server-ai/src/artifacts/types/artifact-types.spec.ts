import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import {
    ArtifactTypeRegistry,
    FILE_ARTIFACT_TYPE,
    StrategyBus,
    artifactTypeKey,
    type IArtifactTypeProvider
} from '@xpert-ai/plugin-sdk'
import { CONVERSATION_SHARE_ARTIFACT_SOURCE } from '@xpert-ai/contracts'
import { ConversationArtifactPluginModule } from '../../ai/conversation-sharing/conversation-artifact-plugin.module'
import { ConversationArtifactPlugin } from '../../ai/conversation-sharing/conversation-artifact.plugin'
import { configuredArtifactPolicies } from '../testing/source-policies'
import { ArtifactTypesService } from './artifact-types.service'
import { ArtifactTypesModule } from './artifact-types.module'
import { ArtifactTypeViews } from './artifact-type-views'

@Global()
@Module({ providers: [StrategyBus, { provide: DataSource, useValue: {} }], exports: [StrategyBus, DataSource] })
class Dependencies {}
const source = {
    pluginName: '@example/reports',
    resourceType: 'report',
    resourceId: 'report-1',
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'owner'
}
const provider = (): IArtifactTypeProvider => ({
    definition: {
        kinds: ['file'],
        content: { mimeTypes: ['application/json'], maxBytes: 20 },
        sharing: {
            accessModes: ['organization_all'],
            versionModes: ['version'],
            maxTtlSeconds: 60,
            allowDownload: false,
            mutableLinks: false,
            descriptor: false,
            shareKey: 'report'
        },
        presentation: { mode: 'file' }
    },
    authorize: jest.fn(async () => {}),
    validateContent: jest.fn(async () => {})
})
function fixture() {
    const service = configuredArtifactPolicies(),
        p = provider()
    service.registry.register(artifactTypeKey(source), p, {
        kind: 'plugin',
        pluginName: source.pluginName,
        scopeKey: source.organizationId
    })
    const typed = { ...source, typeBinding: service.bind(source, source, 'file') }
    return { service, p, typed }
}
describe('Artifact types', () => {
    it('does not allow generic version uploads to bypass an application publication workflow', () => {
        const { service, p, typed } = fixture()
        service.assertVersionCreation(typed)
        p.definition.versioning = { mode: 'draft-only' }
        expect(() => service.assertVersionCreation(typed)).toThrow()
    })
    it('keeps published reads independent while applying the additional draft policy', async () => {
        const { service, p, typed } = fixture()
        p.authorizeDraft = jest.fn(async () => {
            throw new Error('DRAFT_DENIED')
        })
        const actor = { tenantId: 'tenant', userId: 'owner' }
        await service.authorize(typed, actor, 'read')
        expect(p.authorizeDraft).not.toHaveBeenCalled()
        await expect(service.authorize(typed, actor, 'read', 'draft')).rejects.toThrow('DRAFT_DENIED')
        expect(p.authorizeDraft).toHaveBeenCalledWith(typed, actor, 'read')
    })
    it('registers the conversation type and host view when its feature module joins Artifact core', async () => {
        const module = await Test.createTestingModule({
            imports: [Dependencies, ArtifactTypesModule, ConversationArtifactPluginModule]
        }).compile()
        await module.init()
        const registry = module.get(ArtifactTypeRegistry)
        const binding = registry.bind(CONVERSATION_SHARE_ARTIFACT_SOURCE, source)
        expect(binding.scopeKey).toBe('builtin:global')
        expect(registry.requireBinding(binding, source)).toBe(module.get(ConversationArtifactPlugin))
        expect(registry.requireBinding(binding, source).snapshot?.kind).toBe('host')
        expect(
            module
                .get(ArtifactTypesService)
                .describe({ ...source, ...CONVERSATION_SHARE_ARTIFACT_SOURCE, typeBinding: binding })
        ).toMatchObject({
            ...CONVERSATION_SHARE_ARTIFACT_SOURCE,
            title: { en_US: 'Shared conversation', zh_Hans: '分享会话' }
        })
        expect(
            module
                .get(ArtifactTypesService)
                .provider({ ...source, ...CONVERSATION_SHARE_ARTIFACT_SOURCE, typeBinding: binding }).definition.sharing
                ?.allowDownload
        ).toBe(false)
        const views = module.get(ArtifactTypeViews)
        expect(new URL(views.publicUrl(CONVERSATION_SHARE_ARTIFACT_SOURCE, 'Abc234Def567')).pathname).toBe(
            '/s/Abc234Def567'
        )
        const snapshot = { title: 'Shared conversation', messages: [{ role: 'human', text: 'Hello' }] }
        expect(views.read(CONVERSATION_SHARE_ARTIFACT_SOURCE, snapshot)).toEqual({ kind: 'conversation', snapshot })
        expect(() => views.read(CONVERSATION_SHARE_ARTIFACT_SOURCE, { ...snapshot, ownerId: 'private' })).toThrow()
        await module.close()
    })
    it('rejects unbound rows, missing custom types, and bypass by selecting the file type', () => {
        const { service } = fixture()
        expect(() => service.provider(source)).toThrow()
        expect(() => service.bind(source, undefined, 'file')).toThrow()
        expect(() => service.bind(source, FILE_ARTIFACT_TYPE, 'file')).toThrow()
        expect(() => service.bind(source, { ...source, resourceType: 'missing' }, 'file')).toThrow()
        expect(() => service.bind(source, source, 'html')).toThrow()
    })
    it('awaits plugin validations and retains platform content and link restrictions', async () => {
        const { service, p, typed } = fixture()
        jest.mocked(p.validateContent).mockRejectedValueOnce(new Error('invalid snapshot'))
        await expect(service.validateContent(typed, Buffer.from('{}'), 'application/json')).rejects.toThrow(
            'invalid snapshot'
        )
        await expect(service.validateContent(typed, Buffer.alloc(21), 'application/json')).rejects.toThrow()
        await expect(service.validateContent(typed, Buffer.from('{}'), 'text/html')).rejects.toThrow()
        await expect(service.assertPublication(typed, 'wrong-slot', { mode: 'organization_all' })).rejects.toThrow()
        await expect(
            service.assertLink(typed, {
                accessMode: 'public_link',
                versionMode: 'version',
                expiresAt: new Date(Date.now() + 1000),
                allowDownload: false
            })
        ).rejects.toThrow()
        await expect(
            service.assertLink(typed, {
                accessMode: 'organization_all',
                versionMode: 'version',
                expiresAt: new Date(Date.now() + 120000),
                allowDownload: false
            })
        ).rejects.toThrow()
        expect(() => service.assertDescriptor(typed)).toThrow()
        expect(() => service.assertLinkUpdate(typed)).toThrow()
    })
    it('rejects uninstall during asynchronous authorization, and still lets the owner revoke', async () => {
        const { service, p, typed } = fixture()
        jest.mocked(p.authorize).mockImplementationOnce(async () => {
            service.registry.remove(source.organizationId, source.pluginName)
        })
        await expect(service.authorize(typed, {}, 'read')).rejects.toThrow()
        await expect(
            service.authorize(typed, { tenantId: source.tenantId, userId: source.userId }, 'manage')
        ).resolves.toBeUndefined()
        await expect(
            service.authorize(typed, { tenantId: 'foreign', userId: source.userId }, 'manage')
        ).rejects.toThrow()
    })
    it('keeps type and installation immutable', () => {
        const { service, typed } = fixture()
        expect(() =>
            service.assertBindingUnchanged(typed, { ...typed.typeBinding, scopeKey: 'system:global' })
        ).toThrow()
        expect(() =>
            service.assertBindingUnchanged(typed, { ...FILE_ARTIFACT_TYPE, scopeKey: 'builtin:global' })
        ).toThrow()
    })
})
