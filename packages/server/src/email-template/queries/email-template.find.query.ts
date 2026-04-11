import { ICustomizeEmailTemplateFindInput, LanguagesEnum } from '@xpert-ai/contracts';
import { IQuery } from '@nestjs/cqrs';

export class FindEmailTemplateQuery implements IQuery {
	static readonly type = '[EmailTemplate] Find';

	constructor(
		public readonly input: ICustomizeEmailTemplateFindInput,
		public readonly themeLanguage: LanguagesEnum
	) {}
}
