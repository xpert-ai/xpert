import { DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { AiModelTypeEnum, TCopilotModel, TXpertTeamDraft } from '@xpert-ai/contracts'
import { ToastrService, XpertAPIService, XpertTypeEnum } from 'apps/cloud/src/app/@core'

jest.mock('../xpert.component', () => ({ XpertComponent: class XpertComponent {} }))
jest.mock('apps/cloud/src/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))

import { XpertComponent } from '../xpert.component'
import { XpertService } from '../xpert.service'
import { clearLegacyInheritedPrimaryAgentModel, XpertBasicComponent } from './basic.component'

const initialModel = {
  copilotId: 'copilot-qwen',
  modelType: AiModelTypeEnum.LLM,
  model: 'qwen-initial'
} satisfies TCopilotModel
const canvasModel = {
  copilotId: 'copilot-moonshot',
  modelType: AiModelTypeEnum.LLM,
  model: 'moonshot-v1-32k'
} satisfies TCopilotModel

describe('clearLegacyInheritedPrimaryAgentModel', () => {
  function createDraft(nodeModel?: TCopilotModel): TXpertTeamDraft {
    return {
      team: {
        copilotModel: initialModel,
        agent: { key: 'Agent_primary', copilotModel: initialModel }
      },
      nodes: [
        {
          type: 'agent',
          key: 'Agent_primary',
          position: { x: 0, y: 0 },
          entity: { key: 'Agent_primary', ...(nodeModel ? { copilotModel: nodeModel } : {}) }
        }
      ],
      connections: []
    }
  }

  it('clears a legacy model copied from the team so the Agent inherits future changes', () => {
    const nodes = clearLegacyInheritedPrimaryAgentModel(createDraft(initialModel))

    expect(nodes?.[0]).toEqual(
      expect.objectContaining({
        entity: expect.objectContaining({ copilotModel: undefined })
      })
    )
  })

  it('does not rewrite an Agent that already inherits through an empty model', () => {
    expect(clearLegacyInheritedPrimaryAgentModel(createDraft())).toBeNull()
  })

  it('preserves an explicitly selected canvas Agent model', () => {
    expect(clearLegacyInheritedPrimaryAgentModel(createDraft(canvasModel))).toBeNull()
  })
})

describe('XpertBasicComponent workspace data scope', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it.each([
    ['user', 'user'],
    ['shared', 'shared'],
    [undefined, 'shared']
  ] as const)('shows %s as the immutable %s scope', (workspaceDataScope, expectedScope) => {
    const xpert = signal({
      id: 'xpert-1',
      type: XpertTypeEnum.Agent,
      workspaceDataScope,
      draft: { team: {} }
    })

    TestBed.configureTestingModule({
      providers: [
        { provide: DialogRef, useValue: {} },
        { provide: ToastrService, useValue: {} },
        { provide: XpertAPIService, useValue: {} },
        { provide: XpertComponent, useValue: {} },
        { provide: XpertService, useValue: { paramId: signal('xpert-1'), xpert } }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new XpertBasicComponent())

    expect(component.workspaceDataScope()).toBe(expectedScope)
  })
})
