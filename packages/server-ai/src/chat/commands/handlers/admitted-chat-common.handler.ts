import { Inject } from '@nestjs/common'
import { CommandHandler } from '@nestjs/cqrs'
import { ChatExecutionAdmissionService } from '../../../chat-conversation/chat-execution-admission.service'
import { ChatCommonCommand } from '../chat-common.command'
import { ChatCommonHandler } from './chat-common.handler'

@CommandHandler(ChatCommonCommand)
export class AdmittedChatCommonHandler extends ChatCommonHandler {
    @Inject(ChatExecutionAdmissionService) private readonly admission: ChatExecutionAdmissionService
    override execute(command: ChatCommonCommand) {
        return this.admission.run(
            command.request,
            { ...command.options, automatic: command.options?.messageEnvelope?.source.type === 'runtime' },
            (id) =>
                super.execute(
                    new ChatCommonCommand(command.request, {
                        ...command.options,
                        ...(id ? { execution: { id } } : {})
                    })
                )
        )
    }
}
