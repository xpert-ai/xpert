import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { SseStreamModule } from './stream.module'
import { RunStreamArchiveService } from './run-stream-archive.service'
import { RedisSseStreamService } from './redis-sse.service'

// Keep ordinary production provider registration, replacing only external infrastructure.
jest.mock('@xpert-ai/server-core', () => {
    const { Module } = jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common')
    const REDIS_CLIENT = 'TEST_REDIS'
    class RedisModule {}
    Module({ providers: [{ provide: REDIS_CLIENT, useValue: {} }], exports: [REDIS_CLIENT] })(RedisModule)
    return { RedisModule, REDIS_CLIENT, TenantOrganizationBaseEntity: class {} }
})
jest.mock('../execution/execution-cancel.module', () => {
    const { Module } = jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common')
    const { ExecutionCancelService } = jest.requireActual<typeof import('../execution/execution-cancel.service')>(
        '../execution/execution-cancel.service'
    )
    class ExecutionCancelModule {}
    Module({ providers: [{ provide: ExecutionCancelService, useValue: {} }], exports: [ExecutionCancelService] })(
        ExecutionCancelModule
    )
    return { ExecutionCancelModule }
})

@Global()
@Module({ providers: [{ provide: DataSource, useValue: {} }], exports: [DataSource] })
class DatabaseFixture {}

it('wires snapshot persistence, archival and the SSE reader through explicit providers', async () => {
    const module = await Test.createTestingModule({ imports: [DatabaseFixture, SseStreamModule] }).compile()
    expect(module.get(RedisSseStreamService)).toBeInstanceOf(RedisSseStreamService)
    expect(module.get(RunStreamArchiveService)).toBeInstanceOf(RunStreamArchiveService)
    await module.close()
})
