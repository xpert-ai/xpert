import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
export interface IScreenshot extends IBasePerTenantAndOrganizationEntityModel {
  file: string
  url?: string
  thumb?: string
  /**
   * @deprecated use url
   */
  fileUrl?: string
  thumbUrl?: string
  recordedAt?: Date
  size?: number
  storageProvider?: string
}

export interface IUpdateScreenshotInput extends ICreateScreenshotInput {
  id: string
}

export interface ICreateScreenshotInput extends IBasePerTenantAndOrganizationEntityModel {
  activityTimestamp: string
  employeeId?: string
  file: string
  thumb?: string
  recordedAt: Date | string
}
