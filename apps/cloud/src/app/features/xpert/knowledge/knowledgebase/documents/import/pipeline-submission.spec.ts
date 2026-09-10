jest.mock('../../knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))
jest.mock('../documents.component', () => ({ KnowledgeDocumentsComponent: class {} }))
jest.mock('../pipeline/pipeline.component', () => ({ KnowledgeDocumentPipelineComponent: class {} }))
jest.mock('../pipeline/settings/settings.component', () => ({ KnowledgeDocumentPipelineSettingsComponent: class {} }))

import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { KnowledgebaseService, ToastrService, XpertAgentService } from '@cloud/app/@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { KnowledgeDocumentPipelineComponent } from '../pipeline/pipeline.component'
import { KnowledgeDocumentPipelineStep2Component } from '../pipeline/step-2/step.component'

describe('Pipeline import submission', () => {
  function setup() {
    const response = new Subject<object>()
    const api = { processTask: jest.fn(() => response) }
    const toastr = { error: jest.fn() }
    const pipeline = {
      pipeline: signal({}),
      selectedSource: signal({ key: 'source' }),
      taskId: signal('task'),
      documentIds: { selected: ['document'] },
      documents: signal([]),
      files: signal([]),
      submitting: signal(false),
      dialogRef: { disableClose: false },
      processed: jest.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseService, useValue: api },
        { provide: ToastrService, useValue: toastr },
        { provide: XpertAgentService, useValue: {} },
        { provide: KnowledgebaseComponent, useValue: { knowledgebase: signal({ id: 'kb' }) } },
        { provide: KnowledgeDocumentsComponent, useValue: {} },
        { provide: KnowledgeDocumentPipelineComponent, useValue: pipeline }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new KnowledgeDocumentPipelineStep2Component())
    return { component, pipeline, api, response, toastr }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('submits once, protects the pending dialog, and completes through its dialog-aware owner', () => {
    const { component, pipeline, api, response } = setup()
    component.saveAndProcess()
    component.saveAndProcess()
    expect(api.processTask).toHaveBeenCalledTimes(1)
    expect(api.processTask).toHaveBeenCalledWith('kb', 'task', {
      sources: { source: { documents: ['document'] } },
      stage: 'prod'
    })
    expect(pipeline.submitting()).toBe(true)
    expect(pipeline.dialogRef.disableClose).toBe(true)
    response.next({})
    response.complete()
    expect(pipeline.processed).toHaveBeenCalledTimes(1)
    expect(component.loading()).toBe(false)
    expect(pipeline.dialogRef.disableClose).toBe(false)
  })

  it('retains the batch and unlocks the dialog on failure', () => {
    const { component, pipeline, response, toastr } = setup()
    component.saveAndProcess()
    response.error(new Error('Processing failed'))
    expect(pipeline.processed).not.toHaveBeenCalled()
    expect(pipeline.documentIds.selected).toEqual(['document'])
    expect(pipeline.submitting()).toBe(false)
    expect(pipeline.dialogRef.disableClose).toBe(false)
    expect(component.loading()).toBe(false)
    expect(toastr.error).toHaveBeenCalledWith('Processing failed')
  })
})
