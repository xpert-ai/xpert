import { AgentInvocationsController } from './invocations.controller'
import { AssistantTaskRuntimeStrategy } from './assistant-task-adapter'
import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { AgentRuntimeRegistry } from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from './invocation-runtime'
import { AgentInvocationStore } from './invocation-store'
import { AgentInvocationEntity, AgentRuntimeBindingEntity, AgentInvocationEventEntity } from './invocation.entity'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { AgentRuntimeBindingsController } from './runtime-bindings.controller'
import { NativeAgentRuntimeStrategy } from './native-agent.strategy'
import { TypeOrmAgentInvocationStore } from './typeorm-invocation.store'
import { NativeAgentInvocationReader } from './native-invocation-reader'

@Module({
    imports: [
        DiscoveryModule,
        CqrsModule,
        TypeOrmModule.forFeature([AgentInvocationEntity, AgentRuntimeBindingEntity, AgentInvocationEventEntity])
    ],
    controllers: [AgentRuntimeBindingsController, AgentInvocationsController],
    providers: [
        AgentRuntimeRegistry,
        NativeAgentRuntimeStrategy,
        AssistantTaskRuntimeStrategy,
        AgentInvocationFactoryService,
        NativeAgentInvocationReader,
        { provide: AgentInvocationStore, useClass: TypeOrmAgentInvocationStore },
        {
            provide: AgentInvocationRuntime,
            inject: [AgentInvocationStore, AgentRuntimeRegistry],
            useFactory: (store: AgentInvocationStore, registry: AgentRuntimeRegistry) =>
                new AgentInvocationRuntime(store, registry)
        }
    ],
    exports: [AgentInvocationRuntime, AgentRuntimeRegistry]
})
export class AgentInvocationModule {}
