jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))
jest.mock('@cloud/app/@shared/knowledge', () => ({
  hasEnabledKnowledgeRetrievalSource: () => true,
  KnowledgeRetrievalSettingsComponent: class {}
}))

import { CommonModule } from '@angular/common'
import { Component, forwardRef, Input, NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { By } from '@angular/platform-browser'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TranslateModule } from '@ngx-translate/core'
import { of, Observable } from 'rxjs'
import {
  AiModelTypeEnum,
  ICopilotModel,
  IKnowledgebase,
  KnowledgebaseStatusEnum,
  KnowledgebaseTypeEnum
} from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { KnowledgebaseService, ToastrService, XpertAPIService } from '../../../../@core'
import { XpertNewKnowledgeComponent } from './new.component'

@Component({
  selector: 'copilot-model-select',
  standalone: true,
  template: '<span>{{ value?.model }} / {{ value?.copilotId }}</span>',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ModelSelect), multi: true }]
})
class ModelSelect implements ControlValueAccessor {
  @Input() modelType: AiModelTypeEnum
  value: ICopilotModel
  change: (value: ICopilotModel) => void = () => {}
  writeValue(value: ICopilotModel) {
    this.value = value
  }
  registerOnChange(fn: (value: ICopilotModel) => void) {
    this.change = fn
  }
  registerOnTouched() {}
  setDisabledState() {}
  select(value: ICopilotModel) {
    this.value = value
    this.change(value)
  }
}

describe('Current knowledge settings dialog embedding lifecycle', () => {
  const target: ICopilotModel = {
    id: 'target',
    copilotId: 'new-connection',
    model: 'same-model',
    modelType: AiModelTypeEnum.TEXT_EMBEDDING
  }
  let saved: IKnowledgebase
  const api = {
    updateWikiConfiguration: jest.fn(),
    retryEmbeddingRebuild: jest.fn(),
    recoverEmbeddingRebuild: jest.fn(),
    getDetail: jest.fn()
  }
  const toast = { success: jest.fn(), error: jest.fn() }
  const close = jest.fn()

  async function open() {
    TestBed.configureTestingModule({
      imports: [XpertNewKnowledgeComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { knowledgebase: structuredClone(saved), initialSection: 'models' } },
        { provide: DialogRef, useValue: { close } },
        { provide: KnowledgebaseService, useValue: api },
        { provide: ToastrService, useValue: toast },
        { provide: XpertAPIService, useValue: {} }
      ]
    }).overrideComponent(XpertNewKnowledgeComponent, {
      set: {
        imports: [CommonModule, FormsModule, TranslateModule, ModelSelect, ZardButtonComponent, ZardInputDirective],
        schemas: [NO_ERRORS_SCHEMA]
      }
    })
    const fixture = TestBed.createComponent(XpertNewKnowledgeComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }
  beforeEach(() => {
    jest.clearAllMocks()
    saved = {
      id: 'kb',
      name: 'Documents',
      type: KnowledgebaseTypeEnum.Standard,
      status: KnowledgebaseStatusEnum.READY,
      copilotModel: { id: 'old', model: 'same-model', copilotId: null, modelType: AiModelTypeEnum.TEXT_EMBEDDING },
      parserConfig: { chunkSize: null, chunkOverlap: null, delimiter: null, embeddingBatchSize: 16 }
    }
    api.getDetail.mockImplementation(() => of(structuredClone(saved)))
    api.updateWikiConfiguration.mockImplementation((_id, input) => {
      saved = {
        ...saved,
        pendingCopilotModel: input.settings.copilotModel,
        pendingCopilotModelId: 'target',
        status: KnowledgebaseStatusEnum.REBUILDING
      }
      return of(structuredClone(saved))
    })
    api.retryEmbeddingRebuild.mockImplementation((_id, input) => {
      saved = {
        ...saved,
        parserConfig: { ...saved.parserConfig, ...input },
        status: KnowledgebaseStatusEnum.REBUILDING,
        embeddingRebuildError: null
      }
      return of(structuredClone(saved))
    })
  })
  afterEach(() => TestBed.resetTestingModule())

  it('saves a connection, reopens after failure, edits batch size and retries the saved target through rendered controls', async () => {
    let fixture = await open()
    const selector = fixture.debugElement
      .queryAll(By.directive(ModelSelect))
      .map((element) => element.componentInstance as ModelSelect)
      .find((model) => model.modelType === AiModelTypeEnum.TEXT_EMBEDDING)
    selector.select(target)
    fixture.detectChanges()
    fixture.nativeElement.querySelector('footer button:last-child').click()
    await fixture.whenStable()
    expect(api.updateWikiConfiguration).toHaveBeenCalledWith(
      'kb',
      expect.objectContaining({ settings: expect.objectContaining({ copilotModel: target }) })
    )
    expect(toast.success).toHaveBeenCalledWith('XP.Knowledgebase.WorkspaceConfiguration.Models.SavedRebuilding')
    expect(close).toHaveBeenCalled()
    fixture.destroy()
    TestBed.resetTestingModule()

    saved.status = KnowledgebaseStatusEnum.REBUILD_FAILED
    saved.embeddingRebuildError = 'provider temporarily unavailable'
    fixture = await open()
    expect(fixture.componentInstance.copilotModel()).toEqual(target)
    expect(fixture.nativeElement.textContent).toContain('new-connection')
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(saved.embeddingRebuildError)
    const input = fixture.nativeElement.querySelector('#knowledge-embedding-batch-size') as HTMLInputElement
    input.value = '8'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    const retry = jest.spyOn(fixture.componentInstance, 'retryEmbeddingRebuild')
    fixture.nativeElement.querySelector('[data-embedding-retry]').click()
    await retry.mock.results[0].value
    await fixture.whenStable()
    fixture.detectChanges()
    expect(api.retryEmbeddingRebuild).toHaveBeenCalledWith('kb', { embeddingBatchSize: 8 })
    expect(api.updateWikiConfiguration).toHaveBeenCalledTimes(1)
    expect(saved.pendingCopilotModel).toEqual(target)
    expect(fixture.nativeElement.querySelector('[data-embedding-retry]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('footer button:last-child').disabled).toBe(true)

    saved = { ...saved, status: KnowledgebaseStatusEnum.READY, copilotModel: target, pendingCopilotModel: null }
    const refresh = jest.spyOn(fixture.componentInstance, 'refreshEmbeddingState')
    fixture.nativeElement.querySelector('[data-embedding-refresh]').click()
    await refresh.mock.results[0].value
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[data-embedding-rebuild-state]')).toBeNull()
    expect(fixture.componentInstance.copilotModel()).toEqual(target)
  })

  it('does not retry an unsaved different connection with the same model name or an invalid batch', async () => {
    saved.pendingCopilotModel = target
    saved.status = KnowledgebaseStatusEnum.REBUILD_FAILED
    const fixture = await open()
    fixture.componentInstance.copilotModel.set({ ...target, copilotId: 'different-connection' })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[data-embedding-retry]').disabled).toBe(true)
    fixture.componentInstance.copilotModel.set(target)
    fixture.componentInstance.embeddingBatchSize.set(0)
    await fixture.componentInstance.retryEmbeddingRebuild()
    expect(api.retryEmbeddingRebuild).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('keeps failure details and the saved target when retry is denied', async () => {
    saved.pendingCopilotModel = target
    saved.status = KnowledgebaseStatusEnum.REBUILD_FAILED
    saved.embeddingRebuildError = 'original failure'
    api.retryEmbeddingRebuild.mockImplementation(
      () =>
        new Observable((subscriber) => {
          setTimeout(() => subscriber.error(new Error('Access revoked')), 0)
        })
    )
    const fixture = await open()
    const retry = jest.spyOn(fixture.componentInstance, 'retryEmbeddingRebuild')
    fixture.nativeElement.querySelector('[data-embedding-retry]').click()
    await retry.mock.results[0].value
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.copilotModel()).toEqual(target)
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('original failure')
    expect(toast.error).toHaveBeenCalled()
    expect(fixture.componentInstance.loading()).toBe(false)
  })
})
