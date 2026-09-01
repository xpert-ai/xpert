jest.mock('../basic-form/basic-form.component', () => ({
  XpertBasicFormComponent: class XpertBasicFormComponent {}
}))

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { FormBuilder } from '@angular/forms'
import { TestBed } from '@angular/core/testing'
import { ToastrService, XpertAPIService } from 'apps/cloud/src/app/@core'
import { XpertBasicDialogComponent } from './basic-dialog.component'

describe('XpertBasicDialogComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('inherits user isolation for duplication and returns the selected creation policy', () => {
    const dialogRef = { close: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        {
          provide: DIALOG_DATA,
          useValue: {
            name: 'copy-agent',
            avatar: null,
            description: 'Copy',
            title: 'Copy Agent',
            copilotModel: null,
            workspaceDataScope: 'user'
          }
        },
        { provide: DialogRef, useValue: dialogRef },
        { provide: XpertAPIService, useValue: {} },
        { provide: ToastrService, useValue: {} }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new XpertBasicDialogComponent())

    expect(component.formGroup.controls.isolateWorkspaceData.value).toBe(true)
    component.apply()
    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'copy-agent',
        workspaceDataScope: 'user'
      })
    )
  })

  it('defaults old sources to shared isolation', () => {
    const dialogRef = { close: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        {
          provide: DIALOG_DATA,
          useValue: {
            name: 'legacy-agent',
            avatar: null,
            description: 'Legacy',
            title: 'Legacy Agent',
            copilotModel: null
          }
        },
        { provide: DialogRef, useValue: dialogRef },
        { provide: XpertAPIService, useValue: {} },
        { provide: ToastrService, useValue: {} }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new XpertBasicDialogComponent())

    expect(component.formGroup.controls.isolateWorkspaceData.value).toBe(false)
    component.apply()
    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceDataScope: 'shared'
      })
    )
  })
})
