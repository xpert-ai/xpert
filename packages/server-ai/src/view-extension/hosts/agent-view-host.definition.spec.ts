import { WorkflowNodeTypeEnum, XpertTypeEnum, type XpertViewHostContext } from '@xpert-ai/contracts'
import { RequestContext, type ViewHostResolution } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VolumeHandle } from '../../shared/volume'
import { AgentViewHostDefinition } from './agent-view-host.definition'

const createProfileIdentity = () =>
    ({
        resolve: jest.fn(async (xpert: { id: string }) => ({
            instanceId: xpert.id,
            currentId: xpert.id,
            versionIds: [xpert.id]
        }))
    }) as never

describe('AgentViewHostDefinition', () => {
    it('loads the primary agent relation and derives middleware feature capabilities', async () => {
        const xpertService = {
            findOneByIdWithinTenant: jest.fn().mockResolvedValue({
                id: 'agent-host-1',
                type: XpertTypeEnum.Agent,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                name: 'CEO Assistant',
                title: 'CEO Assistant',
                active: true,
                features: {
                    sandbox: {
                        enabled: true
                    }
                },
                agent: {
                    key: 'Agent_BusinessAssistant',
                    knowledgebaseIds: ['kb-1']
                },
                graph: {
                    nodes: [
                        {
                            key: 'Agent_BusinessAssistant',
                            type: 'agent',
                            entity: {
                                key: 'Agent_BusinessAssistant',
                                name: 'CEO Assistant'
                            }
                        },
                        {
                            key: 'Agent_BomEngineer',
                            type: 'agent',
                            entity: {
                                id: 'internal-agent-node-id',
                                key: 'Agent_BomEngineer',
                                title: 'BOM Engineer',
                                description: 'BOM engineering role'
                            }
                        },
                        {
                            key: 'Middleware_BOM',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'BomDocumentIntakeMiddleware'
                            }
                        }
                    ],
                    connections: [
                        {
                            key: 'Agent_BusinessAssistant/Middleware_BOM',
                            type: 'workflow',
                            from: 'Agent_BusinessAssistant',
                            to: 'Middleware_BOM'
                        }
                    ]
                }
            })
        }
        const middlewareRegistry = {
            get: jest.fn().mockReturnValue({
                meta: {
                    features: ['bom_document_intake']
                }
            })
        }
        const definition = new AgentViewHostDefinition(
            xpertService as any,
            {} as any,
            middlewareRegistry as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            createProfileIdentity()
        )

        const resolved = await definition.resolve('agent-host-1')

        expect(xpertService.findOneByIdWithinTenant).toHaveBeenCalledWith('agent-host-1', {
            relations: ['agent']
        })
        expect(middlewareRegistry.get).toHaveBeenCalledWith('BomDocumentIntakeMiddleware', 'org-1')
        expect(resolved?.context).toMatchObject({
            assistant: {
                instanceId: 'agent-host-1',
                currentId: 'agent-host-1',
                versionIds: ['agent-host-1']
            },
            capabilities: {
                features: ['bom_document_intake', 'sandbox']
            },
            hostState: {
                agent: {
                    availableAgents: [
                        {
                            key: 'Agent_BomEngineer',
                            role: 'BOM engineering role',
                            title: 'BOM Engineer'
                        },
                        {
                            key: 'Agent_BusinessAssistant',
                            role: 'CEO Assistant',
                            title: 'CEO Assistant'
                        }
                    ],
                    connections: [
                        {
                            id: 'kb-1',
                            type: 'knowledgebase'
                        }
                    ],
                    key: 'Agent_BusinessAssistant',
                    middlewareNodeKeys: ['Middleware_BOM'],
                    middlewareProviders: ['BomDocumentIntakeMiddleware']
                }
            }
        })
        expect((resolved?.hostSnapshot as any).agent.key).toBe('Agent_BusinessAssistant')
        expect(JSON.stringify((resolved?.context.hostState as any).agent.availableAgents)).not.toContain(
            'internal-agent-node-id'
        )
        expect((resolved?.context.hostState as any).agent.availableAgents[0]).not.toHaveProperty('id')
    })

    it('uses the canonical Xpert id for a user-isolated workspace scope', async () => {
        const currentUser = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const xpertService = {
            findOneByIdWithinTenant: jest.fn().mockResolvedValue({
                id: 'agent-host-1',
                type: XpertTypeEnum.Agent,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                workspaceDataScope: 'user',
                name: 'Personal Assistant',
                active: true,
                agent: { key: 'Agent_Personal' },
                graph: { nodes: [], connections: [] }
            })
        }
        const definition = new AgentViewHostDefinition(
            xpertService as never,
            {} as never,
            { get: jest.fn() } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            createProfileIdentity()
        )

        try {
            const resolved = await definition.resolve('agent-host-1')

            expect(resolved?.context.runtimeScope).toMatchObject({
                dataScopeKey: 'user-xperts:user-1:agent-host-1',
                workspaceFiles: {
                    catalog: 'user-xperts',
                    scopeId: 'agent-host-1',
                    xpertId: 'agent-host-1',
                    userId: 'user-1',
                    isolateByUser: true
                }
            })
        } finally {
            currentUser.mockRestore()
        }
    })

    it.each([
        ['member', false],
        ['editor', true]
    ] as const)('resolves %s Project access into the agent runtime scope', async (role, canEdit) => {
        const xpert = {
            id: 'agent-host-1',
            type: XpertTypeEnum.Agent,
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            workspaceDataScope: 'user',
            name: 'Project Assistant',
            active: true,
            agent: { key: 'Agent_Project' },
            graph: { nodes: [], connections: [] }
        }
        const projectAccessService = {
            assertCanUseXpert: jest.fn().mockResolvedValue({
                role,
                project: { id: 'project-1', name: 'Project 1', status: 'active' }
            })
        }
        const definition = new AgentViewHostDefinition(
            { findOneByIdWithinTenant: jest.fn().mockResolvedValue(xpert) } as never,
            {} as never,
            { get: jest.fn() } as never,
            {} as never,
            projectAccessService as never,
            {} as never,
            {} as never,
            createProfileIdentity()
        )

        const resolved = await definition.resolve('agent-host-1', {
            runtimeScope: { projectId: 'project-1' }
        })

        expect(projectAccessService.assertCanUseXpert).toHaveBeenCalledWith('project-1', 'agent-host-1')
        expect(resolved?.context.runtimeScope).toMatchObject({
            projectId: 'project-1',
            dataScopeKey: 'project:project-1',
            projectAccess: {
                role,
                canRead: true,
                canEdit,
                canManage: false,
                canUse: true
            },
            workspaceFiles: {
                catalog: 'projects',
                scopeId: 'project-1',
                projectId: 'project-1'
            }
        })
    })

    it('projects only safe direct external Assistant binding metadata into host state', async () => {
        const requester = {
            id: 'orchestrator-1',
            type: XpertTypeEnum.Agent,
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            name: 'orchestrator',
            title: 'BOM 全流程协同助手',
            active: true,
            agent: { key: 'Agent_LifecycleOrchestrator' },
            graph: {
                nodes: [
                    {
                        key: 'Agent_LifecycleOrchestrator',
                        type: 'agent',
                        entity: { key: 'Agent_LifecycleOrchestrator' }
                    },
                    { key: 'bom-assistant-1', type: 'xpert', entity: { key: 'bom-assistant-1' } }
                ],
                connections: [
                    {
                        key: 'orchestrator/bom',
                        type: 'xpert',
                        from: 'Agent_LifecycleOrchestrator',
                        to: 'bom-assistant-1',
                        required: true
                    }
                ]
            }
        }
        const executor = {
            id: 'bom-assistant-1',
            type: XpertTypeEnum.Agent,
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            name: 'bom-engineer',
            title: 'BOM 工程助手（组织实例）',
            avatar: { emoji: '🧱', background: '#eef2ff' },
            active: true,
            version: '10',
            publishAt: new Date('2026-01-01T00:00:00Z'),
            agent: { key: 'Agent_BomEngineer' },
            graph: { nodes: [], connections: [] },
            options: {
                templateSource: {
                    templateId: '@xpert-ai/plugin-bom-lifecycle:bom-lifecycle-bom-engineer',
                    templateKey: 'bom-lifecycle-bom-engineer',
                    pluginName: '@xpert-ai/plugin-bom-lifecycle'
                }
            }
        }
        const xpertService = {
            findOneByIdWithinTenant: jest.fn(async (id: string) => (id === requester.id ? requester : executor))
        }
        const definition = new AgentViewHostDefinition(
            xpertService as any,
            {} as any,
            { get: jest.fn() } as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            createProfileIdentity()
        )

        const resolved = await definition.resolve(requester.id)
        const externalAssistants = (resolved?.context.hostState as any).agent.externalAssistants

        expect(externalAssistants).toEqual([
            expect.objectContaining({
                title: 'BOM 工程助手（组织实例）',
                avatar: { emoji: '🧱', background: '#eef2ff' },
                primaryAgentKey: 'Agent_BomEngineer',
                publishedVersion: '10',
                status: 'available',
                templateSource: expect.objectContaining({ templateKey: 'bom-lifecycle-bom-engineer' })
            })
        ])
        expect(JSON.stringify(externalAssistants)).not.toContain('bom-assistant-1')
        expect(JSON.stringify(externalAssistants)).not.toContain('org-1')
        expect(JSON.stringify(externalAssistants)).not.toContain('tenant-1')
    })

    it('derives view capabilities from the draft graph only when draft resolution is requested', async () => {
        const xpertService = {
            findOneByIdWithinTenant: jest.fn().mockResolvedValue({
                id: 'agent-host-1',
                type: XpertTypeEnum.Agent,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                name: 'Published Assistant',
                active: true,
                agent: {
                    key: 'Agent_Published'
                },
                graph: {
                    nodes: [
                        {
                            key: 'Agent_Published',
                            type: 'agent',
                            entity: {
                                key: 'Agent_Published',
                                name: 'Published Assistant'
                            }
                        }
                    ],
                    connections: []
                },
                draft: {
                    team: {
                        name: 'Story Studio',
                        agent: {
                            key: 'Agent_StoryStudio'
                        }
                    },
                    nodes: [
                        {
                            key: 'Agent_StoryStudio',
                            type: 'agent',
                            entity: {
                                key: 'Agent_StoryStudio',
                                name: 'Story Studio'
                            }
                        },
                        {
                            key: 'Middleware_StoryStudio',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                                provider: 'StoryStudioMiddleware'
                            }
                        }
                    ],
                    connections: [
                        {
                            key: 'Agent_StoryStudio/Middleware_StoryStudio',
                            type: 'workflow',
                            from: 'Agent_StoryStudio',
                            to: 'Middleware_StoryStudio'
                        }
                    ]
                }
            })
        }
        const middlewareRegistry = {
            get: jest.fn().mockReturnValue({
                meta: {
                    features: ['story-studio']
                }
            })
        }
        const definition = new AgentViewHostDefinition(
            xpertService as unknown as ConstructorParameters<typeof AgentViewHostDefinition>[0],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[1],
            middlewareRegistry as unknown as ConstructorParameters<typeof AgentViewHostDefinition>[2],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[3],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[4],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[5],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[6],
            createProfileIdentity()
        )

        const published = await definition.resolve('agent-host-1')
        const draft = await definition.resolve('agent-host-1', { isDraft: true })

        expect(published?.context).toMatchObject({
            capabilities: { features: [] },
            hostState: {
                agent: {
                    key: 'Agent_Published',
                    middlewareProviders: []
                }
            }
        })
        expect(draft?.context).toMatchObject({
            capabilities: { features: ['story-studio'] },
            hostState: {
                agent: {
                    key: 'Agent_StoryStudio',
                    middlewareProviders: ['StoryStudioMiddleware']
                }
            }
        })
    })

    it('requires edit permission and xpert authoring access for draft view discovery', async () => {
        const xpertService = {
            assertCanAuthorById: jest.fn()
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn()
        }
        const definition = new AgentViewHostDefinition(
            xpertService as unknown as ConstructorParameters<typeof AgentViewHostDefinition>[0],
            publishedXpertAccessService as unknown as ConstructorParameters<typeof AgentViewHostDefinition>[1],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[2],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[3],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[4],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[5],
            {} as ConstructorParameters<typeof AgentViewHostDefinition>[6],
            createProfileIdentity()
        )
        const permission = jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        const context = { hostId: 'agent-host-1' } as XpertViewHostContext
        const resolution = { workspaceId: 'draft-workspace-2' } as ViewHostResolution

        await expect(definition.canRead(context, resolution, { isDraft: true })).resolves.toBe(false)
        expect(xpertService.assertCanAuthorById).not.toHaveBeenCalled()
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()

        permission.mockReturnValue(true)
        xpertService.assertCanAuthorById.mockRejectedValueOnce(new ForbiddenException('Access denied to workspace'))
        await expect(definition.canRead(context, resolution, { isDraft: true })).resolves.toBe(false)
        expect(xpertService.assertCanAuthorById).toHaveBeenCalledWith('agent-host-1', 'draft-workspace-2')

        xpertService.assertCanAuthorById.mockResolvedValueOnce(undefined)
        await expect(definition.canRead(context, resolution, { isDraft: true })).resolves.toBe(true)
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()

        xpertService.assertCanAuthorById.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(definition.canRead(context, resolution, { isDraft: true })).rejects.toThrow('database unavailable')

        permission.mockRestore()
    })

    it('uploads workspace file actions into the xpert workspace before provider execution', async () => {
        const tempRoot = mkdtempSync(join(tmpdir(), 'xpert-view-host-'))
        const volumeClient = {
            resolve: jest.fn().mockReturnValue(
                new VolumeHandle(
                    {
                        tenantId: 'tenant-1',
                        catalog: 'xperts',
                        xpertId: 'agent-host-1',
                        isolateByUser: false
                    },
                    tempRoot,
                    tempRoot,
                    'http://files.example/xperts/agent-host-1'
                )
            )
        }
        const xpertService = {
            findOneByIdWithinTenant: jest.fn().mockResolvedValue({
                id: 'agent-host-1',
                workspaceDataScope: 'shared'
            })
        }
        const definition = new AgentViewHostDefinition(
            xpertService as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            volumeClient as never,
            createProfileIdentity()
        )

        try {
            const expectedFileName = '\u552e\u540e\u6570\u636e\u5206\u6790\u5de5\u5177\u9700\u6c42v0.1.xlsx'
            const rawMultipartFileName = Buffer.from(expectedFileName, 'utf8').toString('latin1')
            const prepared = await definition.prepareFileAction(
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'user-1',
                    hostType: 'agent',
                    hostId: 'agent-host-1',
                    slots: []
                } as any,
                {
                    input: {
                        workspaceUploadPath: 'fdd/documents',
                        originalFileName: expectedFileName
                    }
                } as any,
                {
                    originalname: rawMultipartFileName,
                    buffer: Buffer.from('xlsx-content'),
                    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    size: 12
                } as any
            )

            expect(volumeClient.resolve).toHaveBeenCalledWith({
                tenantId: 'tenant-1',
                catalog: 'xperts',
                xpertId: 'agent-host-1',
                isolateByUser: false,
                userId: 'user-1'
            })
            expect(prepared.input).toMatchObject({
                workspaceUploadPath: 'fdd/documents',
                workspaceFile: {
                    workspacePath: `fdd/documents/${expectedFileName}`,
                    filePath: `fdd/documents/${expectedFileName}`,
                    originalName: expectedFileName,
                    name: expectedFileName,
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    size: 12
                }
            })
            expect(readFileSync(join(tempRoot, 'fdd/documents', expectedFileName), 'utf8')).toBe('xlsx-content')
        } finally {
            rmSync(tempRoot, { recursive: true, force: true })
        }
    })
})
