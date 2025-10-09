import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from '@nestjs/core';
import { Feature } from './feature.entity';
import { FeatureOrganization } from './feature-organization.entity';
import { FeatureToggleController } from './feature-toggle.controller';
import { FeatureService } from './feature.service';
import { FeatureOrganizationService } from './feature-organization.service';
import { TenantModule } from '../tenant/tenant.module';
import { CommandHandlers } from './commands/handlers';
import { FeatureController } from './feature.controller';

@Module({
	imports: [
		RouterModule.register([
			{ path: '/feature', module: FeatureModule },
		]),
		TypeOrmModule.forFeature([Feature, FeatureOrganization]),
		forwardRef(() => TenantModule),
		CqrsModule
	],
	controllers: [FeatureController, FeatureToggleController],
	providers: [FeatureService, FeatureOrganizationService, ...CommandHandlers],
	exports: [FeatureService, FeatureOrganizationService]
})
export class FeatureModule {}
