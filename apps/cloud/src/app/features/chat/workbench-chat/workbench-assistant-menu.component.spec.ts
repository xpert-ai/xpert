import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import { AssistantBindingService, ScopeService, Store } from '../../../@core'
import { WorkbenchAssistantMenuComponent } from './workbench-assistant-menu.component'

jest.mock('../../../@core', () => ({
  AssistantBindingService: class AssistantBindingService {},
  ScopeService: class ScopeService {},
  Store: class Store {},
  AssistantBindingScope: { TENANT: 'tenant', USER: 'user' },
  AssistantCode: { CHAT_COMMON: 'chat_common', CLAWXPERT: 'clawxpert' },
  RequestScopeLevel: { TENANT: 'tenant', ORGANIZATION: 'organization' }
}))
jest.mock('../../../@shared/avatar/emoji-avatar/avatar.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')
  @Component({ selector: 'emoji-avatar', template: '' })
  class EmojiAvatarComponent {
    @Input() avatar?: unknown
    @Input() alt?: string
    @Input() fallbackLabel?: string
  }
  return { EmojiAvatarComponent }
})
jest.mock('@xpert-ai/headless-ui', () => {
  const { Directive } = jest.requireActual('@angular/core')
  @Directive({ selector: '[z-menu-content], [z-menu-item]' })
  class MenuDirective {}
  return { ZardMenuImports: [MenuDirective] }
})

describe('WorkbenchAssistantMenuComponent', () => {
  const items = [
    { id: 'a', slug: 'governance', title: 'Governance' },
    { id: 'b', slug: 'quality', title: 'Quality' },
    { id: 'a', slug: 'governance', title: 'Duplicate' },
    { id: 'old', title: 'Old version', latest: false }
  ]
  let api: { getAvailableXperts: jest.Mock }
  let router: { navigate: jest.Mock }
  const activeScope = signal({ level: 'organization' })

  beforeEach(async () => {
    activeScope.set({ level: 'organization' })
    api = { getAvailableXperts: jest.fn(() => of(items)) }
    router = { navigate: jest.fn().mockResolvedValue(true) }
    await TestBed.configureTestingModule({
      imports: [WorkbenchAssistantMenuComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AssistantBindingService, useValue: api },
        { provide: ScopeService, useValue: { activeScope } },
        { provide: Store, useValue: { userId: 'menu-user', organizationId: 'org' } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents()
  })

  async function render() {
    const fixture = TestBed.createComponent(WorkbenchAssistantMenuComponent)
    fixture.componentRef.setInput('activeId', 'a')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }

  it('uses the existing accessible assistant list and filters duplicate and old versions', async () => {
    const fixture = await render()
    expect(api.getAvailableXperts).toHaveBeenCalledWith('user', 'clawxpert')
    expect(fixture.componentInstance.assistants().map((item) => item.id)).toEqual(['a', 'b'])
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-assistant-search]')
    input.value = 'Quality'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelectorAll('[data-assistant-option]')).toHaveLength(1)
    expect(fixture.nativeElement.querySelector('[data-assistant-option]').textContent).toContain('Quality')
  })

  it('switches by the existing assistant route and does not carry the previous conversation or view query', async () => {
    const fixture = await render()
    fixture.nativeElement.querySelector('[data-assistant-option="b"]').click()
    expect(router.navigate).toHaveBeenCalledWith(['/chat/x', 'quality', 'c'])
  })

  it('marks the current assistant and closes without navigating when it is selected again', async () => {
    const fixture = await render()
    const selected = jest.fn()
    fixture.componentInstance.selected.subscribe(selected)
    const current: HTMLButtonElement = fixture.nativeElement.querySelector('[data-assistant-option="a"]')
    expect(current.getAttribute('aria-current')).toBe('page')
    current.click()
    expect(selected).toHaveBeenCalledTimes(1)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('uses tenant assistant scope when browsing the tenant', async () => {
    activeScope.set({ level: 'tenant' })
    await render()
    expect(api.getAvailableXperts).toHaveBeenCalledWith('tenant', 'chat_common')
  })

  it('filters business areas by ID without switching assistants, and combines search with a clearable filter', async () => {
    api.getAvailableXperts.mockReturnValue(
      of([
        { id: 'a', title: 'Governance', businessArea: { id: 'ops', name: 'Operations' } },
        { id: 'b', title: 'Quality', businessArea: { id: 'ops', name: 'Operations' } },
        { id: 'c', title: 'Quality Sales', businessArea: { id: 'sales', name: 'Sales' } },
        { id: 'd', title: 'Other team', businessArea: { id: 'different-ops', name: 'Operations' } }
      ])
    )
    const fixture = await render()
    const selected = jest.fn()
    fixture.componentInstance.selected.subscribe(selected)
    fixture.nativeElement.querySelector('[data-assistant-business-area="ops"]').click()
    fixture.detectChanges()
    expect(fixture.componentInstance.filtered().map((assistant) => assistant.id)).toEqual(['a', 'b'])
    expect(router.navigate).not.toHaveBeenCalled()
    expect(selected).not.toHaveBeenCalled()
    expect(
      fixture.nativeElement.querySelector('[data-assistant-business-area="ops"]').getAttribute('aria-pressed')
    ).toBe('true')

    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-assistant-search]')
    input.value = 'Quality'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    expect(fixture.componentInstance.filtered().map((assistant) => assistant.id)).toEqual(['b'])
    fixture.nativeElement.querySelector('[data-clear-business-area]').click()
    fixture.detectChanges()
    expect(input.value).toBe('Quality')
    expect(fixture.componentInstance.filtered().map((assistant) => assistant.id)).toEqual(['b', 'c'])
    expect(fixture.nativeElement.querySelector('[data-clear-business-area]')).toBeNull()
  })

  it('keeps filter keyboard activation out of the menu selection handler while allowing Escape', async () => {
    const fixture = await render()
    const enter = new KeyboardEvent('keydown', { key: 'Enter' })
    const enterStop = jest.spyOn(enter, 'stopPropagation')
    fixture.componentInstance.handleFilterKey(enter)
    expect(enterStop).toHaveBeenCalled()
    const escape = new KeyboardEvent('keydown', { key: 'Escape' })
    const escapeStop = jest.spyOn(escape, 'stopPropagation')
    fixture.componentInstance.handleFilterKey(escape)
    expect(escapeStop).not.toHaveBeenCalled()
  })

  it('shows load failures and supports retry', async () => {
    api.getAvailableXperts.mockReturnValueOnce(throwError(() => new Error('unavailable')))
    const fixture = await render()
    expect(fixture.componentInstance.failed()).toBe(true)
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    await fixture.componentInstance.load()
    fixture.detectChanges()
    expect(fixture.componentInstance.failed()).toBe(false)
    expect(fixture.componentInstance.assistants()).toHaveLength(2)
  })
})
