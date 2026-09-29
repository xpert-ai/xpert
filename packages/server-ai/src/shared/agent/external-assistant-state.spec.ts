import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'
import { externalAssistantState } from './external-assistant-state'

describe('External Assistant state boundary', () => {
    it.each([
        { selectedSkillIds: ['parent-skill'], selectedSkillWorkspaceId: 'parent-workspace' },
        { selectedSkillIds: [] },
        { skillSelectionMode: 'workspace_blacklist', disabledSkillIds: ['role-skill'] }
    ])('does not inherit the caller skill selection %j', (selection) => {
        const parent = {
            ...selection,
            __start__: { ...selection, projectId: 'shared-project' },
            [STATE_VARIABLE_HUMAN]: { input: 'parent prompt', ...selection },
            input: 'parent prompt',
            messages: [],
            sys: { workspace_path: '/shared/project' },
            businessContext: { evidence: ['source-1'] }
        }
        const original = JSON.stringify(parent)
        const args = { taskId: 'task-1', input: 'read the assigned sources' }
        const child = externalAssistantState(parent as never, args)

        for (const key of Object.keys(selection)) {
            expect(child).not.toHaveProperty(key)
            expect(Reflect.get(child, '__start__')).not.toHaveProperty(key)
            expect(child[STATE_VARIABLE_HUMAN]).not.toHaveProperty(key)
        }
        expect(Reflect.get(child, '__start__')).toEqual({ projectId: 'shared-project' })
        expect(child[STATE_VARIABLE_HUMAN]).toEqual(args)
        expect(Reflect.get(child, 'businessContext')).toBe(parent.businessContext)
        expect(child.sys).toBe(parent.sys)
        expect(JSON.stringify(parent)).toEqual(original)
    })

    it('does not accept caller skill overrides supplied as delegated task arguments', () => {
        const child = externalAssistantState({ messages: [] } as never, {
            input: 'review',
            taskId: 'task-2',
            selectedSkillIds: ['foreign-skill'],
            selectedSkillWorkspaceId: 'foreign-workspace'
        })
        expect(child).not.toHaveProperty('selectedSkillIds')
        expect(child).not.toHaveProperty('selectedSkillWorkspaceId')
        expect(child[STATE_VARIABLE_HUMAN]).toEqual({ input: 'review', taskId: 'task-2' })
    })
})
