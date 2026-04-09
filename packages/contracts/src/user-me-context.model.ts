import { IFeatureOrganization } from './feature.model'

export interface IUserMeOrganizationFeatures {
  organizationId: string
  featureOrganizations: IFeatureOrganization[]
}

export interface IUserMeFeatures {
  tenantFeatureOrganizations: IFeatureOrganization[]
  organizationFeatures: IUserMeOrganizationFeatures[]
}
