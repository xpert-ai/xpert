import { ICommand } from '@nestjs/cqrs';
import { IEmployeeCreateInput, LanguagesEnum } from '@xpert-ai/contracts';

export class EmployeeCreateCommand implements ICommand {
	static readonly type = '[Employee] Register';

	constructor(
		public readonly input: IEmployeeCreateInput,
		public readonly languageCode?: LanguagesEnum
	) {}
}
