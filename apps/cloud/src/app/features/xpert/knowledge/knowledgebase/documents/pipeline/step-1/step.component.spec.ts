jest.mock('../../../knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))
jest.mock('../../documents.component', () => ({ KnowledgeDocumentsComponent: class {} }))
jest.mock('../pipeline.component', () => ({ KnowledgeDocumentPipelineComponent: class {} }))
jest.mock('apps/cloud/src/app/@shared/knowledge', () => ({
  KnowledgeChunkComponent: class {},
  KnowledgeDocumentPreviewComponent: class {},
  KnowledgeFilePreviewComponent: class {},
  KnowledgeLocalFileComponent: class {}
}))
jest.mock('@cloud/app/@shared/xpert', () => ({ XpertParametersFormComponent: class {} }))

import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { SelectionModel } from '@angular/cdk/collections'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import {
  DocumentSourceProviderCategoryEnum,
  IKnowledgebaseTask,
  IKnowledgeDocument,
  KnowledgebaseService,
  KnowledgeFileUploader,
  ToastrService,
  XpertAgentService
} from '@cloud/app/@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentPipelineComponent } from '../pipeline.component'
import { KnowledgeDocumentPipelineStep1Component } from './step.component'

describe('pipeline local file task creation', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('does not create another task in response to its returned ID and waits for changed files', () => {
    const responses = new Subject<IKnowledgebaseTask>()
    const api = { createTask: jest.fn(() => responses) }
    const pipeline = {
      taskId: signal<string>(null),
      parentId: signal(null),
      knowledgebaseId: signal('kb'),
      selectedSource: signal({ key: 'local' }),
      providerCategory: signal(DocumentSourceProviderCategoryEnum.LocalFile),
      files: signal<KnowledgeFileUploader[]>([]),
      documentIds: new SelectionModel<string>(true),
      nextStep: jest.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseService, useValue: api },
        { provide: XpertAgentService, useValue: {} },
        { provide: ToastrService, useValue: {} },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: KnowledgebaseComponent, useValue: { knowledgebase: signal({ id: 'kb' }) } },
        { provide: KnowledgeDocumentsComponent, useValue: {} },
        { provide: KnowledgeDocumentPipelineComponent, useValue: pipeline },
        { provide: TranslateService, useValue: { currentLang: 'en', onLangChange: new Subject() } }
      ]
    })
    TestBed.overrideComponent(KnowledgeDocumentPipelineStep1Component, { set: { imports: [], template: '' } })
    const fixture = TestBed.createComponent(KnowledgeDocumentPipelineStep1Component)
    const component = fixture.componentInstance
    const file = new KnowledgeFileUploader('kb', TestBed.inject(KnowledgebaseService), new File(['text'], 'test.md'), {
      parentId: null,
      path: null
    })
    const document = signal<Partial<IKnowledgeDocument>>({ id: 'doc-1', name: 'test.md' })
    Object.defineProperty(file, 'document', { value: document })
    pipeline.files.set([file])
    fixture.detectChanges()
    expect(api.createTask).toHaveBeenCalledTimes(1)
    expect(component.canContinue()).toBe(false)

    responses.next({ id: 'task-1', context: { documents: [{ id: 'doc-1' }] } } as IKnowledgebaseTask)
    fixture.detectChanges()
    fixture.detectChanges()
    expect(pipeline.taskId()).toBe('task-1')
    expect(api.createTask).toHaveBeenCalledTimes(1)
    expect(component.canContinue()).toBe(true)

    document.set({ id: 'doc-2', name: 'changed.md' })
    fixture.detectChanges()
    expect(api.createTask).toHaveBeenCalledTimes(2)
    expect(component.canContinue()).toBe(false)
    component.nextStep()
    expect(pipeline.nextStep).not.toHaveBeenCalled()

    responses.next({ id: 'task-2', context: { documents: [{ id: 'doc-2' }] } } as IKnowledgebaseTask)
    fixture.detectChanges()
    expect(api.createTask).toHaveBeenCalledTimes(2)
    expect(component.canContinue()).toBe(true)
    pipeline.files.set([])
    fixture.detectChanges()
    expect(component.canContinue()).toBe(false)
  })
})
