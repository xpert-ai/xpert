import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { Subject, of, throwError } from 'rxjs'
import { KnowledgeDocumentService, StorageFileService, ToastrService } from '../../../../../../../@core'

jest.mock('../../../knowledgebase.component', () => ({ KnowledgebaseComponent: class KnowledgebaseComponent {} }))
jest.mock('../../documents.component', () => ({ KnowledgeDocumentsComponent: class KnowledgeDocumentsComponent {} }))
jest.mock('../create.component', () => ({
  KnowledgeDocumentCreateComponent: class KnowledgeDocumentCreateComponent {}
}))
jest.mock('../settings/settings.component', () => ({
  KnowledgeDocumentCreateSettingsComponent: class KnowledgeDocumentCreateSettingsComponent {}
}))

import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentCreateComponent } from '../create.component'
import { KnowledgeDocumentCreateStep2Component } from './step.component'

describe('KnowledgeDocumentCreateStep2Component', () => {
  const createBulk = jest.fn()
  const toastr = { error: jest.fn() }
  const documents = signal([])
  const step = signal(1)

  beforeEach(() => {
    createBulk.mockReset()
    toastr.error.mockReset()
    documents.set([])
    step.set(1)

    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgeDocumentService, useValue: { createBulk } },
        { provide: ToastrService, useValue: toastr },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: StorageFileService, useValue: {} },
        { provide: KnowledgebaseComponent, useValue: { knowledgebase: signal({ id: 'kb-1' }) } },
        { provide: KnowledgeDocumentsComponent, useValue: {} },
        {
          provide: KnowledgeDocumentCreateComponent,
          useValue: {
            files: signal([]),
            webResult: signal(undefined),
            selectedWebPages: signal([]),
            parserConfig: signal({}),
            parentId: signal(null),
            webOptions: signal({ url: '' }),
            documents,
            step
          }
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('submits only once while the first request is pending', () => {
    const pending = new Subject<never[]>()
    createBulk.mockReturnValue(pending.asObservable())
    const component = TestBed.runInInjectionContext(() => new KnowledgeDocumentCreateStep2Component())

    component.saveAndProcess()
    component.saveAndProcess()

    expect(createBulk).toHaveBeenCalledTimes(1)
    expect(component.loading()).toBe(true)
  })

  it('unlocks submission after an error', () => {
    createBulk.mockReturnValueOnce(throwError(() => new Error('create failed'))).mockReturnValueOnce(of([]))
    const component = TestBed.runInInjectionContext(() => new KnowledgeDocumentCreateStep2Component())

    component.saveAndProcess()
    component.saveAndProcess()

    expect(createBulk).toHaveBeenCalledTimes(2)
    expect(toastr.error).toHaveBeenCalledTimes(1)
    expect(component.loading()).toBe(false)
  })
})
