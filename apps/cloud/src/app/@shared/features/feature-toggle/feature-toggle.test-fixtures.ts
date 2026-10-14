import {
  AiFeatureEnum,
  FeatureEnum,
  IFeature,
  IFeatureOrganization,
  LanguagesEnum,
  RequestScopeLevel
} from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject } from 'rxjs'
export const childFeature: IFeature = {
  id: 'feature-child',
  code: AiFeatureEnum.FEATURE_COPILOT,
  name: 'Copilot',
  description: 'Copilot feature'
}

export const parentFeature: IFeature = {
  id: 'feature-parent',
  code: AiFeatureEnum.FEATURE_XPERT,
  name: 'Xpert',
  description: 'Xpert feature',
  children: [childFeature]
}

export const xpertLeafFeature: IFeature = {
  id: 'feature-xpert',
  code: AiFeatureEnum.FEATURE_XPERT,
  name: 'Digital Expert',
  description: 'Digital expert feature'
}

export const legacyTopLevelXpertFeature: IFeature = {
  id: 'feature-legacy-xpert',
  code: AiFeatureEnum.FEATURE_XPERT,
  name: 'Xpert',
  description: 'Legacy top-level Xpert feature'
}

export const xpertClawxpertFeature: IFeature = {
  id: 'feature-xpert-clawxpert',
  code: AiFeatureEnum.FEATURE_XPERT_CLAWXPERT,
  name: 'ClawXpert',
  description: 'ClawXpert feature'
}

export const xpertFeatureGroup: IFeature = {
  id: 'feature-xpert-group',
  code: 'GROUP_XPERT',
  name: 'Xpert features',
  description: 'Xpert feature group',
  children: [xpertLeafFeature, xpertClawxpertFeature]
}

export const homeFeature: IFeature = {
  id: 'feature-home',
  code: FeatureEnum.FEATURE_HOME,
  name: 'Home',
  description: 'Home feature',
  children: [
    {
      id: 'feature-dashboard',
      code: FeatureEnum.FEATURE_DASHBOARD,
      name: 'Dashboard',
      description: 'Dashboard feature'
    }
  ]
}

export const organizationFeature: IFeature = {
  id: 'feature-organization',
  code: FeatureEnum.FEATURE_ORGANIZATION,
  name: 'Organization',
  description: 'Organization feature'
}

export const smtpFeature: IFeature = {
  id: 'feature-smtp',
  code: FeatureEnum.FEATURE_SMTP,
  name: 'Custom SMTP',
  description: 'Custom SMTP feature'
}

export const rolePermissionFeature: IFeature = {
  id: 'feature-role-permission',
  code: FeatureEnum.FEATURE_ROLES_PERMISSION,
  name: 'Role permission',
  description: 'Role permission feature'
}

export const integrationFeature: IFeature = {
  id: 'feature-integration',
  code: FeatureEnum.FEATURE_INTEGRATION,
  name: 'Integration',
  description: 'Integration feature'
}

export const referralFeature: IFeature = {
  id: 'feature-referral',
  code: FeatureEnum.FEATURE_REFERRAL,
  name: 'Invitation codes',
  description: 'Invitation code feature'
}

export const membershipPlanFeature: IFeature = {
  id: 'feature-membership-plan',
  code: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
  name: 'Membership plans',
  description: 'Membership plan feature'
}

export const membershipPurchaseFeature: IFeature = {
  id: 'feature-membership-purchase',
  code: AiFeatureEnum.FEATURE_MEMBERSHIP_PURCHASE,
  name: 'Membership purchase',
  description: 'Membership purchase feature'
}

export const customChildFeature: IFeature = {
  id: 'feature-custom-child',
  code: 'FEATURE_CUSTOM_CHILD',
  name: 'Custom child',
  description: 'Custom child feature'
}

export const customParentFeature: IFeature = {
  id: 'feature-custom-parent',
  code: 'FEATURE_CUSTOM_PARENT',
  name: 'Custom parent',
  description: 'Custom parent feature',
  children: [customChildFeature]
}

export const tenantFeatureOrganization: IFeatureOrganization = {
  id: 'tenant-feature',
  featureId: parentFeature.id,
  feature: parentFeature,
  isEnabled: true
}

export const childTenantFeatureOrganization: IFeatureOrganization = {
  id: 'tenant-feature-child',
  featureId: childFeature.id,
  feature: childFeature,
  isEnabled: true
}

export class MockFeatureService {
  parentFeaturesRequestCount = 0
  featureToggle = jest.fn(() => of(true))
  featuresToggle = jest.fn(() => of([true]))
  private readonly featureDefinitionsRefreshed = new Subject<void>()
  readonly featureDefinitionsRefreshed$ = this.featureDefinitionsRefreshed.asObservable()

  getParentFeatures() {
    this.parentFeaturesRequestCount += 1
    return of({ items: [parentFeature], total: 1 })
  }

  getFeatureOrganizations() {
    return of({ items: [], total: 0 })
  }

  notifyFeatureDefinitionsRefreshed() {
    this.featureDefinitionsRefreshed.next()
  }
}

export class MockStore {
  readonly selectedOrganization$ = new BehaviorSubject({ id: 'org-1', name: 'Org' })
  readonly featureTenant$: BehaviorSubject<IFeatureOrganization[]>
  readonly preferredLanguage$ = new BehaviorSubject(LanguagesEnum.Chinese)
  private readonly activeScope$ = new BehaviorSubject({
    level: RequestScopeLevel.ORGANIZATION,
    organizationId: 'org-1'
  })
  private _featureOrganizations: IFeatureOrganization[] | undefined
  featureOrganizationSetCount = 0

  constructor(
    featureOrganizations: IFeatureOrganization[] | undefined = [],
    featureTenant: IFeatureOrganization[] = [tenantFeatureOrganization, childTenantFeatureOrganization]
  ) {
    this._featureOrganizations = featureOrganizations
    this.featureTenant$ = new BehaviorSubject(featureTenant)
  }

  get featureOrganizations() {
    return this._featureOrganizations
  }

  set featureOrganizations(featureOrganizations: IFeatureOrganization[]) {
    this.featureOrganizationSetCount += 1
    this._featureOrganizations = featureOrganizations
  }

  get activeScope() {
    return this.activeScope$.value
  }

  selectActiveScope() {
    return this.activeScope$.asObservable()
  }

  set preferredLanguage(language: LanguagesEnum) {
    this.preferredLanguage$.next(language)
  }
}
