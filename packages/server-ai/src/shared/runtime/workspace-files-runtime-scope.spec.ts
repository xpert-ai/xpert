import { applyRuntimeScopeDefaults } from './workspace-files-runtime-scope'
import type { WorkspaceFileScope } from '@xpert-ai/plugin-sdk'

describe('personal Workspace Files runtime boundary', () => {
    const defaults: WorkspaceFileScope = {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        catalog: 'users',
        scopeId: 'user-1',
        isolateByUser: false
    }

    it('retains the authenticated owner when writing and replaying a portable reference', () => {
        const input = { filePath: 'files/cut/output.mp4' }
        const reference = applyRuntimeScopeDefaults<WorkspaceFileScope & { filePath: string }>(input, defaults)
        expect(reference).toEqual({ ...input, ...defaults })
        expect(applyRuntimeScopeDefaults(reference, defaults)).toEqual(reference)
        expect(input).toEqual({ filePath: 'files/cut/output.mp4' })
    })

    it.each<WorkspaceFileScope>([
        { tenantId: 'other-tenant' },
        { organizationId: 'other-org' },
        { userId: 'other-user' },
        { scopeId: 'other-user' },
        { catalog: 'projects' },
        { projectId: 'cut-business-project' },
        { xpertId: 'other-assistant' },
        { rootId: 'another-root' },
        { knowledgeId: 'another-knowledge' },
        { isolateByUser: true }
    ])('rejects a reference that changes host authority: %j', (input) => {
        expect(() => applyRuntimeScopeDefaults(input, defaults)).toThrow()
    })

    it('rejects a personal facade with inconsistent authority', () => {
        expect(() => applyRuntimeScopeDefaults({}, { ...defaults, userId: undefined })).toThrow()
        expect(() => applyRuntimeScopeDefaults({}, { ...defaults, scopeId: 'other-user' })).toThrow()
    })
})

describe('shared Project portable references', () => {
    const defaults: WorkspaceFileScope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'editor',
        projectId: 'project'
    }
    it('binds file paths and version snapshots to the same Project on portable replay', () => {
        for (const filePath of ['docs/page.md', '.space-history/item/version/page.md']) {
            const reference = applyRuntimeScopeDefaults<WorkspaceFileScope & { filePath: string }>(
                { filePath },
                defaults
            )
            expect(reference).toMatchObject({ ...defaults, catalog: 'projects', scopeId: 'project', filePath })
            expect(applyRuntimeScopeDefaults(reference, defaults)).toEqual(reference)
        }
    })
    it('retains the file storage identity while constraining the Project', () => {
        expect(
            applyRuntimeScopeDefaults({ catalog: 'projects', projectId: 'project', userId: 'owner' }, defaults)
        ).toMatchObject({ catalog: 'projects', projectId: 'project', userId: 'owner', scopeId: 'project' })
    })
    it.each<WorkspaceFileScope>([
        { catalog: 'projects', projectId: 'other', userId: 'owner' },
        { catalog: 'users', userId: 'owner' },
        { catalog: 'projects', tenantId: 'other', userId: 'owner' },
        { catalog: 'projects', organizationId: 'other', userId: 'owner' }
    ])('does not permit authority changes through a shared reference: %j', (input) => {
        expect(() => applyRuntimeScopeDefaults(input, defaults)).toThrow()
    })
})
