import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { ConfigurateMethod } from '@xpert-ai/contracts'
import { NEVER, of } from 'rxjs'
import { ToastrService } from '../../../@core'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { ModelDiscoveryComponent } from '../model-discovery/discovery.component'
import { CopilotProviderComponent } from './provider.component'

describe('provider model actions', () => {
  afterEach(() => TestBed.resetTestingModule())

  async function setup(discoverySupported = true, readonly = false) {
    const provider = {
      id: 'provider-id',
      providerName: 'xirang',
      provider: {
        label: { en_US: 'Xirang' },
        supported_model_types: [],
        configurate_methods: [ConfigurateMethod.CUSTOMIZABLE_MODEL],
        model_credential_schema: { model: { label: {}, placeholder: {} }, credential_form_schemas: [] }
      }
    }
    const service = {
      getOneById: jest.fn().mockReturnValue(of(provider)),
      getModels: jest.fn().mockReturnValue(of({ discoverySupported, builtin: [], custom: [] }))
    }
    const dialog = { open: jest.fn().mockReturnValue({ closed: NEVER }) }
    await TestBed.configureTestingModule({
      imports: [CopilotProviderComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: CopilotProviderService, useValue: service },
        { provide: Dialog, useValue: dialog },
        { provide: ToastrService, useValue: {} }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotProviderComponent)
    fixture.componentRef.setInput('providerId', provider.id)
    fixture.componentRef.setInput('readonly', readonly)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return { fixture, provider, service, dialog }
  }

  it('offers discovery before expanding and keeps the same actions after toggling the list', async () => {
    const { fixture, provider, service, dialog } = await setup()
    const root: HTMLElement = fixture.nativeElement
    const discoveryButton = () => root.querySelector('.ri-download-cloud-line')?.closest('button')
    expect(fixture.componentInstance.isShowModels()).toBe(false)
    expect(service.getModels).toHaveBeenCalledWith(provider.id)
    expect(discoveryButton()).toBeDefined()
    const buttonClasses = discoveryButton().className
    discoveryButton().click()
    expect(dialog.open).toHaveBeenCalledWith(ModelDiscoveryComponent, expect.objectContaining({ data: { provider } }))

    for (const expanded of [true, false]) {
      fixture.componentInstance.toggleShowModels()
      fixture.detectChanges()
      expect(fixture.componentInstance.isShowModels()).toBe(expanded)
      expect(root.querySelectorAll('.ri-download-cloud-line')).toHaveLength(1)
      expect(discoveryButton().className).toBe(buttonClasses)
      expect(root.querySelector('.ri-add-circle-line')?.closest('button')).toBeDefined()
    }
    expect(service.getModels).toHaveBeenCalledTimes(1)
    fixture.destroy()
  })

  it.each([
    [false, false],
    [true, true]
  ])('hides discovery when supported=%s and readonly=%s', async (supported, readonly) => {
    const { fixture } = await setup(supported, readonly)
    const root: HTMLElement = fixture.nativeElement
    for (const expanded of [false, true]) {
      fixture.componentInstance.isShowModels.set(expanded)
      fixture.detectChanges()
      expect(root.querySelector('.ri-download-cloud-line')).toBeNull()
    }
    fixture.destroy()
  })
})
