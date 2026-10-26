jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { TaskControlModule, TaskControlStore } from '@xpert-ai/server-core'
import { SandboxRuntimeProviderRegistry } from '@xpert-ai/plugin-sdk'
import { SandboxModule } from '../sandbox.module'
import { SandboxJobControlService } from './sandbox-job-control.service'
import { SandboxJobControlStore } from './sandbox-job-control.store'
import { SandboxJobEntity } from './sandbox-job.entity'
import { VOLUME_CLIENT } from '../../shared/volume'

it('wires persistent Sandbox control through declared modules and concrete constructor dependencies', async () => {
    expect(Reflect.getMetadata('imports', SandboxModule)).toContain(TaskControlModule)
    expect(Reflect.getMetadata('providers', SandboxModule)).toEqual(
        expect.arrayContaining([SandboxJobControlStore, SandboxJobControlService])
    )
    @Global()
    @Module({
        providers: [{ provide: DataSource, useValue: { entityMetadatas: [], options: {}, getRepository: () => ({}) } }],
        exports: [DataSource]
    })
    class DatabaseTestModule {}
    const module = await Test.createTestingModule({
        imports: [DatabaseTestModule, TaskControlModule],
        providers: [
            SandboxJobControlStore,
            SandboxJobControlService,
            { provide: getRepositoryToken(SandboxJobEntity), useValue: {} },
            { provide: SandboxRuntimeProviderRegistry, useValue: {} },
            { provide: VOLUME_CLIENT, useValue: {} }
        ]
    }).compile()
    expect(module.get(TaskControlStore)).toBeInstanceOf(TaskControlStore)
    expect(module.get(SandboxJobControlService)).toBeInstanceOf(SandboxJobControlService)
    await module.close()
})
