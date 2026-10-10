import { Component, signal } from '@angular/core'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { WorkbenchLoadingIndicatorComponent } from './workbench-loading-indicator.component'

@Component({
  standalone: true,
  imports: [WorkbenchLoadingIndicatorComponent],
  template: `
    @if (loading()) {
      <xp-workbench-loading-indicator />
    } @else {
      <div data-chat-content>Chat</div>
    }
  `
})
class TestHost {
  readonly loading = signal(true)
}

describe('Workbench loading feedback', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost, TranslateModule.forRoot()] })
  })

  afterEach(() => TestBed.resetTestingModule())

  it('does not flash feedback during quick navigation or after the chat is ready', fakeAsync(() => {
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    tick(300)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()

    fixture.componentInstance.loading.set(false)
    fixture.detectChanges()
    tick(500)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-chat-content]')).not.toBeNull()
  }))

  it('shows only a thin accessible indicator for a slow load and clears when ready', fakeAsync(() => {
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    tick(400)
    fixture.detectChanges()
    const status: HTMLElement = fixture.nativeElement.querySelector('[role="status"]')
    expect(status.classList.contains('h-0.5')).toBe(true)
    expect(status.classList.contains('pointer-events-none')).toBe(true)
    expect(status.querySelector('.sr-only')?.textContent).toContain('XP.Common.Loading')

    fixture.componentInstance.loading.set(false)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()

    fixture.componentInstance.loading.set(true)
    fixture.detectChanges()
    tick(399)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
    fixture.destroy()
    tick(1)
  }))
})
