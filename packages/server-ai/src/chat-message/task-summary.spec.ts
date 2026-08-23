import type { IChatMessage } from '@xpert-ai/contracts'
import { extractChatMessageTaskSummary } from './task-summary'

describe('extractChatMessageTaskSummary', () => {
    it('extracts proposed plans and structured todos with message locations', () => {
        const summary = extractChatMessageTaskSummary(
            message({
                content: [
                    {
                        type: 'text',
                        text: '<proposed_plan>\n# Ship task summary\nImplement the six sections.\n</proposed_plan>'
                    },
                    {
                        id: 'todos-1',
                        type: 'component',
                        data: {
                            tool: 'write_todos',
                            title: 'Implementation',
                            input: {
                                todos: [
                                    { content: 'Add contracts', status: 'completed' },
                                    { content: 'Add UI', status: 'in_progress' }
                                ]
                            }
                        }
                    }
                ]
            })
        )

        expect(summary.plan).toMatchObject({
            title: 'Ship task summary',
            messageId: 'message-1'
        })
        expect(summary.todos).toEqual({
            componentId: 'todos-1',
            title: 'Implementation',
            items: [
                { id: 'todo-1', content: 'Add contracts', status: 'completed' },
                { id: 'todo-2', content: 'Add UI', status: 'in_progress' }
            ],
            messageId: 'message-1',
            updatedAt: '2026-07-13T01:00:00.000Z'
        })
    })

    it('accepts versioned metadata and known output shapes only', () => {
        const summary = extractChatMessageTaskSummary(
            message({
                content: [
                    {
                        type: 'component',
                        data: {
                            taskSummary: {
                                version: 1,
                                outputs: [
                                    {
                                        id: 'output-1',
                                        kind: 'document',
                                        title: 'Report',
                                        resource: { type: 'artifact', artifactId: 'artifact-1' }
                                    },
                                    { id: 'unknown-1', kind: 'shell', title: 'Raw shell output', raw: 'secret' }
                                ]
                            },
                            artifact: {
                                id: 'artifact-2',
                                kind: 'html',
                                title: 'Preview site'
                            },
                            artifactLink: {
                                artifactId: 'artifact-3',
                                title: 'Linked artifact'
                            }
                        }
                    },
                    { type: 'image_url', image_url: { url: 'https://example.com/result.png' }, title: 'Result' },
                    { type: 'iframe', url: 'https://example.com/site', title: 'Site' },
                    { id: 'app-1', type: 'component', data: { type: 'McpApp', title: 'Interactive chart' } }
                ]
            })
        )

        expect(summary.outputs?.map((output) => output.id)).toEqual([
            'output-1',
            'artifact:artifact-2',
            'artifact:artifact-3',
            'image:https://example.com/result.png',
            'url:https://example.com/site',
            'mcp-app:app-1'
        ])
        expect(summary.outputs?.find((output) => output.id === 'output-1')?.resource).toEqual({
            type: 'artifact',
            artifactId: 'artifact-1'
        })
        expect(JSON.stringify(summary)).not.toContain('secret')
        expect(JSON.stringify(summary)).not.toContain('Raw shell output')
    })

    it('extracts generated files from artifact collections without exposing provider data', () => {
        const summary = extractChatMessageTaskSummary(
            message({
                content: [
                    {
                        type: 'component',
                        data: {
                            tool: 'video_generation_query',
                            artifact: {
                                files: [
                                    {
                                        fileName: 'generated-video.mp4',
                                        filePath: 'files/videos/generated-video.mp4',
                                        workspacePath: 'files/videos/generated-video.mp4',
                                        fileUrl: 'https://example.com/internal/generated-video.mp4?token=secret',
                                        mimeType: 'video/mp4'
                                    },
                                    {
                                        fileName: 'generated-video-cover.png',
                                        workspacePath: 'files/covers/generated-video-cover.png',
                                        url: 'https://provider.example.com/generated-video-cover.png?token=secret',
                                        mimeType: 'image/png'
                                    }
                                ],
                                data: {
                                    providerVideoUrl: 'https://provider.example.com/video.mp4?token=secret'
                                }
                            }
                        }
                    }
                ]
            })
        )

        expect(summary.outputs).toEqual([
            {
                id: 'artifact:files/videos/generated-video.mp4',
                kind: 'file',
                title: 'generated-video.mp4',
                resource: {
                    type: 'workspace_file',
                    workspacePath: 'files/videos/generated-video.mp4'
                },
                messageId: 'message-1',
                updatedAt: '2026-07-13T01:00:00.000Z'
            },
            {
                id: 'artifact:files/covers/generated-video-cover.png',
                kind: 'image',
                title: 'generated-video-cover.png',
                resource: {
                    type: 'workspace_file',
                    workspacePath: 'files/covers/generated-video-cover.png'
                },
                messageId: 'message-1',
                updatedAt: '2026-07-13T01:00:00.000Z'
            }
        ])
        expect(JSON.stringify(summary)).not.toContain('provider.example.com')
        expect(JSON.stringify(summary)).not.toContain('token=secret')
    })

    it('extracts structured artifacts returned by tools through output text', () => {
        const summary = extractChatMessageTaskSummary(
            message({
                content: [
                    {
                        type: 'component',
                        data: {
                            tool: 'drawio_publish_artifact_link',
                            output: JSON.stringify({
                                drawingId: 'drawing-1',
                                artifactId: 'artifact-drawio',
                                publicUrl: 'https://example.com/artifacts/share/secret'
                            })
                        }
                    },
                    {
                        type: 'component',
                        data: {
                            tool: 'export_report',
                            output: JSON.stringify({
                                files: [
                                    {
                                        fileName: 'report.pdf',
                                        workspacePath: 'files/report.pdf',
                                        mimeType: 'application/pdf'
                                    }
                                ]
                            })
                        }
                    }
                ]
            })
        )

        expect(summary.outputs).toMatchObject([
            {
                id: 'artifact:artifact-drawio',
                kind: 'site',
                title: 'draw.io diagram',
                resource: { type: 'artifact', artifactId: 'artifact-drawio' }
            },
            {
                id: 'artifact:files/report.pdf',
                kind: 'document',
                title: 'report.pdf',
                resource: { type: 'workspace_file', workspacePath: 'files/report.pdf' }
            }
        ])
        expect(JSON.stringify(summary)).not.toContain('example.com/artifacts/share/secret')
    })

    it('preserves element and file_element references and capability sources', () => {
        const summary = extractChatMessageTaskSummary(
            message({
                references: [
                    {
                        type: 'element',
                        id: 'element-1',
                        text: 'Submit button',
                        pageUrl: 'https://example.com/form',
                        pageTitle: 'Form',
                        attributes: [],
                        outerHtml: '<button>Submit</button>',
                        selector: '#submit',
                        serviceId: 'service-1',
                        tagName: 'button'
                    },
                    {
                        type: 'file_element',
                        id: 'file-element-1',
                        text: 'Revenue table',
                        filePath: '/workspace/report.xlsx',
                        documentTitle: 'Report',
                        attributes: [],
                        domPath: 'table/row',
                        outerHtml: '<tr />',
                        selector: 'tr',
                        sourceStartLine: 2,
                        sourceEndLine: 8,
                        tagName: 'tr'
                    }
                ],
                fileAssets: [{ id: 'file-1', originalName: 'brief.pdf', workspacePath: '/workspace/brief.pdf' }],
                thirdPartyMessage: {
                    runtimeCapabilities: {
                        skills: { ids: ['slides'] },
                        plugins: { ids: ['github'] },
                        subAgents: { nodeKeys: ['researcher'] }
                    }
                }
            })
        )

        expect(summary.sources?.map((source) => source.id)).toEqual([
            'element-1',
            'file-element-1',
            'attachment:file-1',
            'skill:slides',
            'plugin:github'
        ])
        expect(summary.sources?.[0]?.resource).toEqual({
            type: 'browser',
            serviceId: 'service-1',
            url: 'https://example.com/form'
        })
        expect(summary.sources?.[1]?.resource).toEqual({
            type: 'workspace_file',
            workspacePath: '/workspace/report.xlsx'
        })
    })

    it('marks messages with no known contribution without inferring paths or tool output', () => {
        const summary = extractChatMessageTaskSummary(
            message({
                content: [
                    { type: 'text', text: 'Created /tmp/result.txt' },
                    { type: 'component', data: { type: 'UnknownTool', output: '/tmp/result.txt' } }
                ]
            })
        )

        expect(summary).toEqual({ version: 1 })
    })
})

function message(
    partial: Partial<IChatMessage>
): Pick<
    IChatMessage,
    | 'id'
    | 'content'
    | 'references'
    | 'fileAssets'
    | 'attachments'
    | 'thirdPartyMessage'
    | 'taskSummary'
    | 'createdAt'
    | 'updatedAt'
> {
    return {
        id: 'message-1',
        createdAt: new Date('2026-07-13T00:00:00.000Z'),
        updatedAt: new Date('2026-07-13T01:00:00.000Z'),
        ...partial
    }
}
