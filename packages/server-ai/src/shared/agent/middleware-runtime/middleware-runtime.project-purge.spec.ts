import {
    DefaultRuntimeCapabilityRegistry,
    ProjectProvisioningRuntimeCapability,
    ConnectorRuntimeFactoryCapability,
    ActorTokenRuntimeFactoryCapability
} from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

it('inherits project provisioning registered after the Agent facade is constructed', async () => {
    const input = { projectId: 'project-1', xpertId: 'xpert-1' }
    const purge = jest.fn().mockResolvedValue({ projectId: input.projectId, deleted: true })
    const platform = new DefaultRuntimeCapabilityRegistry()
    const runtime = Reflect.construct(AgentMiddlewareRuntimeService, [
        {},
        { createScopedApi: () => ({}) },
        {},
        { createScopedApi: () => ({}) },
        { createScopedApi: () => ({}) },
        platform
    ]) as AgentMiddlewareRuntimeService
    platform.register(ConnectorRuntimeFactoryCapability, {
        createScopedApi: () => ({ getConnector: jest.fn() }),
        resolveSelectedRuntimeBindings: jest.fn()
    })
    platform.register(ActorTokenRuntimeFactoryCapability, { createScopedApi: () => ({ getToken: jest.fn() }) })
    const implementation = { ensure: jest.fn(), purge }
    platform.register(ProjectProvisioningRuntimeCapability, implementation)
    const capability = runtime.api.capabilities?.require(ProjectProvisioningRuntimeCapability)
    expect(capability).toBe(implementation)
    expect(await capability?.purge?.(input)).toEqual({ projectId: input.projectId, deleted: true })
    expect(purge).toHaveBeenCalledWith(input)

    const denied = new Error('Project purge denied')
    purge.mockRejectedValueOnce(denied)
    await expect(capability?.purge?.(input)).rejects.toBe(denied)
})
