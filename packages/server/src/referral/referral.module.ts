import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule } from '../core'
import { FeatureOrganization } from '../feature/feature-organization.entity'
import { ReferralCode } from './referral-code.entity'
import { ReferralController } from './referral.controller'
import { ReferralRelation } from './referral-relation.entity'
import { ReferralService } from './referral.service'
import { ReferralValidationRateLimitService } from './referral-validation-rate-limit.service'

@Module({
	imports: [TypeOrmModule.forFeature([ReferralCode, ReferralRelation, FeatureOrganization]), RedisModule, CqrsModule],
	controllers: [ReferralController],
	providers: [ReferralService, ReferralValidationRateLimitService],
	exports: [ReferralService]
})
export class ReferralModule {}
