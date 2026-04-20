jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentUserId: jest.fn()
    },
    TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
        constructor(public readonly repository?: unknown) {}

        findOne(): Promise<T> {
            return Promise.resolve(null)
        }

        findAll() {
            return Promise.resolve({ items: [], total: 0 })
        }
    },
    transformWhere: jest.fn((value) => value),
    UserGroupService: class UserGroupService {}
}))

jest.mock('@xpert-ai/server-common', () => ({
    getErrorMessage: jest.fn((error) => error?.message ?? String(error))
}))

jest.mock('../copilot-store', () => ({
    CopilotStoreBulkPutCommand: class CopilotStoreBulkPutCommand {}
}))

jest.mock('../copilot-store/copilot-store.service', () => ({
    CopilotStoreService: class CopilotStoreService {}
}))

jest.mock('../sandbox/sandbox.service', () => ({
    SandboxService: class SandboxService {}
}))

jest.mock('../xpert-workspace', () => ({
    GetXpertWorkspaceQuery: class GetXpertWorkspaceQuery {},
    MyXpertWorkspaceQuery: class MyXpertWorkspaceQuery {}
}))

jest.mock('./commands', () => ({
    XpertPublishCommand: class XpertPublishCommand {
        constructor(
            public readonly id: string,
            public readonly newVersion: boolean,
            public readonly environmentId: string,
            public readonly notes: string
        ) {}
    }
}))

jest.mock('./dto', () => ({
    XpertIdentiDto: class XpertIdentiDto {
        constructor(data?: object) {
            Object.assign(this, data)
        }
    }
}))

jest.mock('./queries', () => ({
    GetXpertMemoryEmbeddingsQuery: class GetXpertMemoryEmbeddingsQuery {}
}))

jest.mock('./types', () => ({
    EventNameXpertValidate: 'xpert.validate',
    XpertDraftValidateEvent: class XpertDraftValidateEvent {
        constructor(public readonly draft: unknown) {}
    }
}))

jest.mock('./validators', () => ({
    FreeNodeValidator: class FreeNodeValidator {
        validate() {
            return Promise.resolve([])
        }
    }
}))

jest.mock('./xpert.entity', () => ({
    Xpert: class Xpert {}
}))

const mockList = jest.fn()
const mockReadFile = jest.fn()
const mockSaveFile = jest.fn()
const mockWorkspaceVolumeClient = jest.fn().mockImplementation(() => ({
    list: mockList,
    readFile: mockReadFile,
    saveFile: mockSaveFile
}))
const mockVolumeClient = jest.fn().mockImplementation((params) => ({
    ...params,
    getVolumePath: jest.fn(),
    getPublicUrl: jest.fn()
}))

jest.mock('../shared/volume', () => ({
    VolumeClient: mockVolumeClient,
    WorkspaceVolumeClient: mockWorkspaceVolumeClient,
    VolumeSubtreeClient: mockWorkspaceVolumeClient
}))

import { TFile } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { VolumeClient, WorkspaceVolumeClient } from '../shared/volume'
import { XpertService } from './xpert.service'

describe('XpertService memory files', () => {
    let service: XpertService

    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        service = new XpertService(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            { list: jest.fn().mockReturnValue([]) } as any,
            { listProviders: jest.fn().mockReturnValue([]) } as any,
            { resolve: mockVolumeClient } as any
        )
    })

    it('lists files inside the current xpert memory workspace', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1'
        } as any)
        mockList.mockResolvedValue([])

        await service.getMemoryFiles('xpert-1', 'docs', 2)

        expect(service.findOne).toHaveBeenCalledWith('xpert-1')
        expect(VolumeClient).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            userId: 'user-1',
            xpertId: 'xpert-1',
            isolateByUser: true
        })
        expect(WorkspaceVolumeClient).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'user-1'
            }),
            { allowRootWorkspace: true }
        )
        expect(mockList).toHaveBeenCalledWith('.xpert/memory', {
            path: 'docs',
            deepth: 2
        })
    })

    it('reads files inside the current xpert memory workspace', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1'
        } as any)
        mockReadFile.mockResolvedValue({
            filePath: 'README.md'
        } as TFile)

        await service.getMemoryFile('xpert-1', 'README.md')

        expect(service.findOne).toHaveBeenCalledWith('xpert-1')
        expect(VolumeClient).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            userId: 'user-1',
            xpertId: 'xpert-1',
            isolateByUser: true
        })
        expect(mockReadFile).toHaveBeenCalledWith('.xpert/memory', 'README.md')
    })

    it('saves files inside the current xpert memory workspace', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1'
        } as any)
        mockSaveFile.mockResolvedValue({
            filePath: 'README.md',
            contents: '# Updated\n'
        } as TFile)

        await service.saveMemoryFile('xpert-1', 'README.md', '# Updated\n')

        expect(service.findOne).toHaveBeenCalledWith('xpert-1')
        expect(VolumeClient).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            userId: 'user-1',
            xpertId: 'xpert-1',
            isolateByUser: true
        })
        expect(mockSaveFile).toHaveBeenCalledWith('.xpert/memory', 'README.md', '# Updated\n')
    })
})
