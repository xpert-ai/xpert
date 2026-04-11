import { ISemanticModelEntity } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class ModelEntityUpdateCommand implements ICommand {
	static readonly type = '[Semantic Model Entity] Update';

	constructor(public readonly input: ISemanticModelEntity) {}
}
