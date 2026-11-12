import { Component, input, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { BehaviorSubject } from 'rxjs'
import { PROJECT_CONFIGURATION_VIEW, type IXpertProject } from '@xpert-ai/contracts'
import { Store } from '../../@core'
import { ExtensionHostOutletComponent } from '../../@shared/view-extension/extension-host-outlet.component'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectConfigComponent } from './project-config.component'
@Component({ standalone: true, selector: 'xp-extension-host-outlet', template: '' })
class ViewOutlet {
  hostType = input(''); hostId = input(''); runtimeUserId = input<string | null>(); slot = input('');
  viewKey = input(''); fillAvailableHeight = input(false); mode = input('')
}
it('uses the same portable view and follows project and user changes', () => {
  const project = signal<IXpertProject | null>({ id: 'first', name: 'First' })
  const user$ = new BehaviorSubject({ id: 'user-a' })
  TestBed.configureTestingModule({ imports: [XpertProjectConfigComponent], providers: [
    { provide: XpertProjectFacade, useValue: { project } }, { provide: Store, useValue: { user$ } }
  ] }).overrideComponent(XpertProjectConfigComponent, {
    remove: { imports: [ExtensionHostOutletComponent] }, add: { imports: [ViewOutlet] }
  })
  const fixture = TestBed.createComponent(XpertProjectConfigComponent)
  fixture.detectChanges()
  const outlet = fixture.debugElement.query(By.directive(ViewOutlet)).injector.get(ViewOutlet)
  expect(outlet.hostType()).toBe('project')
  expect(outlet.slot()).toBe('project.configuration')
  expect(outlet.viewKey()).toBe(PROJECT_CONFIGURATION_VIEW)
  expect(outlet.hostId()).toBe('first')
  expect(outlet.runtimeUserId()).toBe('user-a')
  project.set({ id: 'second', name: 'Second' }); user$.next({ id: 'user-b' }); fixture.detectChanges()
  expect(outlet.hostId()).toBe('second'); expect(outlet.runtimeUserId()).toBe('user-b')
  project.set(null); fixture.detectChanges()
  expect(fixture.debugElement.query(By.directive(ViewOutlet))).toBeNull()
  TestBed.resetTestingModule()
})
