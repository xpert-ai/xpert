jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { TaskControlModule, TaskControlStore, REDIS_CLIENT } from '@xpert-ai/server-core'
import { DesktopShellModule } from './desktop-shell.module'
import { DesktopShellOperationService } from './desktop-shell-operation.service'
import { DesktopShellAuthService } from './desktop-shell-auth.service'

it('declares the control module and resolves the concrete store through constructor injection', async () => {
    expect(Reflect.getMetadata('imports', DesktopShellModule)).toContain(TaskControlModule)
    @Global()
    @Module({
        providers: [{ provide: DataSource, useValue: { entityMetadatas: [], options: {}, getRepository: () => ({}) } }],
        exports: [DataSource]
    })
    class DatabaseTestModule {}
    const module = await Test.createTestingModule({
        imports: [DatabaseTestModule, TaskControlModule],
        providers: [
            DesktopShellOperationService,
            { provide: DesktopShellAuthService, useValue: {} },
            { provide: REDIS_CLIENT, useValue: {} }
        ]
    }).compile()
    expect(module.get(TaskControlStore)).toBeInstanceOf(TaskControlStore)
    expect(module.get(DesktopShellOperationService)).toBeInstanceOf(DesktopShellOperationService)
    await module.close()
})
