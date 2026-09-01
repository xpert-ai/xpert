import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import type { IXpert } from '@xpert-ai/contracts'
import { XpertTaskDialogService } from './task-dialog.service'

describe('XpertTaskDialogService', () => {
  it('keeps the Project and Project expert allowlist in the shared task dialog', () => {
    const dialog = { open: jest.fn(() => ({ closed: null })) }
    const availableXperts = [{ id: 'xpert-1' }] as IXpert[]
    TestBed.configureTestingModule({
      providers: [XpertTaskDialogService, { provide: Dialog, useValue: dialog }]
    })
    const service = TestBed.inject(XpertTaskDialogService)

    service.openCreateTask({
      projectId: 'project-1',
      availableXperts
    })

    expect(dialog.open.mock.calls[0][1]?.data).toEqual({
      total: undefined,
      lockXpertSelection: false,
      availableXperts,
      task: { projectId: 'project-1' }
    })
  })
})
