import { ISemanticModel } from '@metad/contracts';
import { ICommand } from '@nestjs/cqrs';

export class UpdateXmlaCatalogContentCommand implements ICommand {
	static readonly type = '[Semantic Model] Update xmla catalog content';

	constructor(public readonly model: ISemanticModel) {}
}
