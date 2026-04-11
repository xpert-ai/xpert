import { ILanguage } from '@xpert-ai/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { LanguageService } from '../../language.service'
import { LanguageInitCommand } from '../language-init.command'

@CommandHandler(LanguageInitCommand)
export class LanguageInitHandler implements ICommandHandler<LanguageInitCommand> {
	constructor(private readonly languageService: LanguageService) {}

	public async execute(command: LanguageInitCommand): Promise<ILanguage[]> {
		// init languages globally
		return await this.languageService.initialize()
	}
}
