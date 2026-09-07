import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { EMPTY, of, Subject, throwError } from 'rxjs'
import { IKnowledgebase, KnowledgebaseService, Store, ToastrService } from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspaceKnowledgesComponent } from './knowledges.component'

jest.mock('../home/home.component', () => ({ XpertWorkspaceHomeComponent: class {} }))
jest.mock('../../knowledge', () => ({ XpertNewKnowledgeComponent: class {} }))
jest.mock('../../../../@shared/user', () => ({ UserProfileInlineComponent: class {} }))
jest.mock('../../../../@shared/avatar', () => ({ EmojiAvatarComponent: class {} }))

describe('workspace knowledgebase settings', () => {
  afterEach(() => TestBed.resetTestingModule())
  function createHarness(getDetail: jest.Mock) {
    const dialog = { open: jest.fn(() => ({ closed: EMPTY })) }
    const toastr = { error: jest.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgebaseService, useValue: { getDetail, getAllByWorkspace: () => of({ items: [] }) } },
        { provide: Dialog, useValue: dialog },
        { provide: ToastrService, useValue: toastr },
        { provide: Store, useValue: { selectOrganizationId: () => of('org-1') } },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: TranslateService, useValue: { stream: () => of({}), onLangChange: EMPTY, currentLang: 'en' } },
        {
          provide: XpertWorkspaceHomeComponent,
          useValue: {
            workspace: signal({ id: 'workspace-1' }),
            canWriteWorkspace: signal(true),
            searchText: signal('')
          }
        }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new XpertWorkspaceKnowledgesComponent())
    return { component, dialog, toastr }
  }

  it('waits for full details and uses them as the settings source', async () => {
    const details = new Subject<IKnowledgebase>()
    const getDetail = jest.fn(() => details)
    const { component, dialog } = createHarness(getDetail)
    const listItem = { id: 'kb-1', workspaceId: 'workspace-1', name: 'Wiki' } as IKnowledgebase
    const opening = component.edit(listItem)
    expect(dialog.open).not.toHaveBeenCalled()
    const detail = {
      ...listItem,
      documentNum: 3,
      wikiConfig: { enabled: true },
      chatModel: { id: 'llm-1' },
      wikiModel: { id: 'wiki-1' }
    }
    details.next(detail as IKnowledgebase)
    await opening
    expect(getDetail).toHaveBeenCalledWith('kb-1')
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { workspaceId: 'workspace-1', knowledgebase: detail } })
    )
  })

  it('does not open an incomplete settings dialog when loading details fails', async () => {
    const { component, dialog, toastr } = createHarness(jest.fn(() => throwError(() => new Error('Forbidden'))))
    await component.edit({ id: 'kb-1', workspaceId: 'workspace-1' } as IKnowledgebase)
    expect(dialog.open).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalled()
  })
})
