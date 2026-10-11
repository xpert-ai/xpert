import { Dialog } from '@angular/cdk/dialog'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { ZardToastService } from '@xpert-ai/headless-ui'
import { ToastrService } from './toastr.service'

describe('ToastrService confirmation layout opt-in', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        { provide: ZardToastService, useValue: {} },
        {
          provide: TranslateService,
          useValue: { instant: (key: string, params?: { Default?: string }) => params?.Default ?? key }
        }
      ]
    })
  )

  afterEach(() => TestBed.inject(Dialog).closeAll())

  it.each([false, true])(
    'returns the selected result through the shared dialog (%s)',
    fakeAsync((confirmed: boolean) => {
      const received = jest.fn()
      TestBed.inject(ToastrService)
        .confirm({ code: 'ConfirmOperation', params: { Default: 'Transfer to Reviewer?' }, layout: 'standard' })
        .subscribe(received)
      TestBed.tick()
      tick()
      const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
      expect(dialog.textContent).toContain('Transfer to Reviewer?')
      expect(document.activeElement?.getAttribute('data-testid')).toBe('z-alert-dialog-cancel')
      const action = confirmed ? 'action' : 'cancel'
      dialog.querySelector<HTMLButtonElement>(`[data-testid="z-alert-dialog-${action}"]`)!.click()
      tick()
      expect(received.mock.calls).toEqual([[confirmed]])
    })
  )

  it('keeps unselected callers on their existing layout', fakeAsync(() => {
    const received = jest.fn()
    TestBed.inject(ToastrService)
      .confirm({ code: 'LegacyOperation', params: 'Existing description' })
      .subscribe(received)
    TestBed.tick()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.querySelector('z-dialog')?.textContent).toContain('Existing description')
    document.querySelector<HTMLButtonElement>('[data-testid="z-alert-dialog-cancel"]')!.click()
    tick(150)
    expect(received.mock.calls).toEqual([[false]])
  }))
})
