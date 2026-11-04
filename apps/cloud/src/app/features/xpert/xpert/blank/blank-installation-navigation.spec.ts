jest.mock('./blank-wizard-resources', () => {
  const { inject, signal } = jest.requireActual('@angular/core')
  const { DialogRef } = jest.requireActual('@angular/cdk/dialog')
  return {
    BlankWizardResources: class {
      _dialogRef = inject(DialogRef)
      startMode = signal('template')
      selectedTemplateId = signal('template')
      workspaceId = signal('workspace')
      loading = signal(false)
      availableModes = signal([])
      isAgentType = () => true
      lockStartMode = false
    }
  }
})
jest.mock('apps/cloud/src/app/@shared/xpert', () => ({ XpertBasicFormComponent: class {} }))
jest.mock('apps/cloud/src/app/@shared/copilot', () => ({ CopilotConfigFormComponent: class {} }))

import { DialogRef } from '@angular/cdk/dialog'
import { Component, input, NO_ERRORS_SCHEMA, output } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { BlankAssistantCapabilities } from './blank-assistant-capabilities'
import type { BlankXpertWizardResult } from './blank-wizard-data'

const { XpertNewBlankComponent } = require('./blank.component') as typeof import('./blank.component')

@Component({
  selector: 'xp-template-installation',
  standalone: true,
  template: '<button (click)="back.emit()">Back</button>'
})
class InstallationStubComponent {
  readonly templateId = input<string>()
  readonly initialWorkspaceId = input<string>()
  readonly back = output<void>()
  readonly completed = output<BlankXpertWizardResult>()
}

describe('Create expert installation navigation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [XpertNewBlankComponent, TranslateModule.forRoot()],
      providers: [{ provide: DialogRef, useValue: { close: jest.fn() } }]
    })
      .overrideComponent(XpertNewBlankComponent, {
        set: {
          imports: [InstallationStubComponent, TranslateModule],
          providers: [{ provide: BlankAssistantCapabilities, useValue: {} }],
          schemas: [NO_ERRORS_SCHEMA]
        }
      })
      .compileComponents()
  })

  it.each([false, true])('closes the creation dialog on Back (locked start mode: %s)', (lockStartMode) => {
    const fixture = TestBed.createComponent(XpertNewBlankComponent)
    Object.defineProperty(fixture.componentInstance, 'lockStartMode', { value: lockStartMode })
    fixture.detectChanges()
    const installation = fixture.debugElement.query(By.directive(InstallationStubComponent))

    installation.query(By.css('button')).nativeElement.click()

    expect(TestBed.inject(DialogRef).close).toHaveBeenCalledTimes(1)
    expect(TestBed.inject(DialogRef).close).toHaveBeenCalledWith(undefined)
    expect(fixture.componentInstance.selectedTemplateId()).toBe('template')
    fixture.destroy()
  })

  it('preserves the completed assistant result when closing the creation dialog', () => {
    const fixture = TestBed.createComponent(XpertNewBlankComponent)
    fixture.detectChanges()
    const installation = fixture.debugElement.query(By.directive(InstallationStubComponent))
      .componentInstance as InstallationStubComponent
    const result: BlankXpertWizardResult = { xpert: { id: 'assistant' }, status: 'published' }

    installation.completed.emit(result)

    expect(TestBed.inject(DialogRef).close).toHaveBeenCalledWith(result)
    fixture.destroy()
  })
})
