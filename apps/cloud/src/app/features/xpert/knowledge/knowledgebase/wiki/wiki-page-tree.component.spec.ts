import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import type {
  KnowledgeWikiFolder,
  KnowledgeWikiPageListItem,
  KnowledgeWikiPageType,
  KnowledgeWikiTaxonomy
} from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { KnowledgeWikiService } from '../../../../../@core'
import { WikiPageTreeComponent } from './wiki-page-tree.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

function page(
  id: string,
  folderId: string | null,
  pageType: KnowledgeWikiPageType = 'concept'
): KnowledgeWikiPageListItem {
  return {
    id,
    title: id,
    pageKey: `${pageType}:${id}`,
    pageType,
    canonicalName: id,
    slug: id,
    summary: 'Summary text',
    status: 'ready',
    projectionStatus: 'ready',
    updatedAt: '',
    placement: { folderId, source: 'automatic', version: 1 }
  }
}
function folder(id: string, parentId: string | null, pageCount: number): KnowledgeWikiFolder {
  return { id, name: id, parentId, pageCount, description: '', position: 0, version: 1 }
}

describe('Wiki unified page tree', () => {
  let fixture: ComponentFixture<WikiPageTreeComponent>
  const service = { getPages: jest.fn() }
  const pages = [
    page('Index', null, 'index'),
    page('A', 'child'),
    page('B', 'child'),
    page('C', 'other'),
    page('D', null)
  ]
  const taxonomy: KnowledgeWikiTaxonomy = {
    enabled: false,
    revision: 1,
    total: 5,
    unclassifiedCount: 1,
    folders: [folder('parent', null, 0), folder('child', 'parent', 2), folder('other', null, 1)]
  }
  beforeEach(async () => {
    service.getPages.mockReset().mockReturnValue(of({ items: [], total: 0 }))
    await TestBed.configureTestingModule({
      imports: [WikiPageTreeComponent, TranslateModule.forRoot()],
      providers: [{ provide: KnowledgeWikiService, useValue: service }]
    }).compileComponents()
    fixture = TestBed.createComponent(WikiPageTreeComponent)
    fixture.componentRef.setInput('id', 'kb')
    fixture.componentRef.setInput('taxonomy', taxonomy)
    fixture.componentRef.setInput('pages', pages)
    fixture.componentRef.setInput('selectedPage', pages[1])
  })
  afterEach(() => {
    fixture.destroy()
    TestBed.resetTestingModule()
  })
  async function render() {
    fixture.autoDetectChanges()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture.nativeElement as HTMLElement
  }

  it('renders nested directories, page leaves, root indexes and unclassified pages in one tree', async () => {
    const root = await render(),
      component = fixture.componentInstance
    expect(root.querySelectorAll('z-tree')).toHaveLength(1)
    expect(
      root.querySelector(
        'z-tree-node[data-key="folder:parent"] z-tree-node[data-key="folder:child"] z-tree-node[data-key="page:A"]'
      )
    ).not.toBeNull()
    expect(root.querySelector('z-tree-node[data-key="unclassified"] z-tree-node[data-key="page:D"]')).not.toBeNull()
    expect(component.nodes()[0].key).toBe('page:Index')
    expect(component.tree()?.treeService.isExpanded('folder:parent')).toBe(true)
    expect(component.tree()?.treeService.isExpanded('folder:child')).toBe(true)
    expect(component.tree()?.treeService.isSelected('page:A')).toBe(true)
    expect(root.textContent).not.toContain('Summary text')
    expect(component.nodes().find((node) => node.key === 'folder:parent')?.data).toMatchObject({ count: 2 })
    expect(service.getPages).not.toHaveBeenCalled()
  })

  it('opens a leaf directly and toggles a directory without opening a page', async () => {
    const root = await render(),
      component = fixture.componentInstance
    const open = jest.fn(),
      select = jest.fn()
    component.openPage.subscribe(open)
    component.folderSelected.subscribe(select)
    root.querySelector<HTMLElement>('z-tree-node[data-key="page:A"] > div [role="treeitem"]').click()
    await render()
    expect(open).toHaveBeenCalledWith('A')
    component.selectNode(component.nodes().find((node) => node.key === 'folder:parent'))
    expect(select).toHaveBeenCalledWith('parent')
    expect(component.tree()?.treeService.isExpanded('folder:parent')).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('hides empty filtered directories but preserves ancestors of matching pages', async () => {
    fixture.componentRef.setInput('pageType', 'concept')
    fixture.componentRef.setInput('search', 'B')
    fixture.componentRef.setInput('pages', [pages[2]])
    fixture.componentRef.setInput('taxonomy', {
      ...taxonomy,
      total: 1,
      unclassifiedCount: 0,
      folders: [folder('parent', null, 0), folder('child', 'parent', 1), folder('other', null, 0)]
    })
    const root = await render()
    expect(root.querySelector('z-tree-node[data-key="folder:parent"] z-tree-node[data-key="page:B"]')).not.toBeNull()
    expect(root.querySelector('z-tree-node[data-key="folder:other"]')).toBeNull()
    expect(root.querySelector('z-tree-node[data-key="page:A"]')).toBeNull()
    expect(root.querySelector('z-tree-node[data-key="unclassified"]')).toBeNull()
    expect(fixture.componentInstance.tree()?.treeService.isExpanded('folder:child')).toBe(true)
  })

  it('shows one empty state when a filter has no results', async () => {
    fixture.componentRef.setInput('pageType', 'entity')
    fixture.componentRef.setInput('pages', [])
    fixture.componentRef.setInput('taxonomy', {
      ...taxonomy,
      total: 0,
      unclassifiedCount: 0,
      folders: taxonomy.folders.map((item) => ({ ...item, pageCount: 0 }))
    })
    const root = await render()
    expect(fixture.componentInstance.nodes()).toEqual([])
    expect(root.textContent).toContain('XP.Knowledgebase.Wiki.Empty')
    expect(service.getPages).not.toHaveBeenCalled()
  })

  it('loads an unseeded directory on expansion and keeps pagination inside that directory', async () => {
    const first = Array.from({ length: 50 }, (_, i) => page(`page-${i}`, 'large'))
    service.getPages.mockReturnValueOnce(of({ items: first, total: 51 }))
    fixture.componentRef.setInput('selectedPage', null)
    fixture.componentRef.setInput('pages', [])
    fixture.componentRef.setInput('taxonomy', {
      ...taxonomy,
      total: 51,
      unclassifiedCount: 0,
      folders: [folder('large', null, 51)]
    })
    await render()
    expect(service.getPages).not.toHaveBeenCalled()
    fixture.componentInstance.tree()?.treeService.expand('folder:large')
    await render()
    expect(service.getPages).toHaveBeenCalledWith(
      'kb',
      expect.objectContaining({ folderId: 'large', skip: 0, take: 50 })
    )
    const component = fixture.componentInstance
    expect(component.nodes()[0].children).toHaveLength(51)
    expect(component.nodes()[0].children.at(-1)?.data).toMatchObject({ kind: 'more', branch: 'folder:large' })
    service.getPages.mockReturnValueOnce(of({ items: [page('last', 'large')], total: 51 }))
    await component.loadBranch('folder:large')
    await render()
    expect(service.getPages).toHaveBeenLastCalledWith(
      'kb',
      expect.objectContaining({ folderId: 'large', skip: 50, take: 50 })
    )
    expect(component.nodes()[0].children).toHaveLength(51)
    expect(component.nodes()[0].children.at(-1)?.key).toBe('page:last')
  })

  it('does not count a revealed deep link as a fetched page when paginating', async () => {
    fixture.componentRef.setInput('pages', [pages[1]])
    fixture.componentRef.setInput('selectedPage', page('outside', 'child'))
    fixture.componentRef.setInput('taxonomy', {
      ...taxonomy,
      total: 3,
      unclassifiedCount: 0,
      folders: [folder('child', null, 3)]
    })
    await render()
    const component = fixture.componentInstance
    expect(component.nodes()[0].children.some((node) => node.key === 'page:outside')).toBe(true)
    service.getPages.mockReturnValueOnce(of({ items: [pages[2], page('outside', 'child')], total: 3 }))
    await component.loadBranch('folder:child')
    expect(service.getPages).toHaveBeenLastCalledWith('kb', expect.objectContaining({ skip: 1 }))
    expect(component.nodes()[0].children.map((node) => node.key)).toEqual(['page:A', 'page:B', 'page:outside'])
  })

  it('passes the same filters to branch pagination and cancels stale results after a filter change', async () => {
    fixture.componentRef.setInput('pageType', 'concept')
    fixture.componentRef.setInput('search', 'A')
    await render()
    const delayed = new Subject<{ items: KnowledgeWikiPageListItem[]; total: number }>()
    service.getPages.mockReturnValueOnce(delayed)
    const component = fixture.componentInstance,
      pending = component.loadBranch('folder:child')
    expect(service.getPages).toHaveBeenLastCalledWith(
      'kb',
      expect.objectContaining({ pageType: 'concept', search: 'A', folderId: 'child' })
    )
    fixture.componentRef.setInput('search', 'B')
    await render()
    await pending
    expect(delayed.observed).toBe(false)
    delayed.next({ items: [page('obsolete', 'child')], total: 1 })
    expect(component.branches().has('folder:child')).toBe(false)
  })

  it('offers a retry on the affected tree branch without replacing the tree', async () => {
    await render()
    service.getPages.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    await fixture.componentInstance.loadBranch('folder:child')
    await render()
    const parent = fixture.componentInstance.nodes().find((node) => node.key === 'folder:parent')
    const child = parent.children.find((node) => node.key === 'folder:child')
    expect(child.children.at(-1)?.data).toMatchObject({ kind: 'more', error: 'Unavailable', loading: false })
    expect(child.children.some((node) => node.key === 'page:A')).toBe(true)
  })
})
