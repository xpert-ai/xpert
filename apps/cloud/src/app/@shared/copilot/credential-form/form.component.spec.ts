import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormsModule } from '@angular/forms'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { CredentialFormSchema, CredentialFormTypeEnum } from '../../../@core'
import { CopilotCredentialFormComponent } from './form.component'

@Component({
  standalone: true,
  imports: [FormsModule, CopilotCredentialFormComponent],
  template: `<copilot-credential-form [credentialFormSchemas]="schemas" [(ngModel)]="credentials" />`
})
class HostComponent {
  credentials: Record<string, string | number | boolean> = { endpoint: 'initial', region: 'global' }
  schemas: CredentialFormSchema[] = [
    {
      variable: 'endpoint',
      type: CredentialFormTypeEnum.TEXT_INPUT,
      label: { en_US: 'Endpoint' },
      placeholder: { en_US: 'Endpoint' },
      required: true
    },
    {
      variable: 'region',
      type: CredentialFormTypeEnum.SELECT,
      label: { en_US: 'Region' },
      placeholder: { en_US: 'Select region' },
      required: true,
      options: [
        { value: 'global', label: { en_US: 'Global' } },
        { value: 0, label: { en_US: 'Local' } },
        { value: false, label: { en_US: 'Disabled' } }
      ]
    },
    {
      variable: 'deployment',
      type: CredentialFormTypeEnum.TEXT_INPUT,
      label: { en_US: 'Deployment' },
      placeholder: { en_US: 'Deployment' },
      required: false,
      show_on: [{ variable: 'region', value: 'global' }]
    }
  ]
}

describe('CopilotCredentialFormComponent shared fields', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('writes text and select values back to the parent and updates conditional fields', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent, NoopAnimationsModule, TranslateModule.forRoot()]
    }).compileComponents()
    const fixture = TestBed.createComponent(HostComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    const input = root.querySelector<HTMLInputElement>('input[placeholder="Endpoint"]')!
    expect(input.value).toBe('initial')
    input.value = 'updated'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.credentials.endpoint).toBe('updated')
    expect(root.querySelector('input[placeholder="Deployment"]')).not.toBeNull()
    root.querySelector<HTMLElement>('[role="combobox"]')!.click()
    fixture.detectChanges()
    await fixture.whenStable()
    const localOption = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((el) =>
      el.textContent?.includes('Local')
    )!
    expect(localOption).toBeDefined()
    localOption.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.credentials.region).toBe(0)
    expect(root.querySelector('input[placeholder="Deployment"]')).toBeNull()
    root.querySelector<HTMLElement>('[role="combobox"]')!.click()
    fixture.detectChanges()
    await fixture.whenStable()
    const disabledOption = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((el) =>
      el.textContent?.includes('Disabled')
    )!
    disabledOption.click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.credentials.region).toBe(false)
  })
})
