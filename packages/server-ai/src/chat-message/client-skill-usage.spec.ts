import { stripClientSkillContent, stripClientSkillSummary } from './client-skill-usage'
import { getMessageSkillUsages, type ChatSkillUsage } from '@xpert-ai/chatkit-types'

const usage: ChatSkillUsage = {
    skillId: 'research',
    name: 'Research',
    version: '1',
    source: { type: 'workspace', id: 'workspace-1' },
    activation: 'read',
    toolCallId: 'call-1',
    loadedAt: '2026-09-23T00:00:00.000Z'
}

it('removes client-authored skill evidence while preserving unrelated summary and content', () => {
    const taskSummary = { version: 1 as const, skillUsages: [usage], plan: { title: 'Plan', excerpt: 'Work' } }
    const content = [{ type: 'component', data: { category: 'Tool', status: 'success', taskSummary } }]
    const sanitized = { taskSummary: stripClientSkillSummary(taskSummary), content: stripClientSkillContent(content) }
    expect(getMessageSkillUsages(sanitized)).toEqual([])
    expect(sanitized.taskSummary.plan).toEqual(taskSummary.plan)
    expect(stripClientSkillContent('Text')).toBe('Text')
    expect(taskSummary.skillUsages).toEqual([usage])
})
