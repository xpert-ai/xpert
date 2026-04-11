import { IXpert, LongTermMemoryTypeEnum, TXpertTeamDraft, XpertTypeEnum } from '../../../../@core'
import { createOverwriteDraftFromDsl, groupImportedDslMemories } from './import-dsl.util'

describe('import dsl util', () => {
  const createCurrentXpert = (): IXpert =>
    ({
      id: 'xpert-1',
      name: 'current-expert',
      slug: 'current-expert',
      type: XpertTypeEnum.Agent,
      title: 'Current Expert',
      workspaceId: 'workspace-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      latest: true,
      version: '1',
      api: {
        disabled: false
      },
      app: {
        disabled: false
      },
      agent: {
        id: 'agent-1',
        key: 'Agent_current',
        name: 'current-primary',
        title: 'Current Primary'
      },
      draft: {
        team: {
          id: 'xpert-1',
          name: 'current-expert',
          slug: 'current-expert',
          type: XpertTypeEnum.Agent,
          title: 'Draft Title',
          workspaceId: 'workspace-1',
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          api: {
            disabled: false
          },
          app: {
            disabled: false
          }
        },
        nodes: [],
        connections: []
      }
    }) as IXpert

  it('keeps the current xpert identity while overwriting draft content from DSL', () => {
    const currentXpert = createCurrentXpert()
    const importedDsl = {
      team: {
        id: 'xpert-imported',
        name: 'imported-expert',
        slug: 'imported-expert',
        type: XpertTypeEnum.Agent,
        title: 'Imported Title',
        description: 'Imported Description',
        agent: {
          key: 'Agent_imported'
        }
      },
      nodes: [
        {
          type: 'agent',
          key: 'Agent_imported',
          position: { x: 10, y: 20 },
          entity: {
            key: 'Agent_imported',
            title: 'Imported Primary Agent'
          }
        }
      ],
      connections: []
    } as TXpertTeamDraft

    const overwritten = createOverwriteDraftFromDsl(currentXpert, importedDsl)

    expect(overwritten.team.id).toBe('xpert-1')
    expect(overwritten.team.name).toBe('current-expert')
    expect(overwritten.team.slug).toBe('current-expert')
    expect(overwritten.team.workspaceId).toBe('workspace-1')
    expect(overwritten.team.api).toEqual({ disabled: false })
    expect(overwritten.team.app).toEqual({ disabled: false })
    expect(overwritten.team.title).toBe('Imported Title')
    expect(overwritten.team.description).toBe('Imported Description')
    expect(overwritten.team.agent).toEqual(
      expect.objectContaining({
        key: 'Agent_current',
        title: 'Current Primary'
      })
    )
    expect(overwritten.nodes[0]).toEqual(
      expect.objectContaining({
        key: 'Agent_current',
        entity: expect.objectContaining({
          key: 'Agent_current',
          id: 'agent-1',
          title: 'Current Primary'
        })
      })
    )
  })

  it('throws when the imported DSL type does not match the current xpert', () => {
    const currentXpert = createCurrentXpert()
    const importedDsl = {
      team: {
        type: XpertTypeEnum.Copilot,
        agent: {
          key: 'Agent_imported'
        }
      },
      nodes: [],
      connections: []
    } as TXpertTeamDraft

    expect(() => createOverwriteDraftFromDsl(currentXpert, importedDsl)).toThrow(
      'DSL type does not match the current xpert'
    )
  })

  it('groups imported memories by the memory type encoded in the prefix', () => {
    const grouped = groupImportedDslMemories([
      {
        prefix: 'xpert-import:qa',
        value: {
          question: 'Q1',
          answer: 'A1'
        }
      },
      {
        prefix: 'xpert-import:profile',
        value: {
          profile: 'Prefers concise answers'
        }
      }
    ])

    expect(grouped).toEqual({
      [LongTermMemoryTypeEnum.QA]: [
        {
          question: 'Q1',
          answer: 'A1'
        }
      ],
      [LongTermMemoryTypeEnum.PROFILE]: [
        {
          profile: 'Prefers concise answers'
        }
      ]
    })
  })

  it('throws when a memory prefix cannot be mapped to a supported type', () => {
    expect(() =>
      groupImportedDslMemories([
        {
          prefix: 'xpert-import:unsupported',
          value: {
            answer: 'A1',
            question: 'Q1'
          }
        }
      ])
    ).toThrow('Unsupported memory type in prefix: xpert-import:unsupported')
  })
})
