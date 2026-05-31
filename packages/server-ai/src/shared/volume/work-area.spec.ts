import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { VolumeClient, VolumeHandle, VolumeRootResolution, VolumeScope } from './volume'
import { KnowledgeWorkAreaResolver, XpertWorkAreaResolver } from './work-area'

describe('XpertWorkAreaResolver', () => {
    let tempRoot: string
    let resolver: XpertWorkAreaResolver
    let volumeClient: { resolve: jest.Mock }

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-work-area-'))
        volumeClient = {
            resolve: jest.fn((scope) => new VolumeHandle(scope, tempRoot, tempRoot, 'http://localhost/volume'))
        }
        resolver = new XpertWorkAreaResolver(new TestVolumeClient(volumeClient.resolve))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
        jest.clearAllMocks()
    })

    it('uses the project root as the default cwd and exposes shared agent session paths', async () => {
        const workArea = await resolver.resolve({
            tenantId: 'tenant-1',
            userId: 'user-1',
            xpertId: 'xpert-1',
            projectId: 'project-1',
            conversationId: 'conversation-1',
            provider: 'local-shell-sandbox'
        })

        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })
        expect(workArea.workingDirectory).toBe(tempRoot)
        expect(workArea.defaultPath.relativePath).toBe('')
        expect(workArea.sharedPath?.workspacePath).toBe(path.join(tempRoot, 'shared'))
        expect(workArea.agentPath?.workspacePath).toBe(path.join(tempRoot, 'agents/xpert-1'))
        expect(workArea.sessionPath?.workspacePath).toBe(path.join(tempRoot, 'sessions/conversation-1'))
        await expect(fsPromises.stat(tempRoot)).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, 'shared'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, 'agents/xpert-1'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, 'sessions/conversation-1'))).resolves.toBeTruthy()
    })

    it('uses the xpert root as the non-project cwd and keeps memory shared', async () => {
        const workArea = await resolver.resolve({
            tenantId: 'tenant-1',
            userId: 'user-1',
            xpertId: 'xpert-1',
            conversationId: 'conversation-1'
        })

        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            userId: 'user-1',
            isolateByUser: false
        })
        expect(workArea.workingDirectory).toBe(tempRoot)
        expect(workArea.defaultPath.relativePath).toBe('')
        expect(workArea.sharedPath?.workspacePath).toBe(path.join(tempRoot, 'shared'))
        expect(workArea.sessionPath?.workspacePath).toBe(path.join(tempRoot, 'sessions/conversation-1'))
        expect(workArea.memoryPath?.workspacePath).toBe(path.join(tempRoot, '.xpert/memory'))
        await expect(fsPromises.stat(tempRoot)).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, 'shared'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, 'sessions/conversation-1'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, '.xpert/memory'))).resolves.toBeTruthy()
    })

    it('maps docker sandboxes to /workspace while preserving explicit relative paths', async () => {
        const workArea = await resolver.resolve({
            tenantId: 'tenant-1',
            userId: 'user-1',
            xpertId: 'xpert-1',
            projectId: 'project-1',
            conversationId: 'conversation-1',
            provider: 'docker-sandbox'
        })

        expect(workArea.workspaceRoot).toBe('/workspace')
        expect(workArea.workingDirectory).toBe('/workspace')
        expect(workArea.sharedPath?.workspacePath).toBe('/workspace/shared')
        expect(workArea.agentPath?.workspacePath).toBe('/workspace/agents/xpert-1')
        expect(workArea.sessionPath?.workspacePath).toBe('/workspace/sessions/conversation-1')
    })
})

describe('KnowledgeWorkAreaResolver', () => {
    let tempRoot: string
    let resolver: KnowledgeWorkAreaResolver
    let volumeClient: { resolve: jest.Mock }

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'knowledge-work-area-'))
        volumeClient = {
            resolve: jest.fn((scope) => new VolumeHandle(scope, tempRoot, tempRoot, 'http://localhost/volume'))
        }
        resolver = new KnowledgeWorkAreaResolver(new TestVolumeClient(volumeClient.resolve))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
        jest.clearAllMocks()
    })

    it('uses the knowledgebase shared volume and creates stable knowledge subdirectories', async () => {
        const workArea = await resolver.resolve({
            tenantId: 'tenant-1',
            userId: 'user-1',
            knowledgebaseId: 'kb-1',
            documentId: 'doc-1'
        })

        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'knowledges',
            knowledgeId: 'kb-1',
            userId: 'user-1'
        })
        expect(workArea.workingDirectory).toBe(path.join(tempRoot, 'documents/doc-1'))
        expect(workArea.filesPath.relativePath).toBe('files')
        expect(workArea.userStagingPath.workspacePath).toBe(path.join(tempRoot, 'users/user-1/staging'))
        expect(workArea.documentPath?.workspacePath).toBe(path.join(tempRoot, 'documents/doc-1'))
        expect(workArea.tmpPath.workspacePath).toBe(path.join(tempRoot, 'documents/doc-1/tmp'))
        expect(workArea.statePath.workspacePath).toBe(path.join(tempRoot, '.knowledge'))
        await expect(fsPromises.stat(path.join(tempRoot, 'files'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, 'users/user-1/staging'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, 'documents/doc-1/tmp'))).resolves.toBeTruthy()
        await expect(fsPromises.stat(path.join(tempRoot, '.knowledge'))).resolves.toBeTruthy()
    })

    it('uses a pipeline run directory and run-scoped tmp when taskId is provided', async () => {
        const workArea = await resolver.resolve({
            tenantId: 'tenant-1',
            userId: 'user-1',
            knowledgebaseId: 'kb-1',
            taskId: 'task-1',
            provider: 'docker-sandbox'
        })

        expect(workArea.workspaceRoot).toBe('/workspace')
        expect(workArea.workingDirectory).toBe('/workspace/pipeline/runs/task-1')
        expect(workArea.pipelineRunPath?.workspacePath).toBe('/workspace/pipeline/runs/task-1')
        expect(workArea.tmpPath.workspacePath).toBe('/workspace/pipeline/runs/task-1/tmp')
        expect(workArea.legacyTmpPath.workspacePath).toBe('/workspace/tmp')
        await expect(fsPromises.stat(path.join(tempRoot, 'pipeline/runs/task-1/tmp'))).resolves.toBeTruthy()
    })

    it('returns files subpaths for new knowledge uploads', () => {
        expect(resolver.getFilesPath('manuals')).toBe('files/manuals')
        expect(resolver.getFilesPath('/manuals\\team')).toBe('files/manuals/team')
    })
})

class TestVolumeClient extends VolumeClient {
    constructor(private readonly resolveMock: jest.Mock<VolumeHandle, [VolumeScope]>) {
        super()
    }

    resolve(scope: VolumeScope): VolumeHandle {
        return this.resolveMock(scope)
    }

    resolveRoot(_tenantId: string): VolumeRootResolution {
        throw new Error('Not used in XpertWorkAreaResolver tests')
    }
}
