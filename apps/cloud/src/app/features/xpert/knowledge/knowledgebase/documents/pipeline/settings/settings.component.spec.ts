jest.mock('@cloud/app/@shared/knowledge', () => ({ KnowledgeChunkComponent: class {} }))
jest.mock('@cloud/app/@shared/forms', () => ({ JSONSchemaFormComponent: class {} }))

import { TestBed } from '@angular/core/testing'
import { KnowledgebaseService, ToastrService, WorkflowNodeTypeEnum } from '@cloud/app/@core'
import { TranslateService } from '@ngx-translate/core'
import { of, Subject } from 'rxjs'
import { KnowledgeDocumentPipelineSettingsComponent } from './settings.component'

describe('pipeline preview task context', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('requires an import task and source before starting a preview', () => {
    const api = {
      getTextSplitterStrategies: () => of([]),
      processTask: jest.fn(() => of({})),
      pollTaskStatus: jest.fn(() => of({ status: 'success' }))
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseService, useValue: api },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        { provide: TranslateService, useValue: { currentLang: 'en', onLangChange: new Subject() } }
      ]
    })
    TestBed.overrideComponent(KnowledgeDocumentPipelineSettingsComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(KnowledgeDocumentPipelineSettingsComponent)
    const component = fixture.componentInstance
    fixture.componentRef.setInput('knowledgebase', { id: 'kb' })
    fixture.componentRef.setInput('documents', [{ id: 'doc', name: 'Document' }])
    fixture.componentRef.setInput('pipeline', {
      graph: {
        nodes: [{ key: 'chunker', type: 'workflow', entity: { type: WorkflowNodeTypeEnum.CHUNKER } }],
        connections: []
      }
    })
    expect(component.canPreview()).toBe(false)
    component.previewChunks()
    expect(api.processTask).not.toHaveBeenCalled()
    expect(component.previewing()).toBe(false)

    fixture.componentRef.setInput('taskId', 'task')
    expect(component.canPreview()).toBe(false)
    fixture.componentRef.setInput('selectedSource', { key: 'source' })
    expect(component.canPreview()).toBe(true)
    component.previewChunks()
    expect(api.processTask).toHaveBeenCalledWith('kb', 'task', {
      sources: { source: { documents: ['doc'] } },
      stage: 'preview'
    })
  })
})
