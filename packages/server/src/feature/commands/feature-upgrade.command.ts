import { ICommand } from '@nestjs/cqrs';

export class FeatureUpgradeCommand implements ICommand {
	static readonly type = '[Feature] Upgrade';

	constructor(public readonly input: string) {}
}
