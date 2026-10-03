import type { ModelExecutionLimits, ModelExecutionModel } from '@xpert-ai/contracts'
import { CLI_MODEL_TOKEN_REFERENCE, type CliModelProfile, type CliModelProfiles } from '@xpert-ai/plugin-sdk'
import { ModelFeature } from '@xpert-ai/contracts'

/** Already-authorized model metadata; configuration generation has no persistence dependency. */
type ComputerCliModelBinding = {
  toolId: string
  managed: boolean
  models: Array<Pick<ModelExecutionModel, 'id' | 'protocols'>>
  limits: Pick<ModelExecutionLimits, 'maxInputTokens' | 'maxOutputTokens'>
}

export type ComputerCliConfiguration = {
  args: string[]
  environment: Record<string, string>
  files: Array<{ name: string; content: string }>
}

/** Per-process overrides; auxiliary models use the same grant as the main model. */
function configureBuiltinCli(
  grant: ComputerCliModelBinding,
  token: string,
  baseUrl: string,
  directory: string
): ComputerCliConfiguration {
  const base = baseUrl.replace(/\/$/, '')
  const bridge = grant.models.some((model) =>
    model.protocols?.some((protocol) => protocol === 'openai_responses_chat' || protocol === 'anthropic_messages_chat')
  )
  const environment = {
    XPERT_MODEL_TOKEN: token,
    XDG_CONFIG_HOME: `${directory}/config`,
    XDG_DATA_HOME: `${directory}/data`,
    XDG_CACHE_HOME: `${directory}/cache`
  }
  if (grant.toolId === 'codex')
    return {
      args: [
        ...(bridge
          ? ['-c', 'model_reasoning_summary="none"', '-c', 'features.multi_agent=false', '-c', 'features.goals=false']
          : []),
        '--model',
        'assistant-default',
        '-c',
        'model_provider="xpert"',
        '-c',
        `model_providers.xpert.base_url=${JSON.stringify(base)}`,
        '-c',
        'model_providers.xpert.env_key="XPERT_MODEL_TOKEN"',
        '-c',
        'model_providers.xpert.wire_api="responses"',
        '-c',
        'model_providers.xpert.requires_openai_auth=false',
        '-c',
        'model_providers.xpert.supports_websockets=false',
        '-c',
        'model_providers.xpert.request_max_retries=0',
        '-c',
        'model_providers.xpert.stream_max_retries=0',
        '-c',
        'web_search="disabled"'
      ],
      environment: { ...environment, CODEX_HOME: directory },
      files: [{ name: 'config.toml', content: '[model_providers.xpert]\nname = "Xpert"\n' }]
    }
  if (grant.toolId === 'claude') {
    if (!base.endsWith('/openai/v1')) throw new Error('Invalid CLI profile configuration')
    return {
      args: [
        ...(bridge ? ['--permission-mode', 'default'] : []),
        '--model',
        'assistant-default',
        '--setting-sources',
        '',
        '--settings',
        `${directory}/claude-settings.json`
      ],
      environment: {
        ...environment,
        ...(bridge
          ? {
              MAX_THINKING_TOKENS: '0',
              CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING: '1',
              ENABLE_TOOL_SEARCH: 'false',
              CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(grant.limits.maxOutputTokens)
            }
          : {}),
        CLAUDE_CONFIG_DIR: `${directory}/config`,
        ANTHROPIC_BASE_URL: base.slice(0, -'/openai/v1'.length) + '/anthropic',
        ANTHROPIC_AUTH_TOKEN: token,
        ANTHROPIC_MODEL: 'assistant-default',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'assistant-default',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'assistant-default',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'assistant-default',
        ANTHROPIC_SMALL_FAST_MODEL: 'assistant-default',
        CLAUDE_CODE_SUBAGENT_MODEL: 'assistant-default',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        DISABLE_AUTOUPDATER: '1'
      },
      files: [{ name: 'claude-settings.json', content: '{}' }]
    }
  }
  if (grant.toolId === 'aider')
    return {
      args: [
        '--config',
        `${directory}/aider.yml`,
        '--env-file',
        `${directory}/empty.env`,
        '--model',
        'openai/assistant-default',
        '--weak-model',
        'openai/assistant-default',
        '--editor-model',
        'openai/assistant-default',
        '--no-auto-commits',
        '--no-check-update'
      ],
      environment: { ...environment, OPENAI_API_BASE: base, OPENAI_API_KEY: token },
      files: [
        { name: 'aider.yml', content: '{}' },
        { name: 'empty.env', content: '' }
      ]
    }
  if (grant.toolId !== 'opencode') throw new Error('Invalid CLI profile configuration')
  const models = Object.fromEntries(
    ['assistant-default', ...grant.models.map((model) => model.id)].map((id) => [
      id,
      {
        name: id,
        limit: {
          context: grant.limits.maxInputTokens + grant.limits.maxOutputTokens,
          output: grant.limits.maxOutputTokens
        }
      }
    ])
  )
  return {
    args: ['--model', 'xpert/assistant-default'],
    files: [],
    environment: {
      ...environment,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        ...(grant.managed
          ? {
              permission: {
                '*': 'deny',
                read: 'allow',
                edit: 'allow',
                bash: 'allow',
                glob: 'allow',
                grep: 'allow',
                list: 'allow',
                question: 'deny',
                external_directory: 'deny'
              }
            }
          : {}),
        enabled_providers: ['xpert'],
        model: 'xpert/assistant-default',
        small_model: 'xpert/assistant-default',
        autoupdate: false,
        share: 'disabled',
        provider: {
          xpert: {
            npm: '@ai-sdk/openai-compatible',
            name: 'Xpert',
            options: { baseURL: base, apiKey: '{env:XPERT_MODEL_TOKEN}' },
            models
          }
        }
      })
    }
  }
}

const definitions = [
  {
    id: 'codex',
    protocol: 'openai_responses',
    requiredCapabilities: [],
    chatBridge: {
      versions: ['0.159.2'],
      requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL]
    },
    versionOutputs: (v: string) => [v, `codex-cli ${v}`]
  },
  {
    id: 'claude',
    protocol: 'anthropic_messages',
    requiredCapabilities: [],
    chatBridge: { versions: ['2.1.63'], requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL] },
    versionOutputs: (v: string) => [v, `${v} (Claude Code)`]
  },
  {
    id: 'opencode',
    protocol: 'openai_chat',
    requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL],
    versionOutputs: (v: string) => [v, `opencode ${v}`]
  },
  { id: 'aider', protocol: 'openai_chat', requiredCapabilities: [], versionOutputs: (v: string) => [v, `aider ${v}`] }
] satisfies Array<Pick<CliModelProfile, 'id' | 'protocol' | 'requiredCapabilities' | 'chatBridge' | 'versionOutputs'>>

/** Bundled profiles keep existing installations compatible; hosts may supply a registry capability instead. */
export const builtinCliModelProfiles: CliModelProfiles = {
  get(id) {
    const definition = definitions.find((item) => item.id === id)
    if (!definition) return undefined
    return {
      ...definition,
      command: definition.id,
      revision: '1',
      offlineArguments: [['--version']],
      configure: (input) =>
        configureBuiltinCli(
          {
            toolId: id,
            managed: input.managed,
            models: input.models,
            limits: input.limits
          },
          CLI_MODEL_TOKEN_REFERENCE,
          input.gatewayBaseUrl,
          input.directory
        )
    }
  }
}
