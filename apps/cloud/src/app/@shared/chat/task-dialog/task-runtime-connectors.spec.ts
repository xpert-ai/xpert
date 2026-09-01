import { readTaskConnectorBindingIds, withTaskConnectorBindingIds } from './task-runtime-connectors'

describe('scheduled task Connector selection', () => {
  it('reads normalized binding IDs from persisted runtime state', () => {
    expect(
      readTaskConnectorBindingIds({
        human: {
          runtimeCapabilities: {
            connectors: { bindingIds: [' binding-1 ', 'binding-1', null, 'binding-2'] }
          }
        }
      })
    ).toEqual(['binding-1', 'binding-2'])
  })

  it('adds Project Connector selection without dropping task state or existing capabilities', () => {
    expect(
      withTaskConnectorBindingIds(
        {
          customState: 'preserved',
          human: {
            input: 'preserved',
            runtimeCapabilities: {
              mode: 'allowlist',
              skills: { workspaceId: 'workspace-1', ids: ['skill-1'] },
              plugins: { nodeKeys: ['plugin-1'] },
              subAgents: { nodeKeys: ['agent-1'] }
            }
          }
        },
        [' binding-1 ', 'binding-1', 'binding-2']
      )
    ).toEqual({
      customState: 'preserved',
      human: {
        input: 'preserved',
        runtimeCapabilities: {
          mode: 'allowlist',
          skills: { workspaceId: 'workspace-1', ids: ['skill-1'] },
          plugins: { nodeKeys: ['plugin-1'] },
          subAgents: { nodeKeys: ['agent-1'] },
          connectors: { bindingIds: ['binding-1', 'binding-2'] }
        }
      }
    })
  })

  it('does not create an allowlist when a new Project automation selects no Connectors', () => {
    expect(withTaskConnectorBindingIds(null, [])).toEqual({})
  })

  it('marks a Connector-only selection to inherit the Xpert default capabilities', () => {
    expect(withTaskConnectorBindingIds(null, ['binding-1'])).toEqual({
      human: {
        runtimeCapabilities: {
          mode: 'allowlist',
          inheritUnselected: true,
          skills: { ids: [] },
          plugins: { nodeKeys: [] },
          connectors: { bindingIds: ['binding-1'] }
        }
      }
    })
  })

  it('removes a Connector-only selection without leaving an empty allowlist behind', () => {
    expect(
      withTaskConnectorBindingIds(
        {
          human: {
            input: 'preserved',
            runtimeCapabilities: {
              mode: 'allowlist',
              inheritUnselected: true,
              skills: { ids: [] },
              plugins: { nodeKeys: [] },
              connectors: { bindingIds: ['binding-1'] }
            }
          }
        },
        []
      )
    ).toEqual({ human: { input: 'preserved' } })
  })
})
