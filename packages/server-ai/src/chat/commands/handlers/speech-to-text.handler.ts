import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SpeechToTextCommand } from '../speed-to-text.command'
import { SpeechToTextService } from '../../speech-to-text.service'

@CommandHandler(SpeechToTextCommand)
export class SpeechToTextHandler implements ICommandHandler<SpeechToTextCommand> {
    constructor(private readonly speechToTextService: SpeechToTextService) {}

    public async execute(command: SpeechToTextCommand) {
        return this.speechToTextService.transcribeUploadedFile(command.file, command.options)
    }
}
