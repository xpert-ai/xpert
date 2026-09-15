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
