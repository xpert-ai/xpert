import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom, isObservable } from 'rxjs'
import { DirtyCheckGuard, dirtyCheckGuard } from './dirty-check.guard'

describe.each(['class', 'function'] as const)('%s dirty-check confirmation', (kind) => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DirtyCheckGuard,
        {
          provide: TranslateService,
          useValue: { instant: (key: string, params?: { Default?: string }) => params?.Default ?? key }
        }
      ]
    })
  })

  afterEach(() => TestBed.inject(Dialog).closeAll())

  function decision(dirty: boolean) {
    const component = { isDirty: () => dirty }
    const route = new ActivatedRouteSnapshot()
    const result =
      kind === 'class'
        ? TestBed.inject(DirtyCheckGuard).canDeactivate(component, route)
        : TestBed.runInInjectionContext(() =>
            dirtyCheckGuard(component, route, {} as RouterStateSnapshot, {} as RouterStateSnapshot)
          )
    if (!isObservable(result)) throw new Error('Expected a finite navigation decision')
    return firstValueFrom(result)
  }

  it('allows navigation directly when there are no unsaved changes', async () => {
    expect(await decision(false)).toBe(true)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it.each([false, true])('preserves the leave decision from the actual dialog (%s)', async (confirmed) => {
    const pending = decision(true)
    TestBed.tick()
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect(dialog.querySelector('[xpDialogHeading]')?.textContent).toContain('Confirm')
    const action = confirmed ? 'action' : 'cancel'
    dialog.querySelector<HTMLButtonElement>(`[data-testid="z-alert-dialog-${action}"]`)!.click()
    expect(await pending).toBe(confirmed)
  })
})
