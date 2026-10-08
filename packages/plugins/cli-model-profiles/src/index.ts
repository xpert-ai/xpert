import type { CliPermissionMode, ModelExecutionModel } from '@xpert-ai/contracts'
import { CLI_MODEL_TOKEN_REFERENCE, type CliModelProfile, type CliModelProfiles } from '@xpert-ai/plugin-sdk'
import { ModelFeature } from '@xpert-ai/contracts'
import toolchain from './toolchain.json'

/** Shared with the Computer image build; installation and policy versions must agree. */
export const builtinCliTools = toolchain.map(({ id, version, executable }) => ({ id, version, executable }))

/** Already-authorized model metadata; configuration generation has no persistence dependency. */
type ComputerCliModelBinding = {
  toolId: string
  managed: boolean
  permissionMode?: CliPermissionMode
  defaultModelId?: string
  models: Array<Pick<ModelExecutionModel, 'id' | 'protocols' | 'contextWindow' | 'outputTokenLimit'>>
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
  const selected = grant.models.find((model) => model.id === grant.defaultModelId)
  const contextWindow = selected?.contextWindow
  const outputTokenLimit = selected?.outputTokenLimit
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
        ...(grant.permissionMode
          ? [
              '--ask-for-approval',
              'never',
              '--sandbox',
              grant.permissionMode === 'allow' ? 'danger-full-access' : 'workspace-write'
            ]
          : []),
        ...(bridge
          ? ['-c', 'model_reasoning_summary="none"', '-c', 'features.multi_agent=false', '-c', 'features.goals=false']
          : []),
        ...(contextWindow ? ['-c', `model_context_window=${contextWindow}`] : []),
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
        ...(grant.permissionMode
          ? [
              '--permission-mode',
              grant.permissionMode === 'allow' ? 'bypassPermissions' : 'dontAsk',
              ...(grant.permissionMode === 'restricted'
                ? ['--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(node:*)']
                : [])
            ]
          : bridge
            ? ['--permission-mode', 'default']
            : []),
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
              ENABLE_TOOL_SEARCH: 'false'
            }
          : {}),
        ...(outputTokenLimit ? { CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(outputTokenLimit) } : {}),
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
  if (grant.toolId === 'qwen')
    return {
      // Background policy is explicit; interactive and managed shell calls retain their existing behavior.
      args: [
        '--auth-type',
        'openai',
        '--model',
        'assistant-default',
        '--approval-mode',
        grant.permissionMode === 'allow' ? 'yolo' : grant.managed ? 'auto-edit' : 'default',
        ...(grant.permissionMode === 'restricted'
          ? [
              '--allowed-tools',
              'run_shell_command(node)',
              '--append-system-prompt',
              'The host set your working directory to the project root. Only node shell commands are approved; use file tools for reads and edits. Create directories with Node fs.mkdirSync. Run node directly without cd or shell chaining. Do not delegate to subagents.'
            ]
          : [])
      ],
      environment: {
        ...environment,
        QWEN_HOME: `${directory}/config`,
        QWEN_CODE_SYSTEM_SETTINGS_PATH: `${directory}/qwen-settings.json`,
        OPENAI_API_KEY: token,
        OPENAI_BASE_URL: base,
        OPENAI_MODEL: 'assistant-default'
      },
      files: [
        {
          name: 'qwen-settings.json',
          content: JSON.stringify({
            general: { enableAutoUpdate: false },
            telemetry: { enabled: false },
            security: { auth: { selectedType: 'openai' } },
            model: { name: 'assistant-default' },
            modelProviders: {
              openai: [
                {
                  id: 'assistant-default',
                  name: 'Xpert',
                  baseUrl: base,
                  envKey: 'OPENAI_API_KEY',
                  generationConfig: {
                    ...(contextWindow ? { contextWindowSize: contextWindow } : {}),
                    ...(outputTokenLimit ? { samplingParams: { max_tokens: outputTokenLimit } } : {}),
                    maxRetries: 0
                  }
                }
              ]
            }
          })
        }
      ]
    }
  if (grant.toolId === 'kimi') {
    // Kimi requires an explicit window for custom model aliases; never invent a policy cap.
    if (!contextWindow) throw new Error('Kimi requires a context window in the selected model catalog.')
    return {
      args: [
        '--model',
        'assistant-default',
        ...(grant.permissionMode
          ? ['--agent-file', `${directory}/kimi-agent.md`, '--skills-dir', `${directory}/config`]
          : [])
      ],
      environment: {
        ...environment,
        KIMI_CODE_HOME: directory,
        KIMI_DISABLE_TELEMETRY: '1',
        KIMI_CODE_NO_AUTO_UPDATE: '1'
      },
      files: [
        {
          name: 'config.toml',
          content:
            [
              'default_model = "assistant-default"',
              'default_permission_mode = "manual"',
              'telemetry = false',
              '[thinking]',
              'enabled = false',
              '[providers.xpert]',
              'type = "openai"',
              'base_url = ' + JSON.stringify(base),
              'api_key_env = "XPERT_MODEL_TOKEN"',
              '[models.assistant-default]',
              'provider = "xpert"',
              'model = "assistant-default"',
              'max_context_size = ' + contextWindow,
              ...(outputTokenLimit ? ['max_output_size = ' + outputTokenLimit] : []),
              'capabilities = ["tool_use"]',
              '[secondary_model]',
              'default_model = "assistant-default"',
              'force = true'
            ].join('\n') + '\n'
        },
        ...(grant.permissionMode
          ? [
              {
                name: 'kimi-agent.md',
                content:
                  '---\nname: xpert-coding\ndescription: Host-managed coding execution\ntools: [Bash, Read, Write, Edit, Glob, Grep]\nsubagents: []\n---\nComplete the supplied coding task in the current project directory. Execute checks and report actual results. Do not run background commands or delegate.\n'
              }
            ]
          : [])
      ]
    }
  }
  if (grant.toolId === 'codebuddy')
    return {
      args: [
        '--model',
        'assistant-default',
        '--permission-mode',
        grant.permissionMode === 'allow'
          ? 'bypassPermissions'
          : grant.permissionMode === 'restricted'
            ? 'dontAsk'
            : 'default',
        '--subagent-permission-mode',
        'default',
        ...(grant.permissionMode
          ? [
              '--setting-sources',
              '',
              '--settings',
              `${directory}/codebuddy-settings.json`,
              ...(grant.permissionMode === 'restricted'
                ? ['--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(node:*)']
                : [])
            ]
          : [])
      ],
      environment: {
        ...environment,
        CODEBUDDY_CONFIG_DIR: directory,
        CODEBUDDY_API_KEY: token,
        CODEBUDDY_BASE_URL: base,
        CODEBUDDY_MODEL: 'assistant-default',
        CODEBUDDY_BIG_SLOW_MODEL: 'assistant-default',
        CODEBUDDY_SMALL_FAST_MODEL: 'assistant-default',
        CODEBUDDY_CODE_SUBAGENT_MODEL: 'assistant-default',
        CODEBUDDY_DISABLE_BUILTIN_MODELS: '1',
        CODEBUDDY_CODE_ENABLE_TELEMETRY: '0',
        DISABLE_AUTOUPDATER: '1'
      },
      files: [
        {
          name: 'models.json',
          content: JSON.stringify({
            models: [
              {
                id: 'assistant-default',
                name: 'Xpert',
                vendor: 'OpenAI',
                apiKey: '${XPERT_MODEL_TOKEN}',
                url: `${base}/chat/completions`,
                ...(contextWindow ? { maxInputTokens: contextWindow } : {}),
                ...(outputTokenLimit ? { maxOutputTokens: outputTokenLimit } : {}),
                supportsToolCall: true,
                supportsImages: false,
                supportsReasoning: false,
                relatedModels: { lite: 'assistant-default', reasoning: 'assistant-default' }
              }
            ],
            availableModels: ['assistant-default']
          })
        },
        ...(grant.permissionMode ? [{ name: 'codebuddy-settings.json', content: '{}' }] : [])
      ]
    }
  if (grant.toolId !== 'opencode') throw new Error('Invalid CLI profile configuration')
  const models = Object.fromEntries(
    ['assistant-default', ...grant.models.map((model) => model.id)].map((id) => {
      const model = id === 'assistant-default' ? selected : grant.models.find((model) => model.id === id)
      const context = model?.contextWindow
      const output = model?.outputTokenLimit
      return [
        id,
        {
          name: id,
          ...(context || output ? { limit: { ...(context ? { context } : {}), ...(output ? { output } : {}) } } : {})
        }
      ]
    })
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
              permission:
                grant.permissionMode === 'allow'
                  ? { '*': 'allow', question: 'deny' }
                  : {
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
    revision: '5',
    permissionModes: ['allow', 'restricted'],
    background: { versions: ['0.159.2'], transport: 'jsonl', args: ['exec', '--json', '--skip-git-repo-check', '-'] },
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
    revision: '5',
    permissionModes: ['allow', 'restricted'],
    background: {
      versions: ['2.1.63'],
      transport: 'jsonl',
      args: [
        '--print',
        '--verbose',
        '--input-format',
        'text',
        '--output-format',
        'stream-json',
        '--tools',
        'Bash,Read,Write,Edit,Glob,Grep',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--no-session-persistence',
        '--disable-slash-commands'
      ]
    },
    protocol: 'anthropic_messages',
    requiredCapabilities: [],
    chatBridge: { versions: ['2.1.63'], requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL] },
    versionOutputs: (v: string) => [v, `${v} (Claude Code)`]
  },
  {
    id: 'opencode',
    revision: '5',
    permissionModes: ['allow', 'restricted'],
    background: { versions: ['1.18.33'], transport: 'opencode' },
    protocol: 'openai_chat',
    requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL],
    versionOutputs: (v: string) => [v, `opencode ${v}`]
  },
  {
    id: 'aider',
    revision: '1',
    protocol: 'openai_chat',
    requiredCapabilities: [],
    versionOutputs: (v: string) => [v, `aider ${v}`]
  },
  {
    id: 'qwen',
    revision: '5',
    permissionModes: ['allow', 'restricted'],
    background: {
      versions: ['0.24.7'],
      transport: 'jsonl',
      args: ['--input-format', 'text', '--output-format', 'stream-json', '--safe-mode', '--exclude-tools', 'agent']
    },
    protocol: 'openai_chat',
    requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL],
    versionOutputs: (v: string) => [v]
  },
  {
    id: 'kimi',
    revision: '5',
    // 2.1.1 forces auto approval in prompt mode; never advertise a restricted mode it ignores.
    permissionModes: ['allow'],
    background: {
      versions: ['2.1.1'],
      transport: 'jsonl',
      args: ['--output-format', 'stream-json'],
      promptArgument: '--prompt'
    },
    protocol: 'openai_chat',
    requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL],
    versionOutputs: (v: string) => [v, `kimi version ${v}`]
  },
  {
    id: 'codebuddy',
    revision: '5',
    permissionModes: ['allow', 'restricted'],
    background: {
      versions: ['2.161.1'],
      transport: 'jsonl',
      args: [
        '--print',
        '--verbose',
        '--input-format',
        'text',
        '--output-format',
        'stream-json',
        '--tools',
        'Bash,Read,Write,Edit,Glob,Grep',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--no-session-persistence'
      ]
    },
    protocol: 'openai_chat',
    requiredCapabilities: [ModelFeature.STREAM_TOOL_CALL],
    versionOutputs: (v: string) => [v, `${v} (CodeBuddy Code)`]
  }
] satisfies Array<
  Pick<
    CliModelProfile,
    | 'id'
    | 'revision'
    | 'protocol'
    | 'requiredCapabilities'
    | 'permissionModes'
    | 'chatBridge'
    | 'background'
    | 'versionOutputs'
  >
>

/** Bundled profiles keep existing installations compatible; hosts may supply a registry capability instead. */
export const builtinCliModelProfiles: CliModelProfiles = {
  get(id) {
    const definition = definitions.find((item) => item.id === id)
    if (!definition) return undefined
    return {
      ...definition,
      command: definition.id,
      offlineArguments: [['--version']],
      configure: (input) =>
        configureBuiltinCli(
          {
            toolId: id,
            managed: input.managed,
            permissionMode: input.permissionMode,
            models: input.models,
            defaultModelId: input.defaultModelId
          },
          CLI_MODEL_TOKEN_REFERENCE,
          input.gatewayBaseUrl,
          input.directory
        )
    }
  }
}
