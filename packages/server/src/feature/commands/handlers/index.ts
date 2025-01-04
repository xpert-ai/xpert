import { FeatureBulkCreateHandler } from './feature-bulk-create.handler';
import { FeatureToggleUpdateHandler } from './feature-toggle.update.handler';
import { FeatureUpgradeHandler } from './feature-upgrade.handler';

export const CommandHandlers = [FeatureToggleUpdateHandler, FeatureBulkCreateHandler, FeatureUpgradeHandler];
