import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { SettingsFeatureComponent } from './settings-feature.component'

@Component({
  imports: [SettingsFeatureComponent, ReactiveFormsModule],
  template: `
    <xp-settings-feature titleKey="Memory" [control]="enabled" [expanded]="false">
      <input aria-label="Draft input" [formControl]="draft" />
    </xp-settings-feature>
  `
})
class HostComponent {
  readonly enabled = new FormControl(false, { nonNullable: true })
  readonly draft = new FormControl('Initial', { nonNullable: true })
}

describe('settings feature accordion', () => {
  afterEach(() => TestBed.resetTestingModule())

  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(HostComponent)
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    const header = element.querySelector<HTMLElement>('z-accordion-header')!
    const toggle = element.querySelector<HTMLButtonElement>('[role="switch"]')!
    return { fixture, element, header, toggle }
  }

  it('expands with the keyboard without enabling the feature and keeps edited content on collapse', () => {
    const { fixture, element, header } = setup()
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    fixture.detectChanges()
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(fixture.componentInstance.enabled.value).toBe(false)
    const input = element.querySelector<HTMLInputElement>('input')!
    input.value = 'Retained draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    header.click()
    fixture.detectChanges()
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(input.closest('[inert]')).not.toBeNull()
    header.click()
    fixture.detectChanges()
    expect(element.querySelector<HTMLInputElement>('input')!.value).toBe('Retained draft')
  })

  it('changes only the enabled control when the adjacent switch is clicked', () => {
    const { fixture, header, toggle } = setup()
    toggle.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.enabled.value).toBe(true)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(fixture.componentInstance.draft.value).toBe('Initial')
  })
})
