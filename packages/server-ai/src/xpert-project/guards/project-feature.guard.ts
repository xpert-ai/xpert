import { AiFeatureEnum } from '@xpert-ai/contracts'
import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { toggleFeatures } from '@xpert-ai/server-config'
import { Repository } from 'typeorm'
import { Feature, FeatureOrganization } from '@xpert-ai/server-core'

@Injectable()
export class XpertProjectFeatureGuard implements CanActivate {
    constructor(
        @InjectRepository(FeatureOrganization)
        private readonly featureOrganizationRepository: Repository<FeatureOrganization>,
        @InjectRepository(Feature)
        private readonly featureRepository: Repository<Feature>
    ) {}

    async canActivate(): Promise<boolean> {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new ForbiddenException('Tenant context is required')
        }

        const [xpertFeature, projectFeature] = await Promise.all([
            this.featureRepository.findOne({ where: { code: AiFeatureEnum.FEATURE_XPERT } }),
            this.featureRepository.findOne({ where: { code: AiFeatureEnum.FEATURE_XPERT_PROJECT } })
        ])
        if (toggleFeatures.FEATURE_XPERT === false || toggleFeatures.FEATURE_XPERT_PROJECT === false) {
            throw new ForbiddenException('Xpert Project feature is disabled')
        }
        if (xpertFeature?.isEnabled === false || projectFeature?.isEnabled === false) {
            throw new ForbiddenException('Xpert Project feature is disabled')
        }
        if (!projectFeature) {
            // A fresh installation may not have completed feature seeding yet.
            // The environment toggle remains the source of the default state.
            return true
        }

        const organizationId = RequestContext.getOrganizationId()
        const organizationToggle = organizationId
            ? await this.featureOrganizationRepository
                  .createQueryBuilder('toggle')
                  .innerJoin('toggle.feature', 'feature')
                  .where('toggle.tenantId = :tenantId', { tenantId })
                  .andWhere('toggle.organizationId = :organizationId', { organizationId })
                  .andWhere('feature.id = :featureId', { featureId: projectFeature.id })
                  .getOne()
            : null

        const toggle =
            organizationToggle ??
            (await this.featureOrganizationRepository
                .createQueryBuilder('toggle')
                .where('toggle.tenantId = :tenantId', { tenantId })
                .andWhere('toggle.organizationId IS NULL')
                .andWhere('toggle.featureId = :featureId', { featureId: projectFeature.id })
                .getOne())

        if (toggle && toggle.isEnabled === false) {
            throw new ForbiddenException('Xpert Project feature is disabled')
        }
        return true
    }
}
