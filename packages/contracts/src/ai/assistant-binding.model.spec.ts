import {
  IAssistantBindingToolPreferences,
  ensureAssistantBindingSkillWorkspacePreference,
  filterAssistantBindingDisabledSkillIds,
  filterAssistantBindingDisabledTools,
  getAssistantBindingDisabledSkillIds,
  getAssistantBindingDisabledTools,
  isAssistantBindingToolPreferencesEmpty,
  normalizeAssistantBindingToolPreferences,
  updateAssistantBindingSkillPreferences,
  updateAssistantBindingToolPreferences
} from './assistant-binding.model'

describe('assistant binding tool preferences helpers', () => {
  it('normalizes tool, middleware, and skill preferences with trimmed unique ids', () => {
    expect(
      normalizeAssistantBindingToolPreferences({
        version: 1,
        toolsets: {
          ' toolset-1 ': {
            toolsetId: ' toolset-id ',
            toolsetName: ' Toolset One ',
            disabledTools: [' search ', 'search', '']
          },
          ' ': {
            toolsetName: 'Ignored',
            disabledTools: ['search']
          }
        },
        middlewares: {
          ' middleware-1 ': {
            provider: ' sandbox ',
            disabledTools: [' ls ', 'ls']
          }
        },
        skills: {
          ' workspace-1 ': {
            workspaceId: ' workspace-1 ',
            disabledSkillIds: [' skill-a ', 'skill-a', '']
          },
          'workspace-2': {
            workspaceId: ' ',
            disabledSkillIds: []
          }
        }
      })
    ).toEqual({
      version: 1,
      toolsets: {
        'toolset-1': {
          toolsetId: 'toolset-id',
          toolsetName: 'Toolset One',
          disabledTools: ['search']
        }
      },
      middlewares: {
        'middleware-1': {
          provider: 'sandbox',
          disabledTools: ['ls']
        }
      },
      skills: {
        'workspace-1': {
          workspaceId: 'workspace-1',
          disabledSkillIds: ['skill-a']
        },
        'workspace-2': {
          workspaceId: 'workspace-2',
          disabledSkillIds: []
        }
      }
    })
  })

  it('returns empty when preferences only contain invalid entries', () => {
    expect(
      normalizeAssistantBindingToolPreferences({
        version: 1,
        toolsets: {
          ' ': {
            toolsetName: ' ',
            disabledTools: ['search']
          }
        }
      })
    ).toBeNull()
    expect(
      isAssistantBindingToolPreferencesEmpty({ version: 1, toolsets: { ' ': { toolsetName: ' ', disabledTools: [] } } })
    ).toBe(true)
  })

  it('reads and filters disabled skill ids by workspace', () => {
    const preferences: IAssistantBindingToolPreferences = {
      version: 1,
      skills: {
        'workspace-1': {
          workspaceId: 'workspace-1',
          disabledSkillIds: ['skill-b']
        }
      }
    }

    expect(getAssistantBindingDisabledSkillIds(preferences, 'workspace-1')).toEqual(['skill-b'])
    expect(filterAssistantBindingDisabledSkillIds(['skill-a', 'skill-b'], preferences, 'workspace-1')).toEqual([
      'skill-a'
    ])
  })

  it('updates skill preferences as a workspace-scoped blacklist', () => {
    const disabled = updateAssistantBindingSkillPreferences(null, 'workspace-1', 'skill-a', false)
    expect(disabled).toEqual({
      version: 1,
      skills: {
        'workspace-1': {
          workspaceId: 'workspace-1',
          disabledSkillIds: ['skill-a']
        }
      }
    })

    expect(updateAssistantBindingSkillPreferences(disabled, 'workspace-1', 'skill-a', true)).toBeNull()
  })

  it('ensures a workspace skill preference entry exists even when all skills stay enabled', () => {
    expect(ensureAssistantBindingSkillWorkspacePreference(null, 'workspace-1')).toEqual({
      version: 1,
      skills: {
        'workspace-1': {
          workspaceId: 'workspace-1',
          disabledSkillIds: []
        }
      }
    })
  })

  it('updates tool preferences while preserving other preference sections', () => {
    const preferences: IAssistantBindingToolPreferences = {
      version: 1,
      skills: {
        'workspace-1': {
          workspaceId: 'workspace-1',
          disabledSkillIds: ['skill-a']
        }
      }
    }

    const next = updateAssistantBindingToolPreferences(
      preferences,
      'toolset',
      'toolset-1',
      {
        toolsetId: 'toolset-id',
        toolsetName: 'Toolset One'
      },
      'search',
      false
    )

    expect(next).toEqual({
      version: 1,
      toolsets: {
        'toolset-1': {
          toolsetId: 'toolset-id',
          toolsetName: 'Toolset One',
          disabledTools: ['search']
        }
      },
      skills: {
        'workspace-1': {
          workspaceId: 'workspace-1',
          disabledSkillIds: ['skill-a']
        }
      }
    })

    expect(getAssistantBindingDisabledTools(next, 'toolset', 'toolset-1')).toEqual(['search'])
    expect(
      filterAssistantBindingDisabledTools([{ name: 'search' }, { name: 'calc' }], next, 'toolset', 'toolset-1')
    ).toEqual([{ name: 'calc' }])
  })
})
