import { MODULE_METADATA } from '@nestjs/common/constants'
import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { TaskControlModule, TaskControlStore } from '@xpert-ai/server-core'
import { ChatConversationModule } from '../conversation.module'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ThreadRecoveryService } from '../recovery/thread-recovery.service'
import { ExecutionControlModule } from '../../execution-control/execution-control.module'
import { ExecutionControlEvidenceService } from '../../execution-control/execution-control-evidence.service'
import { ThreadControlViewService } from './thread-control-view.service'
import { ReadThreadControlViewHandler } from './read-thread-control-view.handler'

it('registers one public query owner with explicit task/evidence dependencies', async () => {
    const providers: unknown[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatConversationModule)
    expect(providers.filter((provider) => provider === ReadThreadControlViewHandler)).toHaveLength(1)
    expect(providers).toContain(ThreadControlViewService)
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ChatConversationModule)).toEqual(
        expect.arrayContaining([TaskControlModule, ExecutionControlModule])
    )
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, ExecutionControlModule)).toContain(
        ExecutionControlEvidenceService
    )
    const module = await Test.createTestingModule({
        providers: [
            ThreadControlViewService,
            ReadThreadControlViewHandler,
            TaskControlStore,
            ExecutionControlEvidenceService,
            { provide: DataSource, useValue: {} },
            { provide: QueryBus, useValue: {} },
            { provide: ChatConversationThreadService, useValue: {} },
            { provide: ThreadRecoveryService, useValue: {} }
        ]
    }).compile()
    try {
        expect(module.get(ThreadControlViewService)).toBeInstanceOf(ThreadControlViewService)
    } finally {
        await module.close()
    }
})
