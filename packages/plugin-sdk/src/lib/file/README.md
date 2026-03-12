# File Extension Guide

This folder contains the file-related extension points exposed by `plugin-sdk`.

## Purpose

Use this area when you want to extend file behavior without coupling business modules to each other.

There are two extension surfaces:

- `file-upload/`
  - use this when you need a new upload destination
- `file-storage/`
  - use this when you need a new storage backend

## Core model

Keep the model simple:

1. `IFileUploadTargetStrategy`
2. `IFileStorageProvider`

`IFileUploadTargetStrategy` is about destination behavior.

`IFileStorageProvider` is about byte storage behavior such as `putFile`, `getFile`, `url`, and `deleteFile`.

Avoid adding a second provider-like layer between these two unless there is a genuinely new responsibility.

## Configuration model for plugins

If a plugin needs user-managed configuration, expose it through the plugin's top-level `config` block:

- `config.schema`
  - zod schema for runtime validation
- `config.formSchema`
  - optional JSON schema for frontend forms

When `config.formSchema` is present, the host can automatically render a configuration dialog for installed plugins.

The host is also responsible for persisting plugin config and resolving the effective runtime config through its plugin config resolver.

## When to add a file upload target strategy

Create a target strategy when the destination has its own behavior or return shape.

Examples:

- upload to a sandbox workspace
- upload to a business volume
- upload to an archive system

Implementation steps:

1. implement `IFileUploadTargetStrategy`
2. decorate it with `@FileUploadTargetStrategy('your-target')`
3. register it in the owning Nest module
4. return a valid `IFileAssetDestination`

## When to add a file storage provider

Create a storage provider when you need a new backend.

Examples:

- MinIO
- RustFS
- Cloudflare R2
- Azure Blob Storage
- another S3-compatible service

Implementation steps:

1. implement `IFileStorageProvider`
2. decorate it with `@FileStorageProvider('YOUR_PROVIDER')`
3. register it in the owning module or plugin module
4. implement at least:
   - `putFile`
   - `getFile`
   - `url`
   - `deleteFile`

## Example provider plugin shape

```ts
import { JsonSchemaObjectType } from '@metad/contracts'
import { FileStorageProvider, IFileStorageProvider, XpertPlugin } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { z } from 'zod'

const ProviderConfigSchema = z.object({
  endpoint: z.string(),
  bucket: z.string()
})

const ProviderFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    endpoint: {
      type: 'string',
      title: {
        en_US: 'Endpoint'
      }
    },
    bucket: {
      type: 'string',
      title: {
        en_US: 'Bucket'
      }
    }
  },
  required: ['endpoint', 'bucket']
}

@Injectable()
@FileStorageProvider('R2')
export class R2Provider implements IFileStorageProvider {
  name = 'R2'
  config = { rootPath: '' }

  url(path: string) {
    return `https://r2.example.com/${path}`
  }

  path(path: string) {
    return path
  }

  handler() {
    return undefined
  }

  async getFile() {
    return Buffer.from('')
  }

  async putFile() {
    throw new Error('Not implemented')
  }

  async deleteFile() {}
}

export const plugin: XpertPlugin = {
  meta: {
    name: '@xpert-ai/plugin-r2',
    version: '0.0.1',
    level: 'organization',
    category: 'set',
    displayName: 'R2 File Storage',
    description: 'Provide an R2-backed file storage provider',
    author: 'XpertAI Team'
  },
  config: {
    schema: ProviderConfigSchema,
    formSchema: ProviderFormSchema
  },
  register(ctx) {
    return {
      module: class {},
      global: true,
      providers: [R2Provider]
    }
  }
}
```

## Design guidance

- keep path normalization close to the writer
- preserve `originalName`, MIME type, and size when possible
- keep upload orchestration outside storage providers
- keep provider SDK specifics outside upload target strategies
- use `config.formSchema` when the plugin needs a good frontend editing experience

## Review checklist

Before merging a new file extension:

1. does it belong to `file-upload` or `file-storage`?
2. does it expose only one clear responsibility?
3. does it preserve compatibility with existing `FileAsset` and storage contracts?
4. does it need plugin configuration or persistence changes?
