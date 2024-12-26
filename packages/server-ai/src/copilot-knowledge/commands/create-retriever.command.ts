import { ICommand } from '@nestjs/cqrs'
import { CopilotKnowledgeRetrieverOptions } from '../retriever'

export class CreateCopilotKnowledgeRetrieverCommand implements ICommand {
	static readonly type = '[Copilot Knowledge] Create retriever tool'

	constructor(public readonly options: CopilotKnowledgeRetrieverOptions) {}
}
