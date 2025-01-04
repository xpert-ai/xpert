import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { FeatureUpgradeCommand } from '../feature-upgrade.command';
import { FeatureService } from '../../feature.service';

@CommandHandler(FeatureUpgradeCommand)
export class FeatureUpgradeHandler
	implements ICommandHandler<FeatureUpgradeCommand> {
	constructor(
		private readonly _featureService: FeatureService
	) {}

	public async execute(command: FeatureUpgradeCommand): Promise<any> {
		const { input } = command;

		return this._featureService.seedDB()
	}
}
