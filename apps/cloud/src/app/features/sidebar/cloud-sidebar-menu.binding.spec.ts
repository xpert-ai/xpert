import { type WritableSignal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'
import { BehaviorSubject } from 'rxjs'
import { Store } from '../../@core/state'
import { XpertSettingsService } from '../../@core/services/xpert-settings.service'
import { CloudSidebarAssistantsComponent } from './cloud-sidebar-assistants.component'
import { CloudSidebarMenuComponent } from './cloud-sidebar-menu.component'

jest.mock('./cloud-sidebar-assistants.component', () => {
  const { Component, signal } = jest.requireActual('@angular/core')

  @Component({ standalone: true, selector: 'xp-cloud-sidebar-assistants', template: '' })
  class CloudSidebarAssistantsComponent {
    readonly isClawXpertConfigured = signal(false)
  }

  return { CloudSidebarAssistantsComponent }
})

describe('CloudSidebarMenuComponent binding visibility', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CloudSidebarMenuComponent],
      providers: [
        provideRouter([]),
        { provide: XpertSettingsService, useValue: { openBoundAssistant: jest.fn() } },
        {
          provide: Store,
          useValue: {
            selectedWorkspace$: new BehaviorSubject({ id: 'workspace' }),
            workspaceId$: new BehaviorSubject('workspace')
          }
        }
      ]
    }).overrideComponent(CloudSidebarMenuComponent, {
      set: {
        imports: [CloudSidebarAssistantsComponent],
        template: `
          @for (group of groups(); track group.key) {
            @for (entry of group.entries; track trackMenuEntry($index, entry)) {
              @if (entry.item; as item) {
                <button>{{ item.title }}</button>
              } @else {
                <xp-cloud-sidebar-assistants />
              }
            }
          }
        `
      }
    })
  })

  afterEach(() => TestBed.resetTestingModule())

  it('hides the entire More group until a valid binding is available and preserves the assistant state', () => {
    const fixture = TestBed.createComponent(CloudSidebarMenuComponent)
    fixture.componentRef.setInput('menus', [{ title: 'New task', link: '/chat/clawxpert/c' }])
    fixture.detectChanges()
    const assistants: { isClawXpertConfigured: WritableSignal<boolean> } = fixture.debugElement.query(
      By.directive(CloudSidebarAssistantsComponent)
    ).componentInstance
    const more = () =>
      fixture.componentInstance
        .groups()
        .flatMap((group) => group.items)
        .find((item) => item.data?.translationKey === 'More')

    expect(more()).toBeUndefined()
    expect(fixture.nativeElement.textContent).toContain('New task')
    expect(fixture.nativeElement.textContent).toContain('Experts, Skills and Connectors')

    assistants.isClawXpertConfigured.set(true)
    fixture.detectChanges()
    expect(more()?.children?.map((item) => item.title)).toEqual([
      'Resource library',
      'My knowledgebases',
      'Assistant settings'
    ])
    expect(fixture.debugElement.query(By.directive(CloudSidebarAssistantsComponent)).componentInstance).toBe(assistants)

    assistants.isClawXpertConfigured.set(false)
    fixture.detectChanges()
    expect(more()).toBeUndefined()
    expect(fixture.nativeElement.textContent).not.toContain('More')
    expect(fixture.debugElement.query(By.directive(CloudSidebarAssistantsComponent)).componentInstance).toBe(assistants)

    assistants.isClawXpertConfigured.set(true)
    fixture.detectChanges()
    expect(more()).toBeDefined()
  })
})
