import { TestBed } from '@angular/core/testing'
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, defaultModelConfiguration } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { ModelDiscoveryComponent } from './discovery.component'

describe('model discovery dialog', () => {
  const configuration = defaultModelConfiguration(AiModelTypeEnum.LLM)
  async function setup() {
    const service = {
      discoverModels: jest.fn().mockReturnValue(
        of({
          models: [
            {
              model: 'saved',
              label: 'saved',
              modelType: 'llm',
              typeSource: 'name',
              configuration,
              configured: true,
              configuredModelId: 'saved-id',
              source: 'discovered',
              available: true
            },
            { model: 'new', label: 'new', modelType: 'llm', typeSource: 'name', configuration, configured: false },
            { model: 'opaque', label: 'opaque', modelType: null, typeSource: 'unknown', configured: false }
          ]
        })
      ),
      getModel: jest.fn().mockReturnValue(
        of({
          id: 'saved-id',
          modelName: 'saved',
          modelType: 'llm',
          modelProperties: { model_configuration: { ...configuration, maxConcurrency: 5 } }
        })
      ),
      importModels: jest.fn().mockReturnValue(of({ added: 2, skipped: 0 }))
    }
    const close = jest.fn()
    const dialog = { open: jest.fn().mockReturnValue({ closed: of(true) }) }
    await TestBed.configureTestingModule({
      imports: [ModelDiscoveryComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { provider: { id: 'provider' } } },
        { provide: Dialog, useValue: dialog },
        { provide: DialogRef, useValue: { close } },
        { provide: CopilotProviderService, useValue: service }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(ModelDiscoveryComponent)
    await fixture.whenStable()
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance, service, close, dialog }
  }
  afterEach(() => TestBed.resetTestingModule())

  it('defaults all new rows, allows individual reclassification, and never overwrites existing rows', async () => {
    const { component, service, close, fixture } = await setup()
    expect(component.newModels().map((row) => row.model)).toEqual(['new', 'opaque'])
    expect(component.invalid()).toBe(false)
    expect(component.rows()[2].configuration).toEqual(configuration)
    component.changeType('opaque', AiModelTypeEnum.TEXT_EMBEDDING)
    component.update('new', { configuration: { ...configuration, contextSize: 65536 }, expanded: true })
    fixture.detectChanges()
    component.update('saved', { configuration: { ...configuration, maxConcurrency: 10 } })
    expect(component.rows()[0].configuration.maxConcurrency).toBe(1)
    expect(component.invalid()).toBe(false)
    await component.save()
    expect(service.importModels).toHaveBeenCalledWith('provider', {
      models: [
        { model: 'new', configuration: { ...configuration, contextSize: 65536 } },
        { model: 'opaque', configuration: defaultModelConfiguration(AiModelTypeEnum.TEXT_EMBEDDING) }
      ]
    })
    expect(close).toHaveBeenCalledWith({ added: 2, skipped: 0 })
    expect(fixture.nativeElement.textContent).not.toContain('Discovery.BatchType')
    expect(fixture.nativeElement.querySelectorAll('button .ri-settings-5-line')).toHaveLength(3)
  })

  it('edits an existing row repeatedly while preserving unsaved choices for new models', async () => {
    const { component, service, dialog } = await setup()
    component.update('new', { configuration: { ...configuration, maxConcurrency: 4 } })
    await component.editModel(component.rows()[0])
    expect(component.rows()[0].configuration.maxConcurrency).toBe(5)
    service.getModel.mockReturnValue(
      of({
        id: 'saved-id',
        modelName: 'saved',
        modelType: 'llm',
        modelProperties: { model_configuration: { ...configuration, maxConcurrency: 6 } }
      })
    )
    await component.editModel(component.rows()[0])
    expect(component.rows()[0].configuration.maxConcurrency).toBe(6)
    expect(component.newModels()[0].configuration.maxConcurrency).toBe(4)
    expect(dialog.open).toHaveBeenCalledTimes(2)
  })

  it('confirms sync with no additions after a successful preview', async () => {
    const { component, service } = await setup()
    component.rows.update((rows) => rows.filter((row) => row.configured))
    expect(component.invalid()).toBe(false)
    await component.save()
    expect(service.importModels).toHaveBeenCalledWith('provider', { models: [] })
  })

  it('retains edited choices after a failed import so it can be retried', async () => {
    const { component, service, close, dialog } = await setup()
    component.update('new', { configuration: { ...configuration, maxConcurrency: 4 } })
    service.importModels.mockReturnValue(throwError(() => new Error('upstream failed')))
    await component.save()
    expect(component.error()).toContain('upstream failed')
    expect(component.newModels()[0].configuration.maxConcurrency).toBe(4)
    expect(component.saving()).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })
})
