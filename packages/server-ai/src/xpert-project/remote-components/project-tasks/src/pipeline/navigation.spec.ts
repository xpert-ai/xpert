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

it('does not send a resolved workspace to the host after its node is deselected', async () => {
    let resolveTarget!: (value: unknown) => void
    call.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                resolveTarget = resolve
            })
    )
    const controller = new AbortController()
    const opening = openProjectWorkspace(
        projectId,
        'application',
        'Unavailable',
        projectId,
        undefined,
        undefined,
        controller.signal
    )
    controller.abort()
    resolveTarget({ success: true, data: target })
    await opening
    expect(call.mock.calls.map(([type]) => type)).toEqual(['executeAction'])
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

it('hands off only the same instance, round and node to the Project route when changing Assistants', async () => {
    const instanceId = '00000000-0000-4000-8000-000000000001'
    const roundId = '00000000-0000-4000-8000-000000000002'
    const nodeId = '00000000-0000-4000-8000-000000000003'
    const entry = {
        target: 'project.application',
        projectId,
        pipelineInstanceId: instanceId,
        pipelineRoundId: roundId,
        pipelineNodeId: nodeId
    }
    call.mockImplementation(async (type) =>
        type === 'executeAction' ? { success: true, data: entry } : { success: true }
    )
    await openProjectWorkspace(projectId, 'application', 'Unavailable', nodeId, instanceId, roundId)
    expect(call).toHaveBeenLastCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: entry
    })
    call.mockClear()
    await expect(
        openProjectWorkspace(projectId, 'application', 'Unavailable', nodeId, instanceId, nodeId)
    ).rejects.toThrow('Unavailable')
    expect(call).toHaveBeenCalledTimes(1)
})
