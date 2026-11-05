import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, of } from 'rxjs'
import { AssistantBindingService, Store, ToastrService, XpertAPIService } from '../../../@core'
import { AppService } from '../../../app.service'
import { ProfileWorkspacePetComponent } from '../../setting/account/profile-workspace-pet.component'
import { XpertAssistantFacade } from './assistant.facade'
import { XpertSharedAssistantComponent } from './shared-assistant.component'

jest.mock('../../../@core', () => ({
  Store: class {},
  AssistantBindingService: class {},
  XpertAPIService: class {},
  ToastrService: class {},
  AssistantCode: { XPERT_SHARED: 'xpert_shared' },
  AssistantBindingSourceScope: { NONE: 'none' },
  resolveAbsoluteApiBaseUrl: () => window.location.origin
}))
jest.mock('@cloud/app/@core/state', () => ({ injectWorkspace: () => () => ({ id: 'workspace' }) }))
jest.mock('../../../app.service', () => ({ AppService: class {} }))
jest.mock('../../assistant/data-source-create.runtime', () => ({ injectDataSourceCreateCommand: () => {} }))
jest.mock('../../assistant/workspace-connector-connect.runtime', () => ({
  injectWorkspaceConnectorConnect: () => () => {}
}))
jest.mock('../../assistant/workbench-file-preview-dialog.component', () => ({
  openWorkbenchFilePreviewDialog: jest.fn()
}))

describe('workspace pet with the installed ChatKit packages', () => {
  const mount = () => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertSharedAssistantComponent, ProfileWorkspacePetComponent],
      providers: [
        XpertAssistantFacade,
        { provide: Router, useValue: { url: '/xpert/w/workspace', events: EMPTY } },
        { provide: Dialog, useValue: {} },
        { provide: XpertAPIService, useValue: {} },
        { provide: ToastrService, useValue: {} },
        { provide: AppService, useValue: { theme$: signal({ primary: 'light' }), lang: () => 'en' } },
        {
          provide: Store,
          useValue: { user$: of({ id: 'member' }), token$: of('fixture'), selectOrganizationId: () => of('org') }
        },
        {
          provide: AssistantBindingService,
          useValue: {
            getEffective: () => of({ enabled: true, assistantId: 'assistant', sourceScope: 'organization' }),
            isWorkspaceAssistantAvailable: () => of(true)
          }
        }
      ]
    })
    const workspace = TestBed.createComponent(XpertSharedAssistantComponent)
    const profile = TestBed.createComponent(ProfileWorkspacePetComponent)
    const refresh = () => {
      flushMicrotasks()
      workspace.detectChanges()
      profile.detectChanges()
      flushMicrotasks()
      workspace.detectChanges()
      profile.detectChanges()
    }
    refresh()
    const root: HTMLElement = workspace.nativeElement
    const settings: HTMLElement = profile.nativeElement
    return {
      refresh,
      launcher: () => root.querySelector('xpertai-chatkit'),
      toggle: settings.querySelector<HTMLButtonElement>('[role="switch"]')!
    }
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    localStorage.removeItem('xpert:workspace-pet:hidden:["member","org"]')
  })

  it('closes from the pet menu, stays absent after remount, and restores from the personal switch', fakeAsync(() => {
    let page = mount()
    const pet = () => page.launcher()?.shadowRoot?.querySelector<HTMLElement>('[data-chatkit-host-pet]')
    expect(pet()).toBeTruthy()
    pet()!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    const close = page.launcher()!.shadowRoot!.querySelector<HTMLButtonElement>('[role="menuitem"]')!
    expect(close.textContent).toMatch(/close pet/i)
    close.click()
    page.refresh()
    expect(page.launcher()).toBeNull()
    expect(page.toggle.getAttribute('aria-checked')).toBe('false')

    TestBed.resetTestingModule()
    page = mount()
    expect(page.launcher()).toBeNull()
    expect(page.toggle.getAttribute('aria-checked')).toBe('false')
    expect(page.toggle.disabled).toBe(false)
    page.toggle.click()
    page.refresh()
    expect(page.toggle.getAttribute('aria-checked')).toBe('true')
    expect(pet()).toBeTruthy()

    TestBed.resetTestingModule()
    page = mount()
    expect(pet()).toBeTruthy()
    TestBed.resetTestingModule()
  }))
})
