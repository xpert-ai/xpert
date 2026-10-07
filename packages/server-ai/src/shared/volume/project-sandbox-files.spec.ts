jest.mock('../../sandbox/middlewares/file-activity-storage.service', () => ({ FileActivityStorage: class {} }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { SandboxFileMiddleware } from '../../sandbox/middlewares/sandbox-file.middleware'
import { WorkspaceFilesRuntimeCapabilityService } from '../runtime/workspace-files-runtime-capability.service'
import { VolumeClient, VolumeHandle, VolumeScope } from './volume'
import { XpertWorkAreaResolver } from './work-area'

describe('Project Sandbox and business file paths', () => {
    let root: string

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-sandbox-files-'))
    })
    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true })
    })

    it.each(['local-shell-sandbox', 'container-runtime'])(
        '%s shares native file edits across main, expert and project-scoped business reads',
        async (provider) => {
            const volumes = new ProjectTestVolumes(root)
            const resolver = new XpertWorkAreaResolver(volumes, {
                mapVolumeToWorkspace: (_provider: string, volume: VolumeHandle, options: { serverPath: string }) => {
                    const workspaceRoot = provider === 'container-runtime' ? '/workspace' : volume.serverRoot
                    return {
                        volumeRoot: volume.serverRoot,
                        workspaceRoot,
                        workspacePath: path.join(workspaceRoot, options.serverPath)
                    }
                }
            } as never)
            const scope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', projectId: 'project-1' }
            const main = await resolver.resolve({ ...scope, provider, xpertId: 'main', conversationId: 'main-chat' })
            const expert = await resolver.resolve({
                ...scope,
                provider,
                xpertId: 'expert',
                conversationId: 'expert-chat'
            })
            const capabilities = new DefaultRuntimeCapabilityRegistry().register(ProjectAccessRuntimeCapability, {
                listReadable: jest.fn().mockResolvedValue([]),
                assertEdit: jest
                    .fn()
                    .mockResolvedValue({
                        projectId: scope.projectId,
                        role: 'editor',
                        canManage: false,
                        archived: false
                    }),
                assertManage: jest
                    .fn()
                    .mockResolvedValue({
                        projectId: scope.projectId,
                        role: 'manager',
                        canManage: true,
                        archived: false
                    })
            })
            const workspace = new WorkspaceFilesRuntimeCapabilityService({ execute: jest.fn() }, volumes, capabilities)
            const business = workspace.createScopedApi(scope)
            const runtime = workspace.createScopedApi({
                ...scope,
                xpertId: 'expert',
                workspaceRoot: expert.workspaceRoot,
                workspacePath: expert.workingDirectory
            })
            const middleware = new SandboxFileMiddleware({ persist: jest.fn() })
            const tools = (
                await middleware.createMiddleware({}, {
                    ...scope,
                    xpertFeatures: { sandbox: { enabled: true } },
                    node: {
                        id: 'files',
                        key: 'files',
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'sandbox-file'
                    },
                    runtime: { capabilities: new DefaultRuntimeCapabilityRegistry() },
                    tools: new Map()
                } as never)
            ).tools
            const filePath = 'sessions/bid-runtime/BID-TEST/chapter/body/leaves/safety.md'
            const mainConfig = {
                configurable: {
                    sandbox: { backend: nativeBackend(main.workingDirectory, main.workspaceRoot, main.volumePath) }
                }
            }
            const expertConfig = {
                configurable: {
                    sandbox: {
                        backend: nativeBackend(expert.workingDirectory, expert.workspaceRoot, expert.volumePath)
                    }
                }
            }
            const write = tools.find((tool) => tool.name === 'sandbox_write_file')!
            const append = tools.find((tool) => tool.name === 'sandbox_append_file')!
            const edit = tools.find((tool) => tool.name === 'sandbox_edit_file')!
            const read = tools.find((tool) => tool.name === 'sandbox_read_file')!

            await write.invoke({ file_path: filePath, content: '### 安全\n已有正文。\n' }, mainConfig)
            expect((await business.readRuntimeBuffer(filePath)).buffer.toString()).toBe('### 安全\n已有正文。\n')
            await append.invoke({ file_path: filePath, content: '专家补充。\n' }, expertConfig)
            expect(await read.invoke({ file_path: filePath }, mainConfig)).toContain('专家补充。')
            await edit.invoke({ file_path: filePath, old_string: '已有正文。', new_string: '主助手更正。' }, mainConfig)
            const current = (await business.readRuntimeBuffer(filePath)).buffer
            expect(current.toString()).toBe('### 安全\n主助手更正。\n专家补充。\n')
            const runtimeFile = await runtime.readRuntimeBuffer(filePath)
            expect(runtimeFile.buffer).toEqual(current)
            expect(runtimeFile.reference.filePath).toBe(filePath)
            expect((await runtime.readRuntimeBuffer(path.join(expert.workspaceRoot, filePath))).buffer).toEqual(current)
            expect(main.workingDirectory).toBe(expert.workingDirectory)
            expect(main.memoryPath.workspacePath).not.toBe(expert.memoryPath.workspacePath)
            await expect(fs.stat(path.join(main.volumePath, 'agents'))).rejects.toMatchObject({ code: 'ENOENT' })

            const otherProject = workspace.createScopedApi({ ...scope, projectId: 'project-2' })
            await expect(otherProject.readRuntimeBuffer(filePath)).rejects.toBeInstanceOf(BadRequestException)
        }
    )
})

class ProjectTestVolumes extends VolumeClient {
    constructor(private readonly root: string) {
        super()
    }
    resolve(scope: VolumeScope) {
        const directory = path.join(this.root, scope.tenantId, scope.projectId)
        return new VolumeHandle(scope, directory, directory, '')
    }
    resolveRoot() {
        return { serverRoot: this.root, hostRoot: this.root }
    }
}

function nativeBackend(workingDirectory: string, workspaceRoot: string, volumeRoot: string) {
    const serverPath = (workspacePath: string) => path.join(volumeRoot, path.relative(workspaceRoot, workspacePath))
    return {
        workingDirectory,
        read: async (filePath: string) => fs.readFile(serverPath(filePath), 'utf8'),
        write: async (filePath: string, content: string) => {
            await fs.mkdir(path.dirname(serverPath(filePath)), { recursive: true })
            await fs.writeFile(serverPath(filePath), content, { flag: 'wx' })
            return { path: filePath, filesUpdate: null }
        },
        append: async (filePath: string, content: string) => {
            await fs.appendFile(serverPath(filePath), content)
            return { path: filePath, filesUpdate: null }
        },
        edit: async (filePath: string, oldString: string, newString: string) => {
            const current = await fs.readFile(serverPath(filePath), 'utf8')
            if (!current.includes(oldString)) throw Error('Text not found')
            await fs.writeFile(serverPath(filePath), current.replace(oldString, newString))
            return { path: filePath, filesUpdate: null, occurrences: 1 }
        }
    }
}
