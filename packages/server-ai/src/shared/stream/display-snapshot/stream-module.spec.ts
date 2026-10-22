import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { SseStreamModule } from '../stream.module'
import { RedisSseStreamService } from '../redis-sse.service'
import { RunDisplaySnapshotStore } from './display-snapshot.store'

jest.mock('@xpert-ai/server-core', () => {
    const { Global, Module } = jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common')
    @Global()
    @Module({ providers: [{ provide: 'REDIS_CLIENT', useValue: {} }], exports: ['REDIS_CLIENT'] })
    class RedisModule {}
    return { REDIS_CLIENT: 'REDIS_CLIENT', RedisModule }
})
@Global()
@Module({ providers: [{ provide: DataSource, useValue: { query: jest.fn() } }], exports: [DataSource] })
class DatabaseModule {}

test('SseStreamModule wires the durable store through normal dependency injection', async () => {
    const module = await Test.createTestingModule({ imports: [DatabaseModule, SseStreamModule] }).compile()
    expect(module.get(RedisSseStreamService)).toBeInstanceOf(RedisSseStreamService)
    expect(module.get(RunDisplaySnapshotStore)).toBeInstanceOf(RunDisplaySnapshotStore)
    expect(module.get(REDIS_CLIENT)).toBeDefined()
    await module.close()
})
