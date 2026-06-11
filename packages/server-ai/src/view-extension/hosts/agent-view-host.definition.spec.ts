import { WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VolumeHandle } from '../../shared/volume'
import { AgentViewHostDefinition } from './agent-view-host.definition'

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
            {} as any
        )

        const resolved = await definition.resolve('agent-host-1')

        expect(xpertService.findOneByIdWithinTenant).toHaveBeenCalledWith('agent-host-1', {
            relations: ['agent']
        })
        expect(middlewareRegistry.get).toHaveBeenCalledWith('BomDocumentIntakeMiddleware', 'org-1')
        expect(resolved?.context).toEqual({
            capabilities: {
                features: ['bom_document_intake', 'sandbox']
            },
            hostState: {
                agent: {
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
        const definition = new AgentViewHostDefinition({} as any, {} as any, {} as any, volumeClient as any)

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
                isolateByUser: false
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
