import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const DRAFT_FILE_STORAGE_PLUGIN_NAME = '@xpert-ai/plugin-draft'
export const DRAFT_FILE_STORAGE_CONFIG_NAMESPACE = 'plugins.file-storage.draft'

export const S3CompatibleProviderConfigSchema = z.object({
  rootPath: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  endpoint: z.string().optional(),
  publicUrl: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  signedUrlExpires: z.number().int().positive().optional()
})

export const OssProviderConfigSchema = z.object({
  rootPath: z.string().optional(),
  accessKeyId: z.string().optional(),
  accessKeySecret: z.string().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  endpoint: z.string().optional(),
  publicUrl: z.string().optional()
})

export const DraftFileStoragePluginConfigSchema = z.object({
  minio: S3CompatibleProviderConfigSchema.optional(),
  rustfs: S3CompatibleProviderConfigSchema.optional(),
  s3: S3CompatibleProviderConfigSchema.optional(),
  wasabi: S3CompatibleProviderConfigSchema.optional(),
  oss: OssProviderConfigSchema.optional()
})

export type S3CompatibleProviderConfig = z.infer<typeof S3CompatibleProviderConfigSchema>
export type OssProviderConfig = z.infer<typeof OssProviderConfigSchema>
export type DraftFileStoragePluginConfig = z.infer<typeof DraftFileStoragePluginConfigSchema>

function createS3CompatibleProviderFormSchema(title: {
  en_US: string
  zh_Hans: string
}): JsonSchemaObjectType & Record<string, any> {
  return {
    type: 'object',
    title,
    properties: {
      endpoint: {
        type: 'string',
        title: {
          en_US: 'Endpoint',
          zh_Hans: '访问地址'
        },
        'x-ui': {
          span: 2
        }
      },
      bucket: {
        type: 'string',
        title: {
          en_US: 'Bucket',
          zh_Hans: 'Bucket'
        }
      },
      accessKeyId: {
        type: 'string',
        title: {
          en_US: 'Access Key ID',
          zh_Hans: 'Access Key ID'
        }
      },
      secretAccessKey: {
        type: 'string',
        title: {
          en_US: 'Secret Access Key',
          zh_Hans: 'Secret Access Key'
        },
        'x-ui': {
          component: 'password'
        }
      },
      region: {
        type: 'string',
        title: {
          en_US: 'Region',
          zh_Hans: '区域'
        },
        default: 'us-east-1'
      },
      publicUrl: {
        type: 'string',
        title: {
          en_US: 'Public URL',
          zh_Hans: '公开访问地址'
        },
        'x-ui': {
          span: 2
        }
      },
      rootPath: {
        type: 'string',
        title: {
          en_US: 'Root Path',
          zh_Hans: '根路径'
        }
      },
      forcePathStyle: {
        type: 'boolean',
        title: {
          en_US: 'Force Path Style',
          zh_Hans: '启用 Path Style'
        }
      },
      signedUrlExpires: {
        type: 'number',
        title: {
          en_US: 'Signed URL TTL (seconds)',
          zh_Hans: '签名 URL 过期时间（秒）'
        },
        default: 3600
      }
    }
  }
}

function createOssProviderFormSchema(title: {
  en_US: string
  zh_Hans: string
}): JsonSchemaObjectType & Record<string, any> {
  return {
    type: 'object',
    title,
    properties: {
      endpoint: {
        type: 'string',
        title: {
          en_US: 'Endpoint',
          zh_Hans: '访问地址'
        },
        'x-ui': {
          span: 2
        }
      },
      bucket: {
        type: 'string',
        title: {
          en_US: 'Bucket',
          zh_Hans: 'Bucket'
        }
      },
      accessKeyId: {
        type: 'string',
        title: {
          en_US: 'Access Key ID',
          zh_Hans: 'Access Key ID'
        }
      },
      accessKeySecret: {
        type: 'string',
        title: {
          en_US: 'Access Key Secret',
          zh_Hans: 'Access Key Secret'
        },
        'x-ui': {
          component: 'password'
        }
      },
      region: {
        type: 'string',
        title: {
          en_US: 'Region',
          zh_Hans: '区域'
        }
      },
      publicUrl: {
        type: 'string',
        title: {
          en_US: 'Public URL',
          zh_Hans: '公开访问地址'
        },
        'x-ui': {
          span: 2
        }
      },
      rootPath: {
        type: 'string',
        title: {
          en_US: 'Root Path',
          zh_Hans: '根路径'
        }
      }
    }
  }
}

export const DraftFileStoragePluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    minio: createS3CompatibleProviderFormSchema({
      en_US: 'MinIO',
      zh_Hans: 'MinIO'
    }),
    rustfs: createS3CompatibleProviderFormSchema({
      en_US: 'RustFS',
      zh_Hans: 'RustFS'
    }),
    s3: createS3CompatibleProviderFormSchema({
      en_US: 'Amazon S3',
      zh_Hans: 'Amazon S3'
    }),
    wasabi: createS3CompatibleProviderFormSchema({
      en_US: 'Wasabi',
      zh_Hans: 'Wasabi'
    }),
    oss: createOssProviderFormSchema({
      en_US: 'Alibaba Cloud OSS',
      zh_Hans: '阿里云 OSS'
    })
  }
}
