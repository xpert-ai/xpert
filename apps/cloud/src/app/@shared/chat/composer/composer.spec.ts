import {
  buildSlashOptions,
  createChatCommandSource,
  createEmptyRuntimeCapabilitiesSelection,
  findSlashOptionByInvocation,
  flattenSlashOptions,
  hasRuntimeCapabilitiesSelection,
  mergeRuntimeCapabilitiesSelections,
  normalizeChatRuntimeCapabilities,
  parseSlashInvocation,
  renderSlashCommandTemplate,
  resolveSlashTrigger,
  setRuntimeCapabilitySelected
} from './composer'

describe('chat composer helpers', () => {
  it('merges, toggles, and removes runtime capability selections', () => {
    const skill = { type: 'skill' as const, id: 'skill-1', label: 'Skill' }
    const plugin = { type: 'plugin' as const, id: 'plugin-node', label: 'Plugin' }

    const withSkill = setRuntimeCapabilitySelected(null, skill, true, 'workspace-1')
    const withPlugin = setRuntimeCapabilitySelected(null, plugin, true, 'workspace-1')
    const merged = mergeRuntimeCapabilitiesSelections(withSkill, withPlugin)

    expect(merged).toEqual({
      mode: 'allowlist',
      skills: {
        workspaceId: 'workspace-1',
        ids: ['skill-1']
      },
      plugins: {
        nodeKeys: ['plugin-node']
      },
      subAgents: {
        nodeKeys: []
      }
    })

    expect(setRuntimeCapabilitySelected(merged, skill, false)).toEqual({
      mode: 'allowlist',
      skills: {
        workspaceId: 'workspace-1',
        ids: []
      },
      plugins: {
        nodeKeys: ['plugin-node']
      },
      subAgents: {
        nodeKeys: []
      }
    })

    expect(hasRuntimeCapabilitiesSelection(createEmptyRuntimeCapabilitiesSelection('workspace-1'))).toBe(false)
  })

  it('parses slash triggers and aliases', () => {
    expect(resolveSlashTrigger('hello\n/pla', 10)).toEqual({ start: 6, end: 10, query: 'pla' })
    expect(parseSlashInvocation('/tools please')).toEqual({ name: 'tools', args: 'please' })

    const option = findSlashOptionByInvocation(buildSlashOptions([], 'tools'), { name: 'tools', args: '' })
    expect(option?.name).toBe('plugins')
  })

  it('renders slash command args into templates', () => {
    expect(renderSlashCommandTemplate('Review {{ args }} carefully', 'src/app.ts')).toBe('Review src/app.ts carefully')
    expect(renderSlashCommandTemplate('/review ', 'src/app.ts')).toBe('/review src/app.ts')
  })

  it('keeps plan builtin and hides unsupported client actions', () => {
    const options = buildSlashOptions(
      [
        {
          name: 'pet',
          label: 'Pet',
          action: {
            type: 'client_action',
            action: {
              type: 'pet'
            }
          }
        },
        {
          name: 'review',
          label: 'Review',
          kind: 'prompt_workflow',
          action: {
            type: 'submit_prompt',
            template: 'Review {{args}}'
          }
        }
      ],
      ''
    )

    expect(options.some((option) => option.name === 'plan')).toBe(true)
    expect(options.some((option) => option.name === 'pet')).toBe(false)
    expect(options.some((option) => option.name === 'review')).toBe(true)
  })

  it('creates command source payloads', () => {
    const option = buildSlashOptions(
      [
        {
          name: 'review',
          label: 'Review',
          kind: 'prompt_workflow',
          workflow: {
            type: 'prompt_workflow',
            name: 'review'
          },
          action: {
            type: 'submit_prompt',
            template: 'Review {{args}}'
          }
        }
      ],
      'review'
    ).find((item) => item.name === 'review')

    expect(createChatCommandSource(option!)).toEqual({
      type: 'slash_command',
      name: 'review',
      source: 'runtime',
      executionType: 'submit_prompt',
      kind: 'prompt_workflow',
      workflow: {
        type: 'prompt_workflow',
        name: 'review'
      }
    })
  })

  it('adds runtime capability child counts and expanded tree items to builtin groups', () => {
    const skill = { type: 'skill' as const, id: 'skill-1', label: 'Skill' }
    const plugin = { type: 'plugin' as const, id: 'plugin-1', label: 'Plugin' }
    const selection = setRuntimeCapabilitySelected(null, skill, true, 'workspace-1')
    const options = buildSlashOptions(
      [],
      '',
      {
        skills: [skill],
        plugins: [plugin],
        subAgents: [],
        commands: []
      },
      ['skill'],
      selection
    )
    const skills = options.find((option) => option.name === 'skills')
    const plugins = options.find((option) => option.name === 'plugins')

    expect(skills?.childCount).toBe(1)
    expect(skills?.expanded).toBe(true)
    expect(skills?.children?.[0]).toMatchObject({ type: 'capability', name: 'skill-1', selected: true })
    expect(plugins?.childCount).toBe(1)
    expect(plugins?.children).toEqual([])
    expect(flattenSlashOptions(options).some((option) => option.name === 'skill-1')).toBe(true)
  })

  it('normalizes runtime capability responses', () => {
    expect(
      normalizeChatRuntimeCapabilities({
        skills: [{ id: 'skill-1', label: 'Skill' }],
        plugins: [{ nodeKey: 'plugin-1', label: 'Plugin' }],
        subAgents: [{ nodeKey: 'agent-1', label: 'Agent' }],
        commands: [{ name: 'review', action: { type: 'insert_text', template: 'Review' } }]
      })
    ).toMatchObject({
      skills: [{ id: 'skill-1', type: 'skill' }],
      plugins: [{ id: 'plugin-1', type: 'plugin' }],
      subAgents: [{ id: 'agent-1', type: 'subAgent' }],
      commands: [{ name: 'review' }]
    })
  })

  it('normalizes wrapped and aliased runtime capability responses', () => {
    expect(
      normalizeChatRuntimeCapabilities({
        data: {
          skills: {
            items: [{ skill_id: 'skill-1', name: 'Skill', workspace_id: 'workspace-1' }]
          },
          toolsets: [{ node_key: 'plugin-1', title: 'Plugin', tool_names: ['search'] }],
          sub_agents: [{ key: 'agent-1', title: 'Agent', toolset_names: ['Delegation'] }],
          runtimeCommands: [{ name: 'review', action: { type: 'insert_text', template: 'Review' } }]
        }
      })
    ).toMatchObject({
      skills: [{ id: 'skill-1', label: 'Skill', workspaceId: 'workspace-1', type: 'skill' }],
      plugins: [{ id: 'plugin-1', label: 'Plugin', toolNames: ['search'], type: 'plugin' }],
      subAgents: [{ id: 'agent-1', label: 'Agent', toolsetNames: ['Delegation'], type: 'subAgent' }],
      commands: [{ name: 'review' }]
    })
  })
})
