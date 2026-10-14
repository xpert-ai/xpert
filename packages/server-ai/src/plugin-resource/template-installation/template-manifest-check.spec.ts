import { TXpertTemplate, XpertTypeEnum, templateManifestSchema } from '@xpert-ai/contracts'
import { inspectTemplateManifest } from './template-manifest-check'
import { templateInstallationSourceHash } from './template-installation-source'

const base: TXpertTemplate = {
    id: 'test',
    name: 'test',
    title: 'Test',
    category: '',
    copyright: '',
    description: '',
    avatar: {},
    type: XpertTypeEnum.Agent,
    export_data: 'team: {type: agent}\nnodes: []\nconnections: []'
}
const files = {
    scope: 'user',
    entries: [
        {
            kind: 'file',
            path: 'notes/readme.md',
            content: 'private initial content',
            contentVersion: '1',
            policy: 'create-only'
        }
    ]
}

describe('versioned template declarations', () => {
    it('keeps templates without a manifest compatible', () => {
        expect(inspectTemplateManifest(base).readiness).toMatchObject({ legacy: true, canInstall: true })
    })
    it('projects file paths and versions without file contents', () => {
        const manifest = templateManifestSchema.parse({ schemaVersion: 1, version: '1', files })
        const result = inspectTemplateManifest({ ...base, manifest })
        expect(result.readiness).toMatchObject({
            canInstall: true,
            files: { scope: 'user', entries: [{ path: 'notes/readme.md', version: '1' }] }
        })
        expect(JSON.stringify(result.readiness)).not.toContain('private initial content')
        expect(templateInstallationSourceHash({ ...base, manifest })).not.toBe(templateInstallationSourceHash(base))
    })
    it.each(['../escape', '/etc/passwd', 'C:/file', 'a\\b', 'a//b', 'a/./b', '.apps/state', 'a\0b'])(
        'rejects unsafe path %s',
        (path) => {
            expect(
                templateManifestSchema.safeParse({
                    schemaVersion: 1,
                    version: '1',
                    files: { ...files, entries: [{ kind: 'directory', path }] }
                }).success
            ).toBe(false)
        }
    )
    it('rejects future versions, secrets, overwrite policies and duplicate paths', () => {
        for (const manifest of [
            { schemaVersion: 3, version: '1' },
            { schemaVersion: 1, version: '1', credentials: 'secret' },
            {
                schemaVersion: 1,
                version: '1',
                files: { ...files, entries: [{ ...files.entries[0], policy: 'overwrite' }] }
            },
            { schemaVersion: 1, version: '1', files: { ...files, entries: [files.entries[0], files.entries[0]] } }
        ])
            expect(templateManifestSchema.safeParse(manifest).success).toBe(false)
    })
    it('allows install before onboarding configuration', () => {
        const onboarding = { skill: 'setup', preferences: ['timezone'], completionCriteria: 'Confirmed preferences' }
        const required = templateManifestSchema.parse({ schemaVersion: 1, version: '1', onboarding })
        expect(inspectTemplateManifest({ ...base, manifest: required }).readiness.canInstall).toBe(true)
        const optional = templateManifestSchema.parse({
            schemaVersion: 1,
            version: '1',
            onboarding: { ...onboarding, required: false }
        })
        expect(inspectTemplateManifest({ ...base, manifest: optional }).readiness).toMatchObject({
            canInstall: true,
            checks: [{ required: false, status: 'pending-configuration' }]
        })
    })
    it('rejects ambiguous account selection for repeated connector providers', () => {
        const connector = { provider: 'calendar', purpose: 'Read calendars', permissions: [] }
        expect(
            templateManifestSchema.safeParse({
                schemaVersion: 2,
                version: '1',
                connectors: [
                    { ...connector, key: 'work' },
                    { ...connector, key: 'personal' }
                ]
            }).success
        ).toBe(false)
    })
    it('adapts a legacy single skill declaration without duplication', () => {
        const manifest = templateManifestSchema.parse({
            schemaVersion: 1,
            version: '1',
            skills: [{ pluginName: '@test/skills', componentKey: 'office' }]
        })
        expect(inspectTemplateManifest({ ...base, manifest }).readiness.canInstall).toBe(true)
        expect(
            inspectTemplateManifest({
                ...base,
                manifest,
                dependencies: { skills: [{ pluginName: '@test/skills', componentKey: 'office' }] }
            }).readiness.canInstall
        ).toBe(true)
    })
})
