import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, forwardRef, Inject, Injectable, Optional } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import type { Cache } from 'cache-manager'
import { t } from 'i18next'
import { IsNull, Repository } from 'typeorm'
import {
	AiFeatureEnum,
	IFeature,
	IFeatureOrganization,
	IFeatureOrganizationUpdateInput,
	ITenant
} from '@xpert-ai/contracts'
import { isNotEmpty } from '@xpert-ai/server-common'
import { TenantAwareCrudService } from './../core/crud'
import { RequestContext } from './../core/context'
import { FeatureOrganization } from './feature-organization.entity'
import { FeatureService } from './feature.service'
import { DEFAULT_FEATURES } from './default-features'
import { EVENT_FEATURE_ORGANIZATION_UPDATED, FeatureOrganizationUpdatedEvent } from './events'
import { touchCurrentUserFeatureTenantCacheVersion } from '../user/current-user-feature-cache'

function collectDefaultFeatureStates(features: IFeature[], states = new Map<string, boolean>()) {
	for (const feature of features) {
		states.set(feature.code, feature.isEnabled === true)
		if (feature.children?.length) {
			collectDefaultFeatureStates(feature.children, states)
		}
	}
	return states
}

const TENANT_ONLY_FEATURE_CODES = new Set<string>([
	AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
	AiFeatureEnum.FEATURE_MEMBERSHIP_PURCHASE
])

@Injectable()
export class FeatureOrganizationService extends TenantAwareCrudService<FeatureOrganization> {
	constructor(
		@InjectRepository(FeatureOrganization)
		public readonly featureOrganizationRepository: Repository<FeatureOrganization>,

		@Inject(forwardRef(() => FeatureService))
		private readonly _featureService: FeatureService,
		@Optional()
		@Inject(CACHE_MANAGER)
		private readonly cacheManager?: Cache,
		@Optional()
		private readonly eventEmitter?: EventEmitter2
	) {
		super(featureOrganizationRepository)
	}

	/**
	 * UPDATE feature organization respective tenant by feature id
	 *
	 * @param input
	 * @returns
	 */
	async updateFeatureOrganization(entity: IFeatureOrganizationUpdateInput): Promise<IFeatureOrganization[]> {
		const tenantId = RequestContext.currentTenantId()
		const { featureId, organizationId } = entity
		let feature: IFeature | undefined
		if (isNotEmpty(organizationId)) {
			feature = await this._featureService.findOne(featureId)
			if (TENANT_ONLY_FEATURE_CODES.has(feature.code)) {
				throw new BadRequestException(
					t('server-ai:Error.MembershipFeatureTenantScopeRequired', {
						defaultValue: 'This feature can only be configured at tenant scope.'
					})
				)
			}
		}
		const organizationScope = isNotEmpty(organizationId) ? { organizationId } : { organizationId: IsNull() }

		// find all feature organization by feature id
		const { items: featureOrganizations, total } = await this.findAll({
			where: {
				tenantId,
				featureId,
				...organizationScope
			}
		})
		const previousIsEnabled = featureOrganizations.some((item) => item.isEnabled === true)

		if (!total) {
			const featureOrganization: IFeatureOrganization = new FeatureOrganization().instanceOf({
				...entity,
				tenantId
			})
			await this.featureOrganizationRepository.save(featureOrganization)
		} else {
			featureOrganizations.map((item: IFeatureOrganization) => {
				return new FeatureOrganization(
					Object.assign(item, {
						...entity,
						tenantId
					})
				)
			})
			await this.featureOrganizationRepository.save(featureOrganizations)
		}
		await touchCurrentUserFeatureTenantCacheVersion(this.cacheManager, tenantId)
		if (previousIsEnabled !== entity.isEnabled) {
			feature ??= await this._featureService.findOne(featureId)
			this.eventEmitter?.emit(
				EVENT_FEATURE_ORGANIZATION_UPDATED,
				new FeatureOrganizationUpdatedEvent(
					tenantId,
					isNotEmpty(organizationId) ? organizationId : null,
					featureId,
					feature.code,
					previousIsEnabled,
					entity.isEnabled
				)
			)
		}
		return featureOrganizations
	}

	/**
	 * Create/Update feature organization for relative tenants
	 *
	 * @param tenants
	 * @returns
	 */
	public async updateTenantFeatureOrganizations(tenants: ITenant[]): Promise<IFeatureOrganization[]> {
		if (!tenants.length) {
			return
		}

		const featureOrganizations: IFeatureOrganization[] = []
		const defaultFeatureStates = collectDefaultFeatureStates(DEFAULT_FEATURES)
		const { items } = await this._featureService.findAll({
			relations: ['children']
		})
		const features: IFeature[] = items.filter((feature) => !feature.children?.length)

		for await (const feature of features) {
			for await (const tenant of tenants) {
				const featureOrganization: IFeatureOrganization = new FeatureOrganization({
					isEnabled: defaultFeatureStates.get(feature.code) === true,
					tenant,
					feature
				})
				featureOrganizations.push(featureOrganization)
			}
		}
		const saved = await this.featureOrganizationRepository.save(featureOrganizations)
		await Promise.all(
			tenants.map((tenant) => touchCurrentUserFeatureTenantCacheVersion(this.cacheManager, tenant.id))
		)
		return saved
	}
}
