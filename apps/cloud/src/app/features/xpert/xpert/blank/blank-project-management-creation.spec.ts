jest.mock('./blank-wizard-resources', () => ({ BlankWizardResources: class {} }))
jest.mock('apps/cloud/src/app/@shared/xpert', () => ({ XpertBasicFormComponent: class {} }))
jest.mock('apps/cloud/src/app/@shared/copilot', () => ({ CopilotConfigFormComponent: class {} }))

import { signal } from '@angular/core'
import { of } from 'rxjs'
import { IXpert, TXpertTeamDraft } from '@xpert-ai/contracts'
import { XpertNewBlankComponent } from './blank.component'

function fixture() {
  const xpert: IXpert = { id: 'assistant' }
  const draft: TXpertTeamDraft = { team: { id: xpert.id }, nodes: [], connections: [], checklist: [] }
  const configured: IXpert = { ...xpert, draft }
  const projectManagement = { enabled: signal(true), apply: jest.fn(async () => configured) }
  const publish = jest.fn(async () => configured)
  const component = Object.assign(Object.create(XpertNewBlankComponent.prototype) as XpertNewBlankComponent, {
    completionMode: 'publish',
    projectManagement,
    isAgentType: () => true,
    initializeDraftIfNeeded: jest.fn(async () => ({
      xpert,
      draftSaved: true,
      hasBlockingChecklist: false,
      preparationFailed: false
    })),
    publishCreatedXpert: publish,
    showPreconfigurationNotSavedWarning: jest.fn(),
    showAutoPublishInterruptedWarning: jest.fn(),
    showAutoPublishFailedWarning: jest.fn(),
    _toastr: { error: jest.fn() },
    xpertService: { getTeam: jest.fn(() => of(configured)) }
  })
  return { component, xpert, configured, projectManagement, publish }
}

describe('Project management in both Cloud creation flows', () => {
  it.each(['completeCreation', 'completeImportedCreation'] as const)(
    'composes and saves before %s publishes',
    async (method) => {
      const { component, xpert, configured, projectManagement, publish } = fixture()
      expect(await component[method](xpert)).toEqual({ xpert: configured, status: 'published' })
      expect(projectManagement.apply).toHaveBeenCalledWith(xpert)
      expect(publish).toHaveBeenCalledWith(configured)
      expect(projectManagement.apply.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0])
    }
  )

  it.each(['completeCreation', 'completeImportedCreation'] as const)(
    'never publishes when capability application fails during %s',
    async (method) => {
      const { component, xpert, projectManagement, publish } = fixture()
      projectManagement.apply.mockRejectedValue(new Error('Model access revoked'))
      expect(await component[method](xpert)).toEqual({ xpert, status: 'created' })
      expect(publish).not.toHaveBeenCalled()
      expect(component._toastr.error).toHaveBeenCalledWith('Model access revoked')
    }
  )

  it('persists a selected capability when the user chooses to create a draft', async () => {
    const { component, xpert, configured, publish } = fixture()
    Object.defineProperty(component, 'completionMode', { value: 'create' })
    expect(await component.completeCreation(xpert)).toEqual({ xpert: configured, status: 'created' })
    expect(publish).not.toHaveBeenCalled()
  })
})
