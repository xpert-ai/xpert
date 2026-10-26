import { OverlayContainer } from '@angular/cdk/overlay'
import { Component } from '@angular/core'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { IXpert } from '@xpert-ai/contracts'
import { AssistantProfileDirective } from '../../@shared/xpert/assistant-profile/assistant-profile.directive'
import { CloudSidebarHoverPanelDirective } from './cloud-sidebar-hover-panel.directive'
import { CloudSidebarPanelTriggerDirective } from './cloud-sidebar-panel-trigger.directive'

jest.mock('../../@shared/xpert/assistant-profile/assistant-profile.component', () => {
  const { Component, Input, Output, EventEmitter } = jest.requireActual('@angular/core')
  @Component({ standalone: true, template: '<button data-profile-card>{{ assistantId }}</button>' })
  class AssistantProfileComponent {
    @Input() assistantId = ''
    @Input() summary: unknown
    @Output() closed = new EventEmitter<void>()
    @Output() holdOpen = new EventEmitter<boolean>()
  }
  return { AssistantProfileComponent }
})

@Component({
  standalone: true,
  imports: [CloudSidebarHoverPanelDirective, CloudSidebarPanelTriggerDirective, AssistantProfileDirective],
  template: `
    <nav [xpSidebarHoverPanel]="true" [xpSidebarPanelScope]="scope">
      <button
        data-sidebar-panel-title="Assistant"
        [xpSidebarPanelTrigger]="body"
        [xpSidebarPanelHeader]="header"
        [xpSidebarPanelAssistant]="assistant"
        xpSidebarPanelKey="assistant:a"
      >
        Assistant
      </button>
      <button data-sidebar-panel-title="Bosi" [xpSidebarPanelTrigger]="body" xpSidebarPanelKey="bosi">Bosi</button>
      <ng-template #body><span>Content</span></ng-template>
      <ng-template #header let-xpert="assistant" let-holdOpen="holdOpen">
        <button
          data-profile-avatar
          [xpAssistantProfile]="xpert.id"
          [summary]="xpert"
          (profileVisibleChange)="holdOpen($event)"
        >
          Avatar
        </button>
      </ng-template>
    </nav>
  `
})
class Host {
  scope = 'org-a'
  assistant = { id: 'assistant-a' } as IXpert
}

describe('assistant panel header profile interaction', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Host, TranslateModule.forRoot()], providers: [provideRouter([])] })
    const fixture = TestBed.createComponent(Host)
    fixture.detectChanges()
    fixture.nativeElement.querySelector('button').click()
    fixture.detectChanges()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    const avatar = overlay.querySelector<HTMLButtonElement>('[data-profile-avatar]')!
    const region = overlay.querySelector<HTMLElement>('[role="region"]')!
    return { fixture, overlay, avatar, region }
  }

  it('focuses search on opening, then keeps the floating panel open while entering its profile card', fakeAsync(() => {
    const { fixture, overlay, avatar, region } = setup()
    expect(document.activeElement?.hasAttribute('data-profile-avatar')).toBe(false)
    tick(400)
    expect(overlay.querySelector('[data-profile-card]')).toBeNull()
    // Simulate a pointer user moving from the avatar across the gap to the nested CDK overlay.
    region.dispatchEvent(new MouseEvent('pointerenter'))
    ;(document.activeElement as HTMLElement).blur()
    avatar.dispatchEvent(new MouseEvent('mouseenter'))
    tick(350)
    fixture.detectChanges()
    expect(overlay.querySelector('[data-profile-card]')?.textContent).toBe('assistant-a')
    avatar.dispatchEvent(new MouseEvent('mouseleave'))
    region.dispatchEvent(new MouseEvent('pointerleave'))
    overlay
      .querySelector('[data-profile-card]')!
      .closest('.cdk-overlay-pane')!
      .dispatchEvent(new MouseEvent('mouseenter'))
    tick(400)
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('false')
    expect(overlay.querySelector('[data-profile-card]')).not.toBeNull()
    overlay
      .querySelector('[data-profile-card]')!
      .closest('.cdk-overlay-pane')!
      .dispatchEvent(new MouseEvent('mouseleave'))
    tick(500)
    fixture.detectChanges()
    expect(overlay.querySelector('[data-profile-card]')).toBeNull()
    expect(region.getAttribute('aria-hidden')).toBe('true')
    fixture.destroy()
  }))

  it('destroys the old profile when switching menus and cancels delayed opening at the scope boundary', fakeAsync(() => {
    const { fixture, overlay, avatar, region } = setup()
    avatar.dispatchEvent(new MouseEvent('mouseenter'))
    tick(350)
    fixture.detectChanges()
    fixture.nativeElement.querySelector('[data-sidebar-panel-title="Bosi"]').click()
    fixture.detectChanges()
    expect(overlay.querySelector('[data-profile-card]')).toBeNull()
    expect(overlay.querySelector('[data-profile-avatar]')).toBeNull()
    fixture.nativeElement.querySelector('[data-sidebar-panel-title="Assistant"]').click()
    fixture.detectChanges()
    overlay.querySelector('[data-profile-avatar]')!.dispatchEvent(new MouseEvent('mouseenter'))
    fixture.componentInstance.scope = 'org-b'
    fixture.detectChanges()
    tick(500)
    fixture.detectChanges()
    expect(region.getAttribute('aria-hidden')).toBe('true')
    expect(overlay.querySelector('[data-profile-card]')).toBeNull()
    fixture.destroy()
  }))
})
