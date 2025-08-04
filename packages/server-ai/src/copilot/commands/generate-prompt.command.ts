import { ICopilotModel } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class GeneratePromptCommand implements ICommand {
    static readonly type = '[Copilot] Generate Prompt'

    constructor(
        public readonly instruction: string,
        public readonly copilotModel: Partial<ICopilotModel>,
    ) {}
}
