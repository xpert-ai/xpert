import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { DialogRef } from '@angular/cdk/dialog'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { HeaderAboutComponent } from './about.component'
import { WebUpdateService } from '../../../@core/services/web-update/web-update.service'
import { Store } from '../../../@core'
import { AppService } from '../../../app.service'
import { UsersService } from '@cloud/app/@core/state'
import { I18nService } from '@cloud/app/@shared/i18n'

jest.mock('@xpert-ai/headless-ui', () => ({ XpDialogFrameImports: [], ZardButtonComponent: class {}, ThemesEnum: {} }))
jest.mock('../../../@core', () => ({
  Store: class {},
  LANGUAGES: [],
  injectHelpWebsite: () => () => '',
  injectToastr: () => ({})
}))
jest.mock('../../../app.service', () => ({ AppService: class {} }))
jest.mock('@cloud/app/@core/state', () => ({ UsersService: class {} }))
jest.mock('@cloud/app/@shared/i18n', () => ({ I18nService: class {} }))
jest.mock('../../../@core/services/web-update/web-update.service', () => ({ WebUpdateService: class {} }))

describe('About update entry', () => {
  const updater = {
    statusKey: signal('Available'),
    state: signal({ status: 'available', dismissed: true }),
    available: signal(true),
    updating: signal(false),
    check: jest.fn(),
    update: jest.fn()
  }
  beforeEach(async () => {
    updater.check.mockClear()
    updater.update.mockClear()
    updater.state.set({ status: 'available', dismissed: true })
    updater.available.set(true)
    await TestBed.configureTestingModule({
      imports: [HeaderAboutComponent, TranslateModule.forRoot()],
      providers: [
        { provide: WebUpdateService, useValue: updater },
        ...[DialogRef, Router, Store, AppService, UsersService, I18nService].map((provide) => ({
          provide,
          useValue: {}
        }))
      ]
    })
      .overrideComponent(HeaderAboutComponent, {
        set: { imports: [TranslateModule], schemas: [NO_ERRORS_SCHEMA] }
      })
      .compileComponents()
  })
  afterEach(() => TestBed.resetTestingModule())

  it('checks on open and offers update even after the notice was dismissed', () => {
    const fixture = TestBed.createComponent(HeaderAboutComponent)
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    const button = root.querySelector<HTMLButtonElement>('footer button')
    if (!button) throw new Error('About update button missing')
    expect(updater.check).toHaveBeenCalledTimes(1)
    expect(button.textContent).toContain('XP.WebUpdate.UpdateNow')
    button.click()
    expect(updater.update).toHaveBeenCalledTimes(1)
    expect(root.textContent).not.toContain('XP.MENU.IsLatest')
  })

  it('offers retry after a failed check, including a previously discovered update', () => {
    updater.state.set({ status: 'failed', dismissed: true })
    const fixture = TestBed.createComponent(HeaderAboutComponent)
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    const button = root.querySelector<HTMLButtonElement>('footer button')
    if (!button) throw new Error('About update button missing')
    expect(button.textContent).toContain('XP.WebUpdate.Retry')
    button.click()
    expect(updater.check).toHaveBeenCalledTimes(2)
    expect(updater.update).not.toHaveBeenCalled()
  })
})
