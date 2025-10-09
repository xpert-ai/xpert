import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { FileStorageProviderEnum } from './file-provider'
import { _TFile } from './types';

export type TFile = _TFile & {
  fileType?: string;
  contents?: string;
  description?: string;
  size?: number
  createdAt?: Date

  storageFileId?: string
}

export interface IStorageFile extends IBasePerTenantAndOrganizationEntityModel {
  file: string
  url?: string
  thumb?: string
  fileUrl?: string
  thumbUrl?: string
  originalName?: string
  encoding?: string
  size?: number
  mimetype?: string
  recordedAt?: Date
  storageProvider?: FileStorageProviderEnum
}

export interface ICreateStorageFileInput extends IBasePerTenantAndOrganizationEntityModel {
  activityTimestamp: string
  employeeId?: string
  file: string
  thumb?: string
  recordedAt: Date | string
}

export interface IUpdateStorageFileInput extends ICreateStorageFileInput {
  id: string
}

export type TFileDirectory = TFile & {
  fullPath?: string
  directory?: string
  hasChildren?: boolean
  children?: TFileDirectory[]
}