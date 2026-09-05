import { DefaultRuntimeCapabilityRegistry, ProjectProvisioningRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { XpertProjectPurgeService } from '../../../xpert-project/services/project-purge.service'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

it('preserves project purge delegation after splitting the runtime facade', async () => {
    const input = { projectId: 'project-1', xpertId: 'xpert-1' }
    const purge = jest.fn().mockResolvedValue({ projectId: input.projectId, deleted: true })
    const moduleRef = { get: jest.fn().mockReturnValue({ purge }) }
    const runtime = Reflect.construct(AgentMiddlewareRuntimeService, [
        {},
        {},
        {},
        {},
        { createScopedRuntimeApi: () => ({}) },
        {},
        { createScopedApi: () => ({}) },
        { createScopedApi: () => ({}) },
        moduleRef,
        new DefaultRuntimeCapabilityRegistry([])
    ]) as AgentMiddlewareRuntimeService
    const capability = runtime.api.capabilities?.require(ProjectProvisioningRuntimeCapability)
    expect(await capability?.purge?.(input)).toEqual({ projectId: input.projectId, deleted: true })
    expect(moduleRef.get).toHaveBeenCalledWith(XpertProjectPurgeService, { strict: false })
    expect(purge).toHaveBeenCalledWith(input)

    const denied = new Error('Project purge denied')
    purge.mockRejectedValueOnce(denied)
    await expect(capability?.purge?.(input)).rejects.toBe(denied)
})
