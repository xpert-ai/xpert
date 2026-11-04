import { ExecutionContextLifecycleModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { AssistantPrincipalAccessService } from './assistant-principal-access.service'
import { ResolveAssistantPrincipalHandler } from './resolve-assistant-principal.handler'
import { ResolveAssistantModelHandler } from './resolve-assistant-model.command'

@Module({
    imports: [CqrsModule, ExecutionContextLifecycleModule],
    providers: [AssistantPrincipalAccessService, ResolveAssistantPrincipalHandler, ResolveAssistantModelHandler],
    exports: [AssistantPrincipalAccessService]
})
export class AssistantPrincipalModule {}
