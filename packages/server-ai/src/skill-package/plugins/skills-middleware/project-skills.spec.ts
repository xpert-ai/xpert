jest.mock('../../skill-package.entity', () => ({
    SkillPackage: class SkillPackage {}
}))

jest.mock('../../skill-package.service', () => ({
    SkillPackageService: class SkillPackageService {}
}))

jest.mock('../../../skill-repository/repository-index/skill-repository-index.service', () => ({
    SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('../../../xpert-workspace', () => ({
    getWorkspaceRoot: jest.fn(() => '/workspace-root')
}))

jest.mock('../../../xpert-workspace/workspace.entity', () => ({
    XpertWorkspace: class XpertWorkspace {}
}))

jest.mock('../../../sandbox', () => ({
    SandboxAcquireBackendCommand: class SandboxAcquireBackendCommand {
        constructor(public readonly payload: unknown) {}
    },
    SandboxCopyTreeCommand: class SandboxCopyTreeCommand {
        constructor(
            public readonly sandbox: unknown,
            public readonly copyTree: unknown
        ) {}
    }
}))

import { AIMessage, SystemMessage } from '@langchain/core/messages'
import { createRuntimeSkillCapabilityId } from '@xpert-ai/contracts'
import { SkillsMiddleware } from './index'

describe('SkillsMiddleware Project Content', () => {
    it('does not expose Workspace skill discovery or installation tools in a Project run', async () => {
        const middleware = new SkillsMiddleware(
            { find: jest.fn().mockResolvedValue([]) } as never,
            { assertCanRun: jest.fn() } as never,
            { ensureInstalledSkillPackage: jest.fn() } as never,
            { findMarketplace: jest.fn() } as never
        )

        const instance = await middleware.createMiddleware(
            { autoDiscovery: { enabled: true } },
            {
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                userId: 'user-1',
                workspaceId: 'workspace-1',
                projectId: 'project-1',
                node: {} as never,
                tools: new Map(),
                runtime: {
                    createModelClient: jest.fn(),
                    wrapWorkflowNodeExecution: jest.fn()
                }
            }
        )

        expect(instance.tools?.map((tool) => tool.name)).toEqual(['read_skill_file'])
    })

    it('loads configured Xpert skills beside Project skills in distinct runtime directories', async () => {
        const middleware = new SkillsMiddleware(
            { find: jest.fn().mockResolvedValue([]) } as never,
            { assertCanRun: jest.fn() } as never,
            { ensureInstalledSkillPackage: jest.fn() } as never,
            { findMarketplace: jest.fn() } as never
        )
        const execute = jest.fn().mockResolvedValue(undefined)
        Reflect.set(middleware, 'commandBus', { execute })
        jest.spyOn(
            middleware as unknown as {
                loadProjectSkillMetadata: (
                    runtimeRoot: string,
                    tenantId: string,
                    projectId: string,
                    allowedSkillIds?: ReadonlySet<string>
                ) => Promise<unknown[]>
            },
            'loadProjectSkillMetadata'
        ).mockResolvedValue([
            {
                id: 'xlsx',
                name: 'xlsx',
                description: 'Project spreadsheet rules',
                path: '/workspace/runtime/.xpert/skills/project/xlsx/SKILL.md',
                packagePath: 'xlsx',
                runtimePath: 'project/xlsx',
                workspaceId: 'project:project-1',
                version: '1',
                localPath: '/project/project-1/skills/xlsx'
            }
        ])
        jest.spyOn(
            middleware as unknown as {
                loadSkillMetadata: (runtimeRoot: string, skillIds: string[], workspaceId: string) => Promise<unknown[]>
            },
            'loadSkillMetadata'
        ).mockResolvedValue([
            {
                id: 'docx-editor',
                name: 'docx-editor',
                description: 'Edit DOCX files',
                path: '/workspace-root/docx-editor/SKILL.md',
                packagePath: 'docx-editor',
                workspaceId: 'workspace-1',
                version: '1',
                localPath: '/workspace-root/docx-editor'
            }
        ])
        const instance = await middleware.createMiddleware(
            { skills: ['docx-editor'] },
            {
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                userId: 'user-1',
                workspaceId: 'workspace-1',
                projectId: 'project-1',
                xpertId: 'xpert-1',
                node: {} as never,
                tools: new Map(),
                runtime: {
                    createModelClient: jest.fn(),
                    wrapWorkflowNodeExecution: jest.fn()
                }
            }
        )
        let capturedSystemMessage = ''
        const handler = jest.fn(async (request) => {
            capturedSystemMessage = request.systemMessage.content as string
            return new AIMessage('ok')
        })

        await instance.wrapModelCall(
            {
                runtime: {
                    configurable: {
                        sandbox: {
                            backend: { id: 'sandbox-1', execute: jest.fn() },
                            workingDirectory: '/workspace/runtime'
                        }
                    }
                },
                state: {},
                systemMessage: new SystemMessage('base')
            } as never,
            handler
        )

        const copiedPaths = execute.mock.calls.map((call) => Reflect.get(call[0], 'copyTree')?.containerPath)
        expect(copiedPaths).toEqual(
            expect.arrayContaining([
                '/workspace/runtime/.xpert/skills/project/xlsx',
                '/workspace/runtime/.xpert/skills/xpert/docx-editor'
            ])
        )
        expect(capturedSystemMessage).toContain('Project spreadsheet rules')
        expect(capturedSystemMessage).toContain('Edit DOCX files')
        expect(capturedSystemMessage).toContain('/workspace/runtime/.xpert/skills/project/xlsx/SKILL.md')
        expect(capturedSystemMessage).toContain('/workspace/runtime/.xpert/skills/xpert/docx-editor/SKILL.md')
        expect(capturedSystemMessage).toContain('prefer a matching Project skill over a general Xpert skill')
        expect(capturedSystemMessage.indexOf('Project spreadsheet rules')).toBeLessThan(
            capturedSystemMessage.indexOf('Edit DOCX files')
        )
    })

    it('honors a source-aware explicit Project-only selection', async () => {
        const middleware = new SkillsMiddleware(
            { find: jest.fn().mockResolvedValue([]) } as never,
            { assertCanRun: jest.fn() } as never,
            { ensureInstalledSkillPackage: jest.fn() } as never,
            { findMarketplace: jest.fn() } as never
        )
        Reflect.set(middleware, 'commandBus', { execute: jest.fn().mockResolvedValue(undefined) })
        const loadProjectSkillMetadata = jest
            .spyOn(
                middleware as unknown as {
                    loadProjectSkillMetadata: (
                        runtimeRoot: string,
                        tenantId: string,
                        projectId: string,
                        allowedSkillIds?: ReadonlySet<string>
                    ) => Promise<unknown[]>
                },
                'loadProjectSkillMetadata'
            )
            .mockResolvedValue([])
        const loadSkillMetadata = jest
            .spyOn(
                middleware as unknown as {
                    loadSkillMetadata: (
                        runtimeRoot: string,
                        skillIds: string[],
                        workspaceId: string
                    ) => Promise<unknown[]>
                },
                'loadSkillMetadata'
            )
            .mockResolvedValue([])
        const instance = await middleware.createMiddleware(
            { skills: ['docx-editor'] },
            {
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                userId: 'user-1',
                workspaceId: 'workspace-1',
                projectId: 'project-1',
                xpertId: 'xpert-1',
                node: {} as never,
                tools: new Map(),
                runtime: {
                    createModelClient: jest.fn(),
                    wrapWorkflowNodeExecution: jest.fn()
                }
            }
        )

        await instance.wrapModelCall(
            {
                runtime: {
                    configurable: {
                        sandbox: {
                            backend: { id: 'sandbox-1', execute: jest.fn() },
                            workingDirectory: '/workspace/runtime'
                        }
                    }
                },
                state: {
                    selectedSkillIds: [
                        createRuntimeSkillCapabilityId({
                            type: 'project',
                            ownerId: 'project-1',
                            skillId: 'xlsx'
                        })
                    ]
                },
                systemMessage: new SystemMessage('base')
            } as never,
            jest.fn(async () => new AIMessage('ok'))
        )

        expect(Array.from(loadProjectSkillMetadata.mock.calls[0][3] ?? [])).toEqual(['xlsx'])
        expect(loadSkillMetadata).not.toHaveBeenCalled()
    })

    it('fails before model execution when a Project skill cannot be projected', async () => {
        const middleware = new SkillsMiddleware(
            { find: jest.fn().mockResolvedValue([]) } as never,
            { assertCanRun: jest.fn() } as never,
            { ensureInstalledSkillPackage: jest.fn() } as never,
            { findMarketplace: jest.fn() } as never
        )
        const copyError = new Error('project skill copy failed')
        Reflect.set(middleware, 'commandBus', { execute: jest.fn().mockRejectedValue(copyError) })
        jest.spyOn(
            middleware as unknown as {
                loadProjectSkillMetadata: (
                    runtimeRoot: string,
                    tenantId: string,
                    projectId: string
                ) => Promise<unknown[]>
            },
            'loadProjectSkillMetadata'
        ).mockResolvedValue([
            {
                id: 'pdf',
                name: 'pdf',
                description: 'PDF skill',
                path: '/workspace/runtime/.xpert/skills/pdf/SKILL.md',
                packagePath: 'pdf',
                workspaceId: 'project:project-1',
                version: '1',
                localPath: '/project/project-1/skills/pdf'
            }
        ])
        const instance = await middleware.createMiddleware(
            {},
            {
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                userId: 'user-1',
                workspaceId: 'workspace-1',
                projectId: 'project-1',
                node: {} as never,
                tools: new Map(),
                runtime: {
                    createModelClient: jest.fn(),
                    wrapWorkflowNodeExecution: jest.fn()
                }
            }
        )
        const handler = jest.fn(async (request) => request)

        await expect(
            instance.wrapModelCall(
                {
                    runtime: {
                        configurable: {
                            sandbox: {
                                backend: { id: 'sandbox-1', execute: jest.fn() },
                                workingDirectory: '/workspace/runtime'
                            }
                        }
                    },
                    state: {},
                    systemMessage: new SystemMessage('base')
                } as never,
                handler
            )
        ).rejects.toThrow()
        expect(handler).not.toHaveBeenCalled()
    })
})
