import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { EMPTY, Observable, Subject, throwError } from 'rxjs'
import { IKnowledgebase, KnowledgebaseService, KnowledgeDocumentService, ToastrService } from '../../../../@core'
import { KnowledgeDocumentDialogService } from '../../knowledge/knowledgebase/documents/import/document-dialog.service'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspaceKnowledgesPageComponent } from './knowledges-page.component'

jest.mock('../home/home.component', () => ({ XpertWorkspaceHomeComponent: class {} }))
jest.mock('../../knowledge', () => ({ XpertNewKnowledgeComponent: class {} }))
jest.mock('../../knowledge/knowledgebase/documents/import/document-dialog.service', () => ({
  KnowledgeDocumentDialogService: class {}
}))

describe('workspace knowledgebase page settings', () => {
  const listItem = { id: 'kb-1', workspaceId: 'workspace-1', name: 'Knowledge' } as IKnowledgebase
  afterEach(() => TestBed.resetTestingModule())

  function setup(getDetail: (id: string) => Observable<IKnowledgebase>) {
    const dialog = { open: jest.fn(() => ({ closed: EMPTY })) }
    const toastr = { error: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseService, useValue: { getDetail } },
        { provide: KnowledgeDocumentService, useValue: {} },
        { provide: KnowledgeDocumentDialogService, useValue: {} },
        { provide: Dialog, useValue: dialog },
        { provide: Router, useValue: {} },
        { provide: ToastrService, useValue: toastr },
        {
          provide: XpertWorkspaceHomeComponent,
          useValue: {
            workspace: signal({ id: 'workspace-1' }),
            canWriteWorkspace: signal(true)
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpertWorkspaceKnowledgesPageComponent())
    component.knowledgebases.set([listItem])
    component.activeKnowledgebaseId.set(listItem.id)
    return { component, dialog, toastr }
  }

  it('waits for full analyzer details and opens only one settings dialog', async () => {
    const details = new Subject<IKnowledgebase>()
    const getDetail = jest.fn(() => details)
    const { component, dialog } = setup(getDetail)
    const opening = component.openKnowledgebaseSettings()
    expect(dialog.open).not.toHaveBeenCalled()
    await component.openKnowledgebaseSettings()
    expect(getDetail).toHaveBeenCalledTimes(1)
    const detail: IKnowledgebase = {
      ...listItem,
      documentNum: 2,
      keywordAnalyzerLocked: true,
      keywordAnalyzer: {
        provider: 'jieba',
        revision: 'v1',
        source: { kind: 'plugin', scopeKey: 'org', pluginName: '@xpert-ai/plugin-jieba' }
      }
    }
    details.next(detail)
    await opening
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: { workspaceId: 'workspace-1', knowledgebase: detail }
      })
    )
  })

  it('does not open a partial settings form when detail loading fails', async () => {
    const { component, dialog, toastr } = setup(() => throwError(() => new Error('Forbidden')))
    await component.openKnowledgebaseSettings()
    expect(dialog.open).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalled()
  })

  it('discards details when the selected knowledgebase changes during loading', async () => {
    const details = new Subject<IKnowledgebase>()
    const { component, dialog } = setup(() => details)
    const opening = component.openKnowledgebaseSettings()
    component.activeKnowledgebaseId.set(null)
    details.next(listItem)
    await opening
    expect(dialog.open).not.toHaveBeenCalled()
  })
})
