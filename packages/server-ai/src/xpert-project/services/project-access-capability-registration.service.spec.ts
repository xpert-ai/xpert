import { ProjectAccessRuntimeCapability, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectAccessCapabilityRegistrationService } from './project-access-capability-registration.service'
import type { ProjectAccessRuntimeService } from './project-access-runtime.service'

describe('ProjectAccessCapabilityRegistrationService', () => {
    it('registers the Project-owned implementation in the shared capability registry', () => {
        const capabilities = { register: jest.fn() } as unknown as RuntimeCapabilityRegistry
        const projectAccess = {} as ProjectAccessRuntimeService
        const service = new ProjectAccessCapabilityRegistrationService(capabilities, projectAccess)

        service.onModuleInit()

        expect(capabilities.register).toHaveBeenCalledWith(ProjectAccessRuntimeCapability, projectAccess)
    })
})
