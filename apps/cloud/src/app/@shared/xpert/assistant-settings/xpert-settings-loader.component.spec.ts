import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import {
  XpertSettingsLoaderComponent,
  type XpertSettingsLoaderData,
  type XpertSettingsLoadState
} from './xpert-settings-loader.component'
import type { XpertSettingsDialogData } from './xpert-settings.types'

@Component({ standalone: true, template: '<p data-testid="editor">{{ data.source.id }}</p>' })
class EditorStub {
  readonly data = inject<XpertSettingsDialogData>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)
}

describe('settings loading shell', () => {
  afterEach(() => TestBed.resetTestingModule())

  function setup() {
    const state = signal<XpertSettingsLoadState>({ status: 'loading' })
    const retry = jest.fn(() => state.set({ status: 'loading' }))
    const backdropClick = new Subject<MouseEvent>()
    const keydownEvents = new Subject<KeyboardEvent>()
    const ref = { close: jest.fn(), backdropClick, keydownEvents }
    TestBed.configureTestingModule({
      imports: [XpertSettingsLoaderComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { state, retry } satisfies XpertSettingsLoaderData },
        { provide: DialogRef, useValue: ref }
      ]
    })
    const fixture = TestBed.createComponent(XpertSettingsLoaderComponent)
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    return { fixture, element, state, retry, ref }
  }

  function readyState(): XpertSettingsLoadState {
    return {
      status: 'ready',
      component: EditorStub,
      data: {
        section: 'general',
        selectSection: jest.fn(),
        source: {
          id: 'fixture',
          draft: signal({ team: { id: 'fixture' }, nodes: [], connections: [] }),
          workspaceDataScope: 'shared',
          unsaved: signal(false),
          saving: signal(false),
          error: signal(null),
          update: jest.fn(),
          save: jest.fn(async () => {})
        }
      }
    }
  }

  it('shows a busy status immediately and permits closing while requests are pending', () => {
    const { element, ref } = setup()
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(element.querySelector('[role="status"]')?.textContent).toContain('XP.XpertSettings.LoadingConfiguration')
    expect(element.querySelector('[data-testid="editor"]')).toBeNull()
    element.querySelector<HTMLButtonElement>('[xpDialogCloseButton]').click()
    expect(ref.close).toHaveBeenCalledTimes(1)
  })

  it('renders load failures with retry and close actions, then returns to the loading state', () => {
    const { fixture, element, state, retry, ref } = setup()
    state.set({ status: 'error', message: 'Connection unavailable' })
    fixture.detectChanges()
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Connection unavailable')
    expect(element.querySelector('[aria-busy="true"]')).toBeNull()
    const buttons = element.querySelectorAll<HTMLButtonElement>('footer button')
    buttons[0].click()
    expect(ref.close).toHaveBeenCalledTimes(1)
    buttons[1].click()
    fixture.detectChanges()
    expect(retry).toHaveBeenCalledTimes(1)
    expect(element.querySelector('[role="status"]')).not.toBeNull()
    expect(element.querySelector('[role="alert"]')).toBeNull()
    expect(element.querySelector('footer button')).toBeNull()
  })

  it('mounts the editor in the same shell with its own data and the existing dialog reference', () => {
    const { fixture, element, state, ref } = setup()
    state.set(readyState())
    fixture.detectChanges()
    expect(element.querySelector('[role="status"]')).toBeNull()
    expect(element.querySelector('[data-testid="editor"]')?.textContent).toBe('fixture')
    const editor: EditorStub = fixture.debugElement.query(By.directive(EditorStub)).componentInstance
    expect(editor.dialogRef).toBe(ref)
    ref.backdropClick.next(new MouseEvent('click'))
    ref.keydownEvents.next(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ref.close).not.toHaveBeenCalled()
  })

  it.each(['loading', 'error'] as const)('handles Escape and backdrop clicks during %s', (status) => {
    const { fixture, state, ref } = setup()
    if (status === 'error') state.set({ status, message: 'Offline' })
    fixture.detectChanges()
    ref.keydownEvents.next(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    ref.backdropClick.next(new MouseEvent('click'))
    expect(ref.close).toHaveBeenCalledTimes(2)
    fixture.destroy()
    expect(ref.backdropClick.observed).toBe(false)
    expect(ref.keydownEvents.observed).toBe(false)
  })
})
