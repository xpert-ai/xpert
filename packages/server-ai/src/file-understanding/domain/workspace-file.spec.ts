import {
    inferFileAssetWorkspaceVolumeScope,
    inferWorkspaceVolumeScope,
    resolveFileAssetWorkspaceRelativePath,
    resolveFileAssetWorkspaceVolumeScope,
    resolveWorkspaceVolumeScope
} from './workspace-file'

describe('file-understanding workspace file helpers', () => {
    it('resolves sandbox environment metadata without falling back to the xpert volume', () => {
        expect(
            resolveFileAssetWorkspaceVolumeScope(
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    xpertId: 'xpert-1',
                    metadata: {
                        workspace: {
                            catalog: 'environment',
                            scopeId: 'environment-1'
                        }
                    }
                },
                {}
            )
        ).toEqual({
            tenantId: 'tenant-1',
            catalog: 'environment',
            environmentId: 'environment-1',
            userId: 'user-1'
        })
    })

    it('resolves relative workspace paths from metadata before entity and fallback paths', () => {
        expect(
            resolveFileAssetWorkspaceRelativePath(
                {
                    workspacePath: 'entity/path.docx',
                    metadata: {
                        workspace: {
                            relativePath: 'metadata/path.docx'
                        }
                    }
                },
                'fallback/path.docx'
            )
        ).toBe('metadata/path.docx')
    })

    it('normalizes and rejects unsafe relative workspace paths', () => {
        expect(resolveFileAssetWorkspaceRelativePath(null, './files/wechat/contract.docx')).toBe(
            'files/wechat/contract.docx'
        )
        expect(resolveFileAssetWorkspaceRelativePath(null, '../contract.docx')).toBeNull()
    })

    it.each([
        ['projects', 'project-1', { catalog: 'projects', projectId: 'project-1', userId: 'user-1' }],
        ['xperts', 'xpert-1', { catalog: 'xperts', xpertId: 'xpert-1', userId: 'user-1', isolateByUser: true }],
        ['users', 'user-scope', { catalog: 'users', userId: 'user-scope' }],
        ['knowledges', 'knowledge-1', { catalog: 'knowledges', knowledgeId: 'knowledge-1', userId: 'user-1' }],
        ['skills', 'skill-root-1', { catalog: 'skills', rootId: 'skill-root-1', userId: 'user-1' }]
    ] as const)('resolves %s volume scopes from workspace metadata', (catalog, scopeId, expectedScope) => {
        expect(
            resolveFileAssetWorkspaceVolumeScope(
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    metadata: {
                        workspace: {
                            catalog,
                            scopeId,
                            isolateByUser: true
                        }
                    }
                },
                {}
            )
        ).toMatchObject({
            tenantId: 'tenant-1',
            ...expectedScope
        })
    })

    it.each([
        ['projects', 'project-1', { catalog: 'projects', projectId: 'project-1', userId: 'user-1' }],
        ['xperts', 'xpert-1', { catalog: 'xperts', xpertId: 'xpert-1', userId: 'user-1', isolateByUser: false }],
        ['users', 'user-scope', { catalog: 'users', userId: 'user-scope' }],
        ['knowledges', 'knowledge-1', { catalog: 'knowledges', knowledgeId: 'knowledge-1', userId: 'user-1' }],
        ['skills', 'skill-root-1', { catalog: 'skills', rootId: 'skill-root-1', userId: 'user-1' }]
    ] as const)('resolves %s volume scopes from generic workspace file input', (catalog, scopeId, expectedScope) => {
        expect(
            resolveWorkspaceVolumeScope({
                tenantId: 'tenant-1',
                userId: 'user-1',
                catalog,
                scopeId
            })?.volumeScope
        ).toMatchObject({
            tenantId: 'tenant-1',
            ...expectedScope
        })
    })

    it('infers project, xpert, and user scopes when workspace metadata is absent', () => {
        expect(
            inferFileAssetWorkspaceVolumeScope({ userId: 'user-1', projectId: 'project-1' }, 'tenant-1')
        ).toMatchObject({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })

        expect(inferFileAssetWorkspaceVolumeScope({ userId: 'user-1', xpertId: 'xpert-1' }, 'tenant-1')).toMatchObject({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            userId: 'user-1',
            isolateByUser: false
        })

        expect(resolveFileAssetWorkspaceVolumeScope({ userId: 'user-asset' }, { tenantId: 'tenant-1' })).toMatchObject({
            tenantId: 'tenant-1',
            catalog: 'users',
            userId: 'user-asset'
        })
    })

    it('keeps user scope inference explicit for generic resolution', () => {
        expect(resolveWorkspaceVolumeScope({ tenantId: 'tenant-1', userId: 'user-1' })).toBeNull()
        expect(inferWorkspaceVolumeScope({ userId: 'user-1' }, 'tenant-1')?.volumeScope).toMatchObject({
            tenantId: 'tenant-1',
            catalog: 'users',
            userId: 'user-1'
        })
    })
})
