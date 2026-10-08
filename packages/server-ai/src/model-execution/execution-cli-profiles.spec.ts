import { builtinCliModelProfiles, builtinCliTools } from '@xpert-ai/cli-model-profiles'
import { CLI_MODEL_TOKEN_REFERENCE, type CliModelConfigurationInput } from '@xpert-ai/plugin-sdk'

const input: CliModelConfigurationInput = {
    directory: '/tmp/execution-first',
    gatewayBaseUrl: 'https://xpert.test/api/model-execution/openai/v1/',
    defaultModelId: 'allowed',
    models: [{ id: 'allowed', protocols: ['openai_chat'], contextWindow: 1000000, outputTokenLimit: 500 }],
    limits: { maxOutputTokens: 500 },
    managed: false
}

function configure(id: string, overrides: Partial<CliModelConfigurationInput> = {}) {
    const profile = builtinCliModelProfiles.get(id)
    if (!profile) throw new Error(`Missing profile: ${id}`)
    return profile.configure({ ...input, ...overrides })
}

describe('bundled execution CLI profiles', () => {
    it('exports distinct pinned tools with registered configuration adapters', () => {
        expect(builtinCliTools.map(({ id }) => id).sort()).toEqual(
            ['aider', 'claude', 'codebuddy', 'codex', 'kimi', 'opencode', 'qwen'].sort()
        )
        for (const tool of builtinCliTools) {
            expect(Object.keys(tool).sort()).toEqual(['executable', 'id', 'version'])
            expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/)
            expect(tool.executable).toMatch(/^\//)
            expect(builtinCliModelProfiles.get(tool.id)?.versionOutputs(tool.version)).toContain(tool.version)
        }
        expect(builtinCliModelProfiles.get('unregistered-cli')).toBeUndefined()
    })

    it.each(builtinCliTools)('keeps $id configuration isolated and credentials out of argv', ({ id }) => {
        const first = configure(id)
        const second = configure(id, { directory: '/tmp/execution-second' })
        expect(first.environment.XDG_CONFIG_HOME).toBe('/tmp/execution-first/config')
        expect(second.environment.XDG_CONFIG_HOME).toBe('/tmp/execution-second/config')
        expect(first.environment.XPERT_MODEL_TOKEN).toBe(CLI_MODEL_TOKEN_REFERENCE)
        expect(first.args.join(' ')).not.toContain(CLI_MODEL_TOKEN_REFERENCE)
        expect(JSON.stringify(second)).not.toContain('/tmp/execution-first')
        for (const file of first.files) {
            expect(file.name).not.toMatch(/^[/\\]|(^|[/\\])\.\.([/\\]|$)/)
        }
    })

    it.each([
        { managed: false, approvalMode: 'default' },
        { managed: true, approvalMode: 'auto-edit' }
    ])('uses Qwen $approvalMode approvals when managed=$managed', ({ managed, approvalMode }) => {
        const config = configure('qwen', { managed })
        expect(config.args).toEqual([
            '--auth-type',
            'openai',
            '--model',
            'assistant-default',
            '--approval-mode',
            approvalMode
        ])
        expect(config.environment).toMatchObject({
            QWEN_HOME: '/tmp/execution-first/config',
            QWEN_CODE_SYSTEM_SETTINGS_PATH: '/tmp/execution-first/qwen-settings.json',
            OPENAI_API_KEY: CLI_MODEL_TOKEN_REFERENCE,
            OPENAI_BASE_URL: 'https://xpert.test/api/model-execution/openai/v1',
            OPENAI_MODEL: 'assistant-default'
        })
        expect(JSON.parse(config.files[0].content)).toMatchObject({
            general: { enableAutoUpdate: false },
            telemetry: { enabled: false },
            modelProviders: {
                openai: [
                    {
                        id: 'assistant-default',
                        envKey: 'OPENAI_API_KEY',
                        generationConfig: {
                            contextWindowSize: 1000000,
                            samplingParams: { max_tokens: 500 },
                            maxRetries: 0
                        }
                    }
                ]
            }
        })
        expect(builtinCliModelProfiles.get('qwen')?.revision).toBe('5')
    })

    it('pins Kimi main and secondary models to the grant and reads its key from the environment', () => {
        const config = configure('kimi')
        expect(config.environment.KIMI_CODE_HOME).toBe('/tmp/execution-first')
        expect(config.args).toEqual(['--model', 'assistant-default'])
        const text = config.files[0].content
        expect(text).toContain('type = "openai"')
        expect(text).toContain('base_url = "https://xpert.test/api/model-execution/openai/v1"')
        expect(text).toContain('api_key_env = "XPERT_MODEL_TOKEN"')
        expect(text).toContain('max_context_size = 1000000')
        expect(text).not.toContain('max_input_size')
        expect(text).toContain('max_output_size = 500')
        expect(text).toContain('default_permission_mode = "manual"')
        expect(text).toContain('[secondary_model]\ndefault_model = "assistant-default"\nforce = true')
        expect(text).not.toContain(CLI_MODEL_TOKEN_REFERENCE)
    })

    it('pins CodeBuddy auxiliary models and retains command and subagent approvals', () => {
        const config = configure('codebuddy')
        expect(config.args).toEqual([
            '--model',
            'assistant-default',
            '--permission-mode',
            'default',
            '--subagent-permission-mode',
            'default'
        ])
        expect(config.environment).toMatchObject({
            CODEBUDDY_API_KEY: CLI_MODEL_TOKEN_REFERENCE,
            CODEBUDDY_CODE_SUBAGENT_MODEL: 'assistant-default',
            CODEBUDDY_SMALL_FAST_MODEL: 'assistant-default',
            CODEBUDDY_BIG_SLOW_MODEL: 'assistant-default',
            CODEBUDDY_DISABLE_BUILTIN_MODELS: '1'
        })
        expect(JSON.parse(config.files[0].content)).toMatchObject({
            models: [
                {
                    id: 'assistant-default',
                    apiKey: '${XPERT_MODEL_TOKEN}',
                    url: 'https://xpert.test/api/model-execution/openai/v1/chat/completions',
                    maxInputTokens: 1000000,
                    maxOutputTokens: 500,
                    relatedModels: { lite: 'assistant-default', reasoning: 'assistant-default' }
                }
            ],
            availableModels: ['assistant-default']
        })
    })
})

it('uses the selected catalog context for the default alias and each alternative independently', () => {
    const overrides: Partial<CliModelConfigurationInput> = {
        defaultModelId: 'large',
        models: [
            { id: 'small', protocols: ['openai_chat'], contextWindow: 32000 },
            { id: 'large', protocols: ['openai_chat'], contextWindow: 1000000 }
        ]
    }
    const models = JSON.parse(configure('opencode', overrides).environment.OPENCODE_CONFIG_CONTENT).provider.xpert
        .models
    expect(models['assistant-default'].limit.context).toBe(1000000)
    expect(models.small.limit.context).toBe(32000)
    expect(models.large.limit.context).toBe(1000000)
    expect(configure('codex', overrides).args).toContain('model_context_window=1000000')
})

it.each(['codex', 'qwen', 'codebuddy', 'opencode'])(
    'does not invent a smaller context when the %s catalog window is unknown',
    (id) => {
        const config = configure(id, { models: [{ id: 'allowed', protocols: ['openai_chat'] }] })
        const text = JSON.stringify(config)
        for (const field of [
            'model_context_window',
            'contextWindowSize',
            'max_context_size',
            'max_input_size',
            'maxInputTokens'
        ])
            expect(text).not.toContain(field)
        if (id === 'opencode')
            expect(
                JSON.parse(config.environment.OPENCODE_CONFIG_CONTENT).provider.xpert.models['assistant-default']
            ).not.toHaveProperty('limit')
    }
)

it('requires a real catalog window for Kimi instead of inventing one for its required field', () => {
    expect(() => configure('kimi', { models: [{ id: 'allowed', protocols: ['openai_chat'] }] })).toThrow(
        'Kimi requires a context window'
    )
})

it.each(['qwen', 'codebuddy'])('does not cap %s background execution at 30 turns', (id) => {
    const background = builtinCliModelProfiles.get(id).background
    if (background.transport !== 'jsonl') throw Error('Expected JSONL')
    expect(background.args).not.toContain('--max-turns')
    expect(background.args).not.toContain('--max-session-turns')
})

it.each(['qwen', 'codebuddy', 'claude', 'kimi', 'opencode'])(
    'uses catalog output metadata instead of legacy policy caps for %s',
    (id) => {
        const config = configure(id, { limits: { maxOutputTokens: 1 } })
        const text = JSON.stringify(config)
        expect(text).not.toMatch(/maxOutputTokens.{0,4}1[,}]/)
        if (id === 'opencode')
            expect(
                JSON.parse(config.environment.OPENCODE_CONFIG_CONTENT).provider.xpert.models['assistant-default'].limit
                    .output
            ).toBe(500)
    }
)

describe('background CLI extensions', () => {
    it.each([
        { id: 'claude', version: '2.1.63' },
        { id: 'codebuddy', version: '2.161.1' },
        { id: 'kimi', version: '2.1.1' }
    ])('qualifies $id only for the pinned JSONL version', ({ id, version }) => {
        expect(builtinCliModelProfiles.get(id)?.background).toMatchObject({
            transport: 'jsonl',
            versions: [version]
        })
        expect(builtinCliModelProfiles.get(id)?.revision).toBe('5')
        expect(builtinCliTools.find((tool) => tool.id === id)?.version).toBe(version)
    })

    it.each(['claude', 'codebuddy'])(
        'isolates %s background settings and applies the requested permission mode',
        (id) => {
            const background = builtinCliModelProfiles.get(id)?.background
            if (background?.transport !== 'jsonl') throw new Error('Expected JSONL profile')
            expect(background.args).toEqual(
                expect.arrayContaining([
                    '--print',
                    '--output-format',
                    'stream-json',
                    '--strict-mcp-config',
                    '--mcp-config',
                    '{"mcpServers":{}}',
                    '--tools',
                    'Bash,Read,Write,Edit,Glob,Grep'
                ])
            )
            expect(background.promptArgument).toBeUndefined()
            const allowed = configure(id, { managed: true, permissionMode: 'allow' })
            const restricted = configure(id, { managed: true, permissionMode: 'restricted' })
            expect(allowed.args).toEqual(expect.arrayContaining(['--permission-mode', 'bypassPermissions']))
            expect(allowed.args).not.toContain('--allowedTools')
            expect(restricted.args).toEqual(
                expect.arrayContaining([
                    '--permission-mode',
                    'dontAsk',
                    '--allowedTools',
                    'Read,Write,Edit,Glob,Grep,Bash(node:*)',
                    '--setting-sources',
                    '',
                    '--settings',
                    `/tmp/execution-first/${id}-settings.json`
                ])
            )
            expect(restricted.args).not.toContain('bypassPermissions')
            expect(restricted.files).toContainEqual({ name: `${id}-settings.json`, content: '{}' })
            expect(
                JSON.stringify(configure(id, { managed: true, permissionMode: 'restricted', directory: '/tmp/other' }))
            ).not.toContain('/tmp/execution-first')
            expect(restricted.args.join(' ')).not.toContain(CLI_MODEL_TOKEN_REFERENCE)
        }
    )

    it('declares Kimi argv prompt delivery and never advertises unsupported restricted execution', () => {
        const profile = builtinCliModelProfiles.get('kimi')
        expect(profile?.permissionModes).toEqual(['allow'])
        expect(profile?.background).toMatchObject({ transport: 'jsonl', promptArgument: '--prompt' })
        const config = configure('kimi', { managed: true, permissionMode: 'allow' })
        expect(config.args).toEqual(
            expect.arrayContaining([
                '--agent-file',
                '/tmp/execution-first/kimi-agent.md',
                '--skills-dir',
                '/tmp/execution-first/config'
            ])
        )
        const agent = config.files.find((file) => file.name === 'kimi-agent.md')
        expect(agent?.content).toContain('tools: [Bash, Read, Write, Edit, Glob, Grep]')
        expect(agent?.content).toContain('subagents: []')
        expect(configure('kimi').args).not.toContain('--agent-file')
    })

    it.each(['codex', 'opencode', 'qwen'])('tracks the %s revision for catalog-based configuration', (id) => {
        expect(builtinCliModelProfiles.get(id)?.revision).toBe('5')
    })
})
