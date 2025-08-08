import { IKnowledgeDocument } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

/**
 * Load knowledge document entity as langchain Document objects.
 */
export class KnowledgeDocLoadCommand implements ICommand {
	static readonly type = '[KnowledgeDocument] Load';

	constructor(public readonly input: { doc: IKnowledgeDocument }) {}
}
