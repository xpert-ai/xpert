import { getXpertFileMemoryVolumeScope } from './xpert-memory-volume'
import { getXpertFileMemoryWorkspacePath } from '../../plugins/file-memory/paths'

describe('Memory volume selection', () => {
    it('resolves a single xpert-level memory volume scope', () => {
        expect(getXpertFileMemoryVolumeScope('tenant-1', 'xpert-1')).toEqual({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            isolateByUser: false
        })
    })

    it('resolves user-isolated file memory to the exact user-xpert volume', () => {
        expect(getXpertFileMemoryVolumeScope('tenant-1', 'xpert-1', 'user-1', 'user')).toEqual({
            tenantId: 'tenant-1',
            catalog: 'user-xperts',
            userId: 'user-1',
            xpertId: 'xpert-1'
        })
    })

    it('isolates Assistant memory in the project metadata directory', () => {
        expect(getXpertFileMemoryVolumeScope('tenant-1', 'xpert-1', 'user-1', 'user', 'project-1')).toEqual({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })
        expect(getXpertFileMemoryWorkspacePath('xpert-1', 'project-1')).toBe('.xpert/memory/xperts/xpert-1')
        expect(getXpertFileMemoryWorkspacePath('xpert-2', 'project-1')).not.toBe(
            getXpertFileMemoryWorkspacePath('xpert-1', 'project-1')
        )
    })
})
