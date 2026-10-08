import { Inject } from '@nestjs/common'
import { CommandHandler } from '@nestjs/cqrs'
import { ChatExecutionAdmissionService } from '../../../chat-conversation/chat-execution-admission.service'
import { XpertChatCommand } from '../chat.command'
import { XpertChatHandler } from './chat.handler'

@CommandHandler(XpertChatCommand)
export class AdmittedXpertChatHandler extends XpertChatHandler {
    @Inject(ChatExecutionAdmissionService) private readonly admission: ChatExecutionAdmissionService
    override execute(command: XpertChatCommand) {
        return this.admission.run(
            command.request,
            { ...command.options, automatic: command.options?.messageEnvelope?.source.type === 'runtime' },
            (id) =>
                super.execute(
                    new XpertChatCommand(command.request, {
                        ...command.options,
                        ...(id ? { execution: { ...command.options?.execution, id } } : {})
                    })
                )
        )
    }
}
