import { IKnowledgeDocument } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

export class KnowledgeDocLoadCommand implements ICommand {
	static readonly type = '[KnowledgeDocument] Load';

	constructor(public readonly input: { doc: IKnowledgeDocument }) {}
}
