import { CqrsModule, CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ProjectConfigurationService } from '../../configuration/project-configuration.service'
import { ResolveProjectTaskDurationCommand } from '../resolve-project-task-duration.command'
import { ResolveProjectTaskDurationHandler } from './resolve-project-task-duration.handler'

describe('Project duration command wiring', () => {
    it('resolves via the registered handler and propagates revoked access', async () => {
        const result = { projectType: { applicationKey: 'platform', projectTypeKey: 'general' }, configurationRevision: 0 }
        const configurations = { taskDuration: jest.fn().mockResolvedValue(result) }
        const module = await Test.createTestingModule({ imports: [CqrsModule.forRoot()], providers: [
            ResolveProjectTaskDurationHandler, { provide: ProjectConfigurationService, useValue: configurations }
        ] }).compile()
        await module.init()
        try {
            const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
            const command = new ResolveProjectTaskDurationCommand('project', actor)
            expect(await module.get(CommandBus).execute(command)).toEqual(result)
            expect(configurations.taskDuration).toHaveBeenCalledWith('project', actor)
            configurations.taskDuration.mockRejectedValue(new Error('access revoked'))
            await expect(module.get(CommandBus).execute(command)).rejects.toThrow('access revoked')
        } finally { await module.close() }
    })
})
