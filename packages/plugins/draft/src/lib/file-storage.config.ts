import { registerAs } from '@nestjs/config'
import {
  DRAFT_FILE_STORAGE_CONFIG_NAMESPACE,
  DraftFileStoragePluginConfig,
  OssProviderConfig,
  S3CompatibleProviderConfig
} from './file-storage.types'

const toBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value == null || value === '') {
    return defaultValue
  }

  return value === 'true'
}

const toNumber = (value: string | undefined, defaultValue: number) => {
  if (value == null || value === '') {
    return defaultValue
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : defaultValue
}

export const draftFileStoragePluginConfig = registerAs<DraftFileStoragePluginConfig>(
  DRAFT_FILE_STORAGE_CONFIG_NAMESPACE,
  () => ({
    ...readDraftFileStoragePluginEnvDefaults()
  })
)

export function readDraftFileStoragePluginEnvDefaults(): DraftFileStoragePluginConfig {
  return {
    minio: readMinioEnvDefaults(),
    rustfs: readRustfsEnvDefaults(),
    s3: readS3EnvDefaults(),
    wasabi: readWasabiEnvDefaults(),
    oss: readOssEnvDefaults()
  }
}

function readMinioEnvDefaults(): S3CompatibleProviderConfig {
  return {
    rootPath: process.env['MINIO_ROOT_PATH'] || '',
    accessKeyId:
      process.env['MINIO_ACCESS_KEY_ID'] || process.env['MINIO_ACCESS_KEY'] || process.env['MINIO_ROOT_USER'],
    secretAccessKey:
      process.env['MINIO_SECRET_ACCESS_KEY'] || process.env['MINIO_SECRET_KEY'] || process.env['MINIO_ROOT_PASSWORD'],
    region: process.env['MINIO_REGION'] || 'us-east-1',
    bucket: process.env['MINIO_BUCKET'],
    endpoint: process.env['MINIO_ENDPOINT'],
    publicUrl: process.env['MINIO_PUBLIC_URL'],
    forcePathStyle: toBoolean(process.env['MINIO_FORCE_PATH_STYLE'], true),
    signedUrlExpires: toNumber(process.env['MINIO_SIGNED_URL_EXPIRES'], 3600)
  }
}

function readS3EnvDefaults(): S3CompatibleProviderConfig {
  return {
    rootPath: process.env['S3_ROOT_PATH'] || process.env['AWS_ROOT_PATH'] || '',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    region: process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1',
    bucket: process.env['AWS_S3_BUCKET'] || process.env['S3_BUCKET'],
    endpoint: process.env['AWS_S3_ENDPOINT'] || process.env['AWS_ENDPOINT'] || process.env['S3_ENDPOINT'],
    publicUrl: process.env['AWS_PUBLIC_URL'] || process.env['S3_PUBLIC_URL'],
    forcePathStyle: toBoolean(process.env['AWS_FORCE_PATH_STYLE'] || process.env['S3_FORCE_PATH_STYLE'], false),
    signedUrlExpires: toNumber(process.env['AWS_SIGNED_URL_EXPIRES'] || process.env['S3_SIGNED_URL_EXPIRES'], 3600)
  }
}

function readRustfsEnvDefaults(): S3CompatibleProviderConfig {
  return {
    rootPath: process.env['RUSTFS_ROOT_PATH'] || '',
    accessKeyId: process.env['RUSTFS_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['RUSTFS_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'],
    region:
      process.env['RUSTFS_REGION'] || process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1',
    bucket: process.env['RUSTFS_BUCKET'] || process.env['AWS_S3_BUCKET'],
    endpoint: process.env['RUSTFS_ENDPOINT'] || process.env['AWS_S3_ENDPOINT'] || process.env['AWS_ENDPOINT'],
    publicUrl: process.env['RUSTFS_PUBLIC_URL'],
    forcePathStyle: toBoolean(process.env['RUSTFS_FORCE_PATH_STYLE'], true),
    signedUrlExpires: toNumber(process.env['RUSTFS_SIGNED_URL_EXPIRES'], 3600)
  }
}

function readWasabiEnvDefaults(): S3CompatibleProviderConfig {
  return {
    rootPath: process.env['WASABI_ROOT_PATH'] || '',
    accessKeyId: process.env['WASABI_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['WASABI_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'],
    region:
      process.env['WASABI_REGION'] || process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1',
    bucket: process.env['WASABI_BUCKET'] || process.env['AWS_S3_BUCKET'],
    endpoint: process.env['WASABI_ENDPOINT'] || process.env['AWS_S3_ENDPOINT'] || process.env['AWS_ENDPOINT'],
    publicUrl: process.env['WASABI_PUBLIC_URL'],
    forcePathStyle: toBoolean(process.env['WASABI_FORCE_PATH_STYLE'], false),
    signedUrlExpires: toNumber(process.env['WASABI_SIGNED_URL_EXPIRES'], 3600)
  }
}

function readOssEnvDefaults(): OssProviderConfig {
  return {
    rootPath: process.env['OSS_ROOT_PATH'] || process.env['ALIYUN_ROOT_PATH'] || '',
    accessKeyId: process.env['ALIYUN_ACCESS_KEY_ID'],
    accessKeySecret: process.env['ALIYUN_ACCESS_KEY_SECRET'],
    region: process.env['ALIYUN_REGION'],
    bucket: process.env['ALIYUN_OSS_BUCKET'] || process.env['OSS_BUCKET'],
    endpoint: process.env['ALIYUN_OSS_ENDPOINT'] || process.env['OSS_ENDPOINT'],
    publicUrl: process.env['ALIYUN_OSS_PUBLIC_URL'] || process.env['ALIYUN_PUBLIC_URL'] || process.env['OSS_PUBLIC_URL']
  }
}
