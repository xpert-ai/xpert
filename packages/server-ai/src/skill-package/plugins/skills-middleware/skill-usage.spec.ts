import { getSkillUsageSummary, registerSkillUsages, skillReadResult, readSkillUsageArtifact } from './skill-usage'

const skill = { id: 'skill', name: 'Research', version: '1', workspaceId: 'workspace', path: '/root/SKILL.md' }

it('uses explicit origins rather than names or paths', () => {
    const resources = [
        {
            id: 'plugin-skill',
            name: 'Personal',
            description: '',
            version: '1',
            rootPath: '/resources',
            runtimePath: 'whatever',
            origin: { type: 'plugin' as const, id: 'plugin' }
        }
    ]
    expect(
        registerSkillUsages(
            [
                skill,
                { ...skill, runtimeSource: 'project' },
                { ...skill, runtimeSource: 'xpert' },
                { ...skill, id: 'plugin-skill', name: 'Personal', runtimePath: 'whatever' },
                { ...skill, id: 'plugin-skill', runtimeSource: 'project', runtimePath: 'project/skill' },
                { ...skill, path: undefined }
            ],
            resources,
            { projectId: 'project', xpertId: 'assistant' }
        ).map((item) => item.source)
    ).toEqual([
        { type: 'workspace', id: 'workspace' },
        { type: 'project', id: 'project' },
        { type: 'assistant', id: 'assistant' },
        { type: 'plugin', id: 'plugin' },
        { type: 'project', id: 'project' }
    ])
})

it('cannot generate an observation without registered identity and a tool call', () => {
    const [registered] = registerSkillUsages([skill], [], {})
    expect(skillReadResult('content', registered, {})).toEqual(['content', undefined])
    expect(
        skillReadResult('content', undefined, { toolCall: { id: 'call', name: 'read_skill_file', args: {} } })
    ).toEqual(['content', undefined])
    expect(readSkillUsageArtifact({ type: 'other', usage: {} })).toBeUndefined()
    expect(readSkillUsageArtifact({ type: 'xpert_skill_usage', usage: {} })).toBeUndefined()
})

describe('skill usage summary from a tool completion', () => {
    const [registered] = registerSkillUsages([skill], [], {})
    const [, artifact] = skillReadResult('instructions', registered, {
        toolCall: { id: 'call', name: 'read_skill_file', args: {} }
    })
    const completion = { toolName: 'read_skill_file', toolCallId: 'call', failed: false, artifact }

    it('projects only allowlisted provenance into the message summary', () => {
        const usage = readSkillUsageArtifact(artifact)
        expect(
            getSkillUsageSummary({
                ...completion,
                artifact: { ...artifact, usage: { ...usage, path: '/private/SKILL.md', content: 'instructions' } }
            })
        ).toEqual({ version: 1, skillUsages: [usage] })
    })

    it.each([
        { toolName: 'another_tool' },
        { failed: true },
        { toolCallId: 'another_call' },
        { artifact: undefined },
        { artifact: { type: 'xpert_skill_usage', usage: {} } }
    ])('omits records that do not establish a successful matching skill read: %j', (fields) => {
        expect(getSkillUsageSummary({ ...completion, ...fields })).toBeUndefined()
    })
})
