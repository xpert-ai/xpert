import { TestBed } from '@angular/core/testing'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  ProviderCredentialValidationCapabilities,
  ProviderCredentialValidationResult
} from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { CopilotProviderService, ToastrService } from '../../../@core'
import { CopilotAiProviderAuthComponent } from './authorization.component'

describe('credential verification before save', () => {
  async function setup(
    capabilities: ProviderCredentialValidationCapabilities = { method: 'discovery' },
    providerId?: string
  ) {
    const service = {
      credentialValidationCapabilities: jest.fn().mockReturnValue(of(capabilities)),
      checkCredentials: jest.fn().mockReturnValue(of({ method: 'discovery', models: [] })),
      saveCredentials: jest.fn().mockReturnValue(of({ id: 'saved-provider' })),
      getOneById: jest.fn().mockReturnValue(of({ id: providerId, credentials: { api_key: 'old' } }))
    }
    const close = jest.fn()
    await TestBed.configureTestingModule({
      imports: [CopilotAiProviderAuthComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: CopilotProviderService, useValue: service },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: DialogRef, useValue: { close } },
        {
          provide: DIALOG_DATA,
          useValue: {
            providerId,
            copilot: { id: 'copilot' },
            provider: {
              provider: 'test-provider',
              label: { en_US: 'Test' },
              provider_credential_schema: { credential_form_schemas: [] }
            }
          }
        }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotAiProviderAuthComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    const component = fixture.componentInstance
    component.credentials.set({ api_key: 'new', base_url: 'https://provider.example/v1' })
    fixture.detectChanges()
    return { fixture, component, service, close }
  }
  afterEach(() => TestBed.resetTestingModule())

  it('allows an empty authenticated list without persisting during preview', async () => {
    const { component, service, fixture } = await setup()
    await component.apply()
    expect(service.saveCredentials).not.toHaveBeenCalled()
    await component.testCredentials()
    fixture.detectChanges()
    expect(service.checkCredentials).toHaveBeenCalledWith('test-provider', {
      credentials: { api_key: 'new', base_url: 'https://provider.example/v1' },
      validationTarget: undefined
    })
    expect(component.validationResult()).toEqual({ method: 'discovery', models: [] })
    expect(fixture.nativeElement.textContent).toContain('CredentialValidation.Empty')
    expect(service.saveCredentials).not.toHaveBeenCalled()
    await component.apply()
    expect(service.saveCredentials).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ providerName: 'test-provider' })
    )
  })

  it('does not accept stale results when credentials change during a request', async () => {
    const { component, service } = await setup()
    const pending = new Subject<ProviderCredentialValidationResult>()
    service.checkCredentials.mockReturnValue(pending)
    const check = component.testCredentials()
    component.credentials.set({ api_key: 'changed' })
    pending.next({ method: 'discovery', models: [] })
    pending.complete()
    await check
    expect(component.validationResult()).toBeNull()
    await component.apply()
    expect(service.saveCredentials).not.toHaveBeenCalled()
  })

  it('tests the exact custom Endpoint ID and invalidates success when target or endpoint changes', async () => {
    const { component, service, fixture } = await setup(
      {
        method: 'model',
        modelTypes: [AiModelTypeEnum.LLM],
        models: [{ modelType: AiModelTypeEnum.LLM, model: 'reference' }]
      },
      'existing-provider'
    )
    expect(component.canTest()).toBe(false)
    expect(fixture.nativeElement.querySelectorAll('datalist option')).toHaveLength(1)
    component.testModel.set(' ep-user ')
    const target = { modelType: AiModelTypeEnum.LLM, model: 'ep-user' }
    service.checkCredentials.mockReturnValue(of({ method: 'model', target }))
    await component.testCredentials()
    expect(component.validationResult()).toEqual({ method: 'model', target })
    await component.apply()
    expect(service.saveCredentials).toHaveBeenCalledWith(
      'existing-provider',
      expect.objectContaining({ validationTarget: target })
    )
    component.testModel.set('other')
    expect(component.validationResult()).toBeNull()
  })

  it('keeps failed checks and failed saves unverified', async () => {
    const { component, service, close } = await setup()
    service.checkCredentials.mockReturnValue(throwError(() => new Error('401')))
    await component.testCredentials()
    expect(component.validationResult()).toBeNull()
    service.checkCredentials.mockReturnValue(of({ method: 'discovery', models: [] }))
    await component.testCredentials()
    service.saveCredentials.mockReturnValue(throwError(() => new Error('revoked since preview')))
    await component.apply()
    expect(component.validationResult()).toBeNull()
    expect(close).not.toHaveBeenCalled()
  })
})
