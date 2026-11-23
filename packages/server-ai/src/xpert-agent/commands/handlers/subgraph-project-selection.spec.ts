import { AIMessage } from '@langchain/core/messages'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createInputGraphFixture, config, input } from './subgraph-input.test-fixture'
import { ProjectMiddleware } from '../../../xpert-project/plugins/project/project.middleware'

describe('project selection in a compiled Agent graph', () => {
    afterEach(() => jest.restoreAllMocks())

    it('asks for a Project only on a tool decision, finishes the turn, and resumes with project tools', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
        const requestProjectSelection = jest.fn().mockResolvedValue(undefined)
        const fixture = createInputGraphFixture({
            additionalMiddlewareStrategies: [new ProjectMiddleware({ request: requestProjectSelection })]
        })
        const options = {
            inputMessageId: 'human'
        }
        const graph = await fixture.compile(options)
        fixture.model.mockResolvedValueOnce(new AIMessage('Group sales by region.'))
        await graph.invoke(input('Discuss the regional metrics first.'), config)
        expect(fixture.bindTools.mock.lastCall[0]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'test_operation' }),
                expect.objectContaining({ name: 'request_project_selection' })
            ])
        )
        expect(requestProjectSelection).not.toHaveBeenCalled()
        fixture.model.mockResolvedValueOnce(
            new AIMessage({ content: '', tool_calls: [{ id: 'picker', name: 'request_project_selection', args: {} }] })
        )
        await graph.invoke(input('Now make the dashboard.'), config)
        const saved = await graph.getState(config)
        expect(saved.next).toEqual([])
        expect(saved.tasks.flatMap((task) => task.interrupts)).toEqual([])
        expect(requestProjectSelection).toHaveBeenCalledTimes(1)
        expect(fixture.model).toHaveBeenCalledTimes(2)
        const inProject = await fixture.compile({ ...options, projectId: 'chosen-project' })
        fixture.model.mockResolvedValueOnce(
            new AIMessage({ content: '', tool_calls: [{ id: 'work', name: 'test_operation', args: {} }] })
        )
        await inProject.invoke(input('Now make the dashboard.'), config)
        expect(fixture.bindTools.mock.lastCall[0]).not.toContainEqual(
            expect.objectContaining({ name: 'request_project_selection' })
        )
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
        expect(requestProjectSelection).toHaveBeenCalledTimes(1)
    })

    it('delivers a tool-owned precondition to the model before it independently requests the picker', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
        const requestProjectSelection = jest.fn().mockResolvedValue(undefined)
        const fixture = createInputGraphFixture({
            additionalMiddlewareStrategies: [new ProjectMiddleware({ request: requestProjectSelection })]
        })
        fixture.toolRun.mockResolvedValueOnce('PROJECT_REQUIRED')
        const graph = await fixture.compile()
        fixture.model
            .mockResolvedValueOnce(
                new AIMessage({ content: '', tool_calls: [{ id: 'work', name: 'test_operation', args: {} }] })
            )
            .mockImplementationOnce(async (messages) => {
                expect(messages.at(-1)).toMatchObject({ name: 'test_operation', content: 'PROJECT_REQUIRED' })
                expect(requestProjectSelection).not.toHaveBeenCalled()
                return new AIMessage({
                    content: '',
                    tool_calls: [{ id: 'pick', name: 'request_project_selection', args: {} }]
                })
            })
        await graph.invoke(input('Make the dashboard.'), config)
        expect(fixture.toolRun).toHaveBeenCalledTimes(1)
        expect(requestProjectSelection).toHaveBeenCalledTimes(1)
    })

    it('does not inject project selection into an Assistant without the project middleware', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
        const fixture = createInputGraphFixture()
        const graph = await fixture.compile()
        await graph.invoke(input('hi'), config)
        expect(fixture.bindTools.mock.lastCall[0]).not.toContainEqual(
            expect.objectContaining({ name: 'request_project_selection' })
        )
    })
})
