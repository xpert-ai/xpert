import { request } from '../bridge'
import { openProjectWorkspace } from './navigation'
jest.mock('../bridge', () => ({ request: jest.fn() }))
const call = jest.mocked(request)
const projectId = '37b93e60-5d40-4776-9928-05e9bb4acaf5'

it('sends only the Project identity and a typed destination and requires host acknowledgement', async () => {
    call.mockResolvedValue({ success: true })
    await openProjectWorkspace(projectId, 'application', 'Unavailable')
    expect(call).toHaveBeenLastCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: { target: 'project.application', projectId }
    })
    call.mockResolvedValue({ success: false, code: 'forbidden' })
    await expect(openProjectWorkspace(projectId, 'pipelines', 'Unavailable')).rejects.toThrow('Unavailable')
    call.mockResolvedValue({ status: 'opened' })
    await expect(openProjectWorkspace(projectId, 'application', 'Unavailable')).rejects.toThrow('Unavailable')
})

it('rejects a URL or non-Project value before invoking the host', async () => {
    call.mockClear()
    await expect(openProjectWorkspace('https://example.com', 'application', 'Unavailable')).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
})

it('sends a validated node identity without client-chosen view parameters', async () => {
    call.mockResolvedValue({ success: true })
    await openProjectWorkspace(projectId, 'application', 'Unavailable', projectId)
    expect(call).toHaveBeenLastCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: { target: 'project.application', projectId, pipelineNodeId: projectId }
    })
    await expect(openProjectWorkspace(projectId, 'application', 'Unavailable', '../other')).rejects.toThrow()
    await expect(openProjectWorkspace(projectId, 'pipelines', 'Unavailable', projectId)).rejects.toThrow()
})
