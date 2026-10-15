import { createTemplateSubagentsMiddleware, templateSubagentToolName } from './template-subagents.middleware'
import type { RuntimeTemplateDescriptor } from '../../agent-plugin/templates/runtime-template'
import { XpertParameterTypeEnum } from '@xpert-ai/contracts'

const template: RuntimeTemplateDescriptor = {
    kind: 'agent_plugin_template',
    bindingId: 'binding',
    version: 'v1',
    packageName: 'review',
    digest: 'digest',
    templateKey: 'reviewer',
    title: 'Reviewer',
    description: 'Review work',
    parameters: [{ name: 'caseId', type: XpertParameterTypeEnum.STRING }]
}

describe('template subagent middleware', () => {
    it('only declares tools until the model invokes one and validates template parameters', async () => {
        const execute = jest.fn().mockResolvedValue('reviewed')
        const middleware = createTemplateSubagentsMiddleware([template], execute)
        expect(execute).not.toHaveBeenCalled()
        await expect(middleware.tools[0].invoke({ input: 'review' })).rejects.toThrow()
        expect(await middleware.tools[0].invoke({ input: 'review', caseId: 'case-1' })).toBe('reviewed')
        expect(execute).toHaveBeenCalledWith(template, { input: 'review', caseId: 'case-1' }, expect.anything())
    })
    it('keeps tool identities stable and separates same-name templates and versions', () => {
        expect(templateSubagentToolName({ ...template, title: 'Translated' })).toBe(templateSubagentToolName(template))
        const names = [
            template,
            { ...template, templateKey: 'other' },
            { ...template, bindingId: 'other' },
            { ...template, version: 'v2' }
        ].map(templateSubagentToolName)
        expect(new Set(names).size).toBe(4)
        expect(names.every((name) => name.length <= 64)).toBe(true)
    })
    it('keeps structured template inputs and rejects extra runtime fields', async () => {
        const execute = jest.fn().mockResolvedValue('done')
        const middleware = createTemplateSubagentsMiddleware(
            [
                {
                    ...template,
                    parameters: [
                        { name: 'scores', type: XpertParameterTypeEnum.ARRAY_NUMBER },
                        { name: 'document', type: XpertParameterTypeEnum.FILE },
                        {
                            name: 'settings',
                            type: XpertParameterTypeEnum.OBJECT,
                            item: [{ name: 'enabled', type: XpertParameterTypeEnum.BOOLEAN }]
                        }
                    ]
                }
            ],
            execute
        )
        const args = {
            input: 'Review',
            scores: [1, 2],
            document: { filePath: 'report.md' },
            settings: { enabled: true }
        }
        expect(await middleware.tools[0].invoke(args)).toBe('done')
        await expect(middleware.tools[0].invoke({ ...args, sys: { profile: 'injected' } })).rejects.toThrow()
        await expect(middleware.tools[0].invoke({ ...args, scores: ['bad'] })).rejects.toThrow()
        expect(execute).toHaveBeenCalledTimes(1)
    })
})
