import { request } from '../bridge'
import { openProjectWorkspace } from './navigation'
jest.mock('../bridge', () => ({ request: jest.fn() }))
const call = jest.mocked(request)
const projectId = '37b93e60-5d40-4776-9928-05e9bb4acaf5'
const target = {
    target: 'workbench.view',
    projectId,
    xpertId: 'assistant',
    viewKey: 'registered__review',
    selectionId: 'review'
}
beforeEach(() => {
    call.mockReset()
    call.mockImplementation(async (type) =>
        type === 'executeAction' ? { success: true, data: target } : { success: true }
    )
})

it('sends only the Project identity and a typed destination and requires host acknowledgement', async () => {
    await openProjectWorkspace(projectId, 'application', 'Unavailable')
    expect(call).toHaveBeenNthCalledWith(1, 'executeAction', { actionKey: 'workspace-target', input: {} })
    expect(call).toHaveBeenLastCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: target
    })
    call.mockResolvedValue({ success: false, code: 'forbidden' })
    await expect(openProjectWorkspace(projectId, 'pipelines', 'Unavailable')).rejects.toThrow('Unavailable')
    call.mockResolvedValue({ status: 'opened' })
    await expect(openProjectWorkspace(projectId, 'pipelines', 'Unavailable')).rejects.toThrow('Unavailable')
})

it('rejects a URL or non-Project value before invoking the host', async () => {
    call.mockClear()
    await expect(openProjectWorkspace('https://example.com', 'application', 'Unavailable')).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
})

it('sends a validated node identity without client-chosen view parameters', async () => {
    await openProjectWorkspace(projectId, 'application', 'Unavailable', projectId)
    expect(call).toHaveBeenNthCalledWith(1, 'executeAction', {
        actionKey: 'workspace-target',
        input: { pipelineNodeId: projectId }
    })
    expect(call).toHaveBeenLastCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: target
    })
    await expect(openProjectWorkspace(projectId, 'application', 'Unavailable', '../other')).rejects.toThrow()
    await expect(openProjectWorkspace(projectId, 'pipelines', 'Unavailable', projectId)).rejects.toThrow()
})

it('never forwards an unacknowledged, foreign or external application destination', async () => {
    for (const data of [
        { ...target, projectId: '00000000-0000-4000-8000-000000000001' },
        { target: 'project.application', projectId },
        { ...target, viewKey: '' }
    ]) {
        call.mockClear()
        call.mockResolvedValue({ success: true, data })
        await expect(openProjectWorkspace(projectId, 'application', 'Unavailable')).rejects.toThrow()
        expect(call).toHaveBeenCalledTimes(1)
    }
})

it('preserves the selected historical round through the authorized business View entry', async () => {
    const parameters = { pipelineInstanceId: projectId, pipelineRoundId: projectId }
    const entry = { ...target, parameters }
    call.mockImplementation(async (type) =>
        type === 'executeAction' ? { success: true, data: entry } : { success: true }
    )
    await openProjectWorkspace(projectId, 'application', 'Unavailable', undefined, projectId, projectId)
    expect(call).toHaveBeenNthCalledWith(1, 'executeAction', {
        actionKey: 'workspace-target',
        input: { instanceId: projectId, roundId: projectId }
    })
    expect(call).toHaveBeenLastCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: entry
    })
})
