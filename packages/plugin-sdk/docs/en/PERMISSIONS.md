# Plugin Permission Design Guide

Declare model requirements in a strategy's `meta.permissions` and expose provider/model selection in `configSchema`. The host resolves the user's configuration and credentials, creates the appropriate model client, and injects it into `config.client` before calling `understandImages`.

The following design illustrates how `OpenAIGPT4VStrategy` can request a host-provided client instead of constructing its own OpenAI, Anthropic or other vision-model client.

## Strategy definition

```ts
import { Injectable } from '@nestjs/common'
import { Document } from 'langchain/document'
import {
  ImageUnderstandingStrategy,
  IImageUnderstandingStrategy,
  TImageUnderstandingFile,
  TImageUnderstandingResult
} from './strategy.interface'

@Injectable()
@ImageUnderstandingStrategy('openai-gpt4v')
export class OpenAIGPT4VStrategy implements IImageUnderstandingStrategy<any> {
  readonly meta = {
    name: 'openai-gpt4v',
    label: { en: 'OpenAI GPT-4 Vision' },

    /**
     * Declare the plugin's requirement for "llm" access,
     * with OpenAI as the provider and vision as the capability.
     * The host uses config.provider and config.model to create the client
     * and inject it into config.client.
     */
    permissions: [
      {
        type: 'llm',
        provider: 'openai',
        capability: 'vision'
      }
    ],

    /**
     * The configuration schema requires provider and model.
     * The host uses these settings and the user's API key
     * to create and inject the client.
     */
    configSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['openai'],
          description: 'Model provider'
        },
        model: {
          type: 'string',
          default: 'gpt-4-vision-preview',
          description: 'Model name'
        },
        prompt: {
          type: 'string',
          default: 'Describe this image in detail.',
          description: 'Prompt for the image understanding task'
        }
      },
      required: ['provider', 'model']
    },

    icon: {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="black" fill="none"/><text x="6" y="14">VLM</text></svg>',
      color: '#10a37f'
    }
  }

  async validateConfig(config: any): Promise<void> {
    if (!config.client) {
      throw new Error('Missing injected LLM client in config. Core system must inject client.')
    }
  }

  async understandImages(files: TImageUnderstandingFile[], config: any): Promise<TImageUnderstandingResult[]> {
    const client = config.client // Injected by the host.
    const results: TImageUnderstandingResult[] = []

    for (const file of files) {
      const description = await this.runGPT4V(client, file.path, config)

      const doc = new Document({
        pageContent: description,
        metadata: {
          chunkId: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parentChunkId: file.parentChunkId,
          imagePath: file.path,
          source: file.filename,
          type: 'vlm',
          engine: config.model
        }
      })

      results.push({
        docs: [doc],
        metadata: { engine: config.model, file: file.filename }
      })
    }

    return results
  }

  private async runGPT4V(client: any, imagePath: string, config: any): Promise<string> {
    // The host has already created this OpenAI client.
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: config.prompt || 'Describe this image in detail.' },
            { type: 'image_url', image_url: { url: imagePath } }
          ]
        }
      ],
      max_tokens: 500
    })

    return response.choices[0]?.message?.content || ''
  }
}
```

---

## Host processing

- Read the plugin's `meta.permissions` to identify the requirement:

  ```json
  { "type": "llm", "provider": "openai", "capability": "vision" }
  ```

- Use the user's `config.provider = "openai"` and `config.model = "gpt-4-vision-preview"`
  to instantiate `OpenAI({ apiKey: userApiKey })`.
- Inject the client into `config.client`.
- Call `strategy.understandImages(files, config)`.

---

## Usage example

```ts
const strategy = this.imageUnderstandingRegistry.get('openai-gpt4v')
const result = await strategy.understandImages(
  [
    {
      path: 'https://example.com/chart.png',
      filename: 'chart.png',
      extname: 'png',
      parentChunkId: 'uuid-123'
    }
  ],
  {
    provider: 'openai',
    model: 'gpt-4-vision-preview',
    prompt: 'Describe this image in detail in English.',
    client: openaiClient // Injected by the host.
  }
)

console.log(result[0].docs[0].pageContent)
```

---

The plugin declares its permission requirements and provider/model configuration; the host supplies the appropriate client without requiring plugin-specific OpenAI initialization logic.

A shared permission-request interface, such as `ILLMPermissionRequest`, can give OCR, vision-model and embedding plugins a common way to declare dependencies.

## Integration configuration reads

Resolve `INTEGRATION_PERMISSION_SERVICE_TOKEN` through `PluginContext.resolve()` and
call `readConfiguration(integrationId)` for a plugin configuration reference. The
host binds this method to the installed plugin scope, independently of HTTP request
headers and later mutations to the plugin context.

- System plugins can read tenant-level integrations in the Default tenant.
- Tenant plugins can read tenant-level integrations in their owning tenant.
- Organization plugins can read integrations in their own organization or inherited
  tenant-level integrations, within the same tenant.
- The declared `integration.service`, `operations` and optional ID `scope` constrain
  this read. An explicit `service: '*'` permits any provider in the allowed scope.
- Missing scope, disallowed references and deleted integrations return `null`.

The method is optional for source compatibility with existing capability mocks and
older hosts. Plugins that require it must detect its absence and report unavailable;
do not fall back to the legacy runtime lookup for configuration references.

`read(id, options)`, `readForConnector`, listing and webhook credential methods retain
their existing contracts. Runtime integrations such as multi-tenant callback handlers
continue to enforce their existing signature and actor authorization. This addition
does not change those callback APIs or require existing plugins to adopt a new method.
