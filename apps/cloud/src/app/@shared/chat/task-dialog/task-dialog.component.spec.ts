import type { IXpert } from '@xpert-ai/contracts'
import {
  canManageTaskPersonalConnectors,
  isProjectTaskXpertSelectionValid,
  mergeTaskConnectorSelection
} from './task-dialog.component'

describe('isProjectTaskXpertSelectionValid', () => {
  const availableXperts = [{ id: 'xpert-1' }] as IXpert[]

  it('accepts only a Project expert for Project automation', () => {
    expect(isProjectTaskXpertSelectionValid('project-1', 'xpert-1', availableXperts)).toBe(true)
    expect(isProjectTaskXpertSelectionValid('project-1', 'xpert-removed', availableXperts)).toBe(false)
  })

  it('keeps the legacy non-Project task behavior', () => {
    expect(isProjectTaskXpertSelectionValid(undefined, 'xpert-removed', availableXperts)).toBe(true)
  })
})

describe('Project automation Connector ownership', () => {
  it('allows only the effective run-as user to select personal Connectors', () => {
    expect(canManageTaskPersonalConnectors({ runAsUserId: 'user-1' }, 'user-1')).toBe(true)
    expect(canManageTaskPersonalConnectors({ runAsUserId: 'user-1' }, 'manager-1')).toBe(false)
    expect(canManageTaskPersonalConnectors({ createdById: 'user-1' }, 'manager-1')).toBe(false)
    expect(canManageTaskPersonalConnectors({}, 'manager-1')).toBe(true)
  })

  it('preserves personal selections that another manager is not allowed to change', () => {
    expect(mergeTaskConnectorSelection(['shared-2'], ['shared-1', 'personal-1'], ['personal-1'])).toEqual([
      'shared-2',
      'personal-1'
    ])
  })
})
