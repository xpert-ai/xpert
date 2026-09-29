import { extractChatMessageTaskSummary } from './task-summary'

it('does not let a later skill observation hide an earlier explicit plan or output', () => {
    const plan = { title: 'Plan', excerpt: 'Work' }
    const output = {
        id: 'report',
        kind: 'document',
        title: 'Report',
        resource: { type: 'artifact', artifactId: 'report' }
    }
    const summary = extractChatMessageTaskSummary({
        content: [
            { type: 'component', data: { taskSummary: { version: 1, plan, outputs: [output] } } },
            {
                type: 'component',
                data: {
                    status: 'success',
                    taskSummary: {
                        version: 1,
                        skillUsages: [
                            {
                                skillId: 'research',
                                name: 'Research',
                                version: '1',
                                source: { type: 'workspace', id: 'w' },
                                activation: 'read',
                                toolCallId: 'call-1',
                                loadedAt: '2026-09-23T00:00:00.000Z'
                            }
                        ]
                    }
                }
            }
        ]
    })
    expect(summary.plan).toMatchObject(plan)
    expect(summary.outputs).toContainEqual(expect.objectContaining({ id: 'report' }))
    expect(summary.skillUsages).toHaveLength(1)
})
