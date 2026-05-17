import { IXpertAgent } from './xpert-agent.model'
import { IXpert, TXpertTeamDraft } from './xpert.model'
import { replaceAgentInDraft, resolveRuntimeXpert } from './xpert.utils'

describe('xpert utils', () => {
  it('replaces the primary agent key and rewrites related connections', () => {
    const draft = {
      team: {
        agent: {
          key: 'Agent_old',
          name: 'old-agent'
        }
      },
      nodes: [
        {
          type: 'agent',
          key: 'Agent_old',
          position: { x: 0, y: 0 },
          entity: {
            key: 'Agent_old',
            name: 'old-agent'
          }
        },
        {
          type: 'toolset',
          key: 'toolset-1',
          position: { x: 200, y: 0 },
          entity: {
            id: 'toolset-1',
            name: 'Toolset'
          }
        }
      ],
      connections: [
        {
          type: 'toolset',
          key: 'Agent_old/toolset-1',
          from: 'Agent_old',
          to: 'toolset-1'
        },
        {
          type: 'agent',
          key: 'Agent_leader/Agent_old',
          from: 'Agent_leader',
          to: 'Agent_old'
        }
      ]
    } as unknown as TXpertTeamDraft

    const replaced = replaceAgentInDraft(draft, 'Agent_old', {
      key: 'Agent_current',
      title: 'Current Agent'
    } as IXpertAgent)

    expect(replaced.team.agent).toEqual(
      expect.objectContaining({
        key: 'Agent_current',
        title: 'Current Agent'
      })
    )
    expect(replaced.nodes[0]).toEqual(
      expect.objectContaining({
        key: 'Agent_current',
        entity: expect.objectContaining({
          key: 'Agent_current',
          title: 'Current Agent'
        })
      })
    )
    expect(replaced.connections).toEqual([
      expect.objectContaining({
        from: 'Agent_current',
        to: 'toolset-1',
        key: 'Agent_current/toolset-1'
      }),
      expect.objectContaining({
        from: 'Agent_leader',
        to: 'Agent_current',
        key: 'Agent_leader/Agent_current'
      })
    ])
  })

  it('can rewrite the primary agent key even when the hidden agent node is absent', () => {
    const draft = {
      team: {
        agent: {
          key: 'Agent_hidden'
        }
      },
      nodes: [],
      connections: [
        {
          type: 'edge',
          key: 'Agent_hidden/Node_1',
          from: 'Agent_hidden',
          to: 'Node_1'
        }
      ]
    } as unknown as TXpertTeamDraft

    const replaced = replaceAgentInDraft(
      draft,
      'Agent_hidden',
      {
        key: 'Agent_current'
      } as IXpertAgent,
      { requireNode: false }
    )

    expect(replaced.team.agent).toEqual(
      expect.objectContaining({
        key: 'Agent_current'
      })
    )
    expect(replaced.connections).toEqual([
      expect.objectContaining({
        from: 'Agent_current',
        to: 'Node_1',
        key: 'Agent_current/Node_1'
      })
    ])
  })

  it('resolves runtime xpert from draft graph and primary agent node', () => {
    const xpert = {
      id: 'xpert-1',
      tenantId: 'tenant-1',
      organizationId: 'organization-1',
      workspaceId: 'workspace-1',
      title: 'Published Xpert',
      agent: {
        key: 'published-agent'
      },
      graph: {
        nodes: [],
        connections: []
      },
      draft: {
        team: {
          workspaceId: 'draft-workspace',
          title: 'Draft Xpert',
          agent: {
            key: 'draft-agent',
            title: 'Draft Team Agent'
          },
          agentConfig: {
            recursionLimit: 20
          }
        },
        nodes: [
          {
            key: 'draft-agent',
            type: 'agent',
            entity: {
              key: 'draft-agent',
              title: 'Draft Node Agent'
            }
          }
        ],
        connections: [{ type: 'agent', from: 'draft-agent', to: 'sub-agent' }]
      }
    } as unknown as IXpert

    const resolved = resolveRuntimeXpert(xpert, true)

    expect(resolved).toEqual(
      expect.objectContaining({
        id: 'xpert-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        workspaceId: 'draft-workspace',
        title: 'Draft Xpert',
        agent: expect.objectContaining({
          key: 'draft-agent',
          title: 'Draft Node Agent'
        }),
        graph: {
          nodes: xpert.draft.nodes,
          connections: xpert.draft.connections
        },
        agentConfig: {
          recursionLimit: 20
        }
      })
    )
  })
})
