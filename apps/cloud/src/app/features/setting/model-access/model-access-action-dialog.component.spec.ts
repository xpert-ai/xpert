import { TestBed } from '@angular/core/testing'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import { ModelAccessActionDialogComponent } from './model-access-action-dialog.component'

describe('ModelAccessActionDialogComponent', () => {
  let dialogRef: { close: jest.Mock }
  let component: ModelAccessActionDialogComponent

  beforeEach(() => {
    dialogRef = { close: jest.fn() }

    TestBed.configureTestingModule({
      imports: [ModelAccessActionDialogComponent],
      providers: [
        { provide: ZardDialogRef, useValue: dialogRef },
        { provide: Z_MODAL_DATA, useValue: { mode: 'approve' } }
      ]
    }).overrideComponent(ModelAccessActionDialogComponent, {
      set: {
        imports: [],
        template: ''
      }
    })

    component = TestBed.createComponent(ModelAccessActionDialogComponent).componentInstance
  })

  it('formats the selected expiration date for the API', () => {
    component.form.setValue({
      validUntil: new Date(2027, 2, 14),
      message: 'Approved'
    })

    component.submit()

    expect(dialogRef.close).toHaveBeenCalledWith({
      validUntil: '2027-03-14',
      note: 'Approved'
    })
  })
})
