jest.mock('../documents.component', () => ({ KnowledgeDocumentsComponent: class {} }))
jest.mock('../import/document-dialog.service', () => ({ KnowledgeDocumentDialogService: class {} }))

import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { KnowledgeDocumentDialogService } from '../import/document-dialog.service'
import { KnowledgeDocumentSettingsRouteComponent } from './settings-route.component'

describe('bookmarked document settings route', () => {
  afterEach(() => TestBed.resetTestingModule())

  it.each([true, false])('opens the dialog and returns to the same folder after result %s', async (result) => {
    const dialogs = { edit: jest.fn(async () => result) }
    const documents = { refresh: jest.fn(), vectorMutationLocked: () => false }
    const router = { navigate: jest.fn(async () => true) }
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'doc' }) } } },
        { provide: Router, useValue: router },
        { provide: KnowledgeDocumentDialogService, useValue: dialogs },
        { provide: KnowledgeDocumentsComponent, useValue: documents }
      ]
    })
    const fixture = TestBed.createComponent(KnowledgeDocumentSettingsRouteComponent)
    await fixture.componentInstance.ngOnInit()
    expect(dialogs.edit).toHaveBeenCalledWith('doc', expect.any(Function))
    expect(documents.refresh).toHaveBeenCalledTimes(result ? 1 : 0)
    expect(router.navigate).toHaveBeenCalledWith(
      ['../../'],
      expect.objectContaining({ queryParamsHandling: 'preserve', replaceUrl: true })
    )
  })
})
