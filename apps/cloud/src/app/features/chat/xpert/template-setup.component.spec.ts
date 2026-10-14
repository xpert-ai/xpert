import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ReactiveFormsModule } from '@angular/forms'
import { provideRouter, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import type { AssistantTemplateSetup } from '@xpert-ai/contracts'
import { AssistantTemplateSetupService } from '../../../@core/services/assistant-template-setup.service'
import { TemplateSetupComponent } from './template-setup.component'

jest.mock('../../../@core', () => ({ getErrorMessage: (error: Error) => error.message }))

describe('TemplateSetupComponent', () => {
  const account = '11a02e27-cd84-4f48-8fb0-d180a9de793a'
  const setup: AssistantTemplateSetup = {
    assistantId: 'assistant',
    state: {
      revision: 3,
      preferences: { language: '中文' },
      connectors: { calendar: { choice: 'binding', bindingId: account } }
    },
    onboarding: {
      skill: 'setup',
      required: true,
      preferences: ['language', 'timezone'],
      completionCriteria: 'Welcome plan'
    },
    connectors: [
      {
        key: 'calendar',
        provider: 'calendar',
        required: true,
        purpose: 'Calendar',
        permissions: [],
        status: 'ready',
        options: [{ bindingId: account, label: 'Test account', status: 'active' }]
      }
    ],
    managementUrl: '/xpert/w/workspace/connectors',
    routines: []
  }
  const api = { get: jest.fn(), update: jest.fn(), routine: jest.fn() }
  beforeEach(async () => {
    jest.clearAllMocks()
    api.get.mockReturnValue(of(structuredClone(setup)))
    api.update.mockReturnValue(of(structuredClone(setup)))
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DIALOG_DATA, useValue: 'assistant' },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: AssistantTemplateSetupService, useValue: api }
      ]
    })
      .overrideComponent(TemplateSetupComponent, {
        set: { imports: [ReactiveFormsModule, RouterModule, TranslateModule], schemas: [NO_ERRORS_SCHEMA] }
      })
      .compileComponents()
  })
  async function render() {
    const fixture = TestBed.createComponent(TemplateSetupComponent)
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }
  it('reopens partial preferences and shows the saved selected account', async () => {
    const fixture = await render()
    expect(fixture.componentInstance.form.getRawValue()).toEqual({ language: '中文', timezone: '' })
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select')
    expect(select.value).toBe(account)
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/xpert/w/workspace/connectors')
    expect(fixture.nativeElement.textContent).not.toContain('TemplateSetup.Skip')
  })
  it('saves preferences with the observed revision and keeps user input on conflict', async () => {
    const fixture = await render()
    fixture.componentInstance.form.controls.timezone.setValue('Asia/Shanghai')
    api.update.mockReturnValue(throwError(() => new Error('Changed in another client')))
    await fixture.componentInstance.save()
    fixture.detectChanges()
    expect(api.update).toHaveBeenCalledWith('assistant', {
      revision: 3,
      preferences: { language: '中文', timezone: 'Asia/Shanghai' }
    })
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Changed in another client')
    expect(fixture.componentInstance.form.controls.timezone.value).toBe('Asia/Shanghai')
    expect(fixture.componentInstance.busy()).toBe(false)
  })
})
