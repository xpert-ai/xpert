import { buildMcpTaskStatusMessage } from './mcp-task-status'

describe('MCP Consumer task status messages', () => {
    const toolset = { id: 'toolset-1', name: 'Remote MCP' }
    const baseTask = {
        resultType: 'task' as const,
        taskId: 'task-1',
        status: 'working' as const,
        createdAt: '2026-08-21T01:00:00.000Z',
        lastUpdatedAt: '2026-08-21T01:00:01.000Z',
        ttlMs: 60_000
    }

    it('emits a stable running card with provider status and progress', () => {
        expect(
            buildMcpTaskStatusMessage({
                task: { ...baseTask, progress: 0.25, statusMessage: 'Indexed 25%' },
                toolset,
                serverName: 'generic',
                toolName: 'index'
            })
        ).toMatchObject({
            id: 'mcp-task:task-1',
            category: 'Tool',
            type: 'tasks',
            message: 'Indexed 25%',
            status: 'running',
            data: {
                taskId: 'task-1',
                serverName: 'generic',
                toolName: 'index',
                status: 'working',
                progress: 0.25
            }
        })
    })

    it.each([
        ['input_required', 'running', false],
        ['completed', 'success', true],
        ['failed', 'fail', true],
        ['cancelled', 'fail', true]
    ] as const)('maps %s to the ChatKit step status %s', (taskStatus, stepStatus, terminal) => {
        const message = buildMcpTaskStatusMessage({
            task: { ...baseTask, status: taskStatus },
            toolset,
            serverName: 'generic',
            toolName: 'index'
        })

        expect(message.status).toBe(stepStatus)
        expect(message.message).toBeTruthy()
        expect(Boolean(message.end_date)).toBe(terminal)
    })
})
