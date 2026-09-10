import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type {
  KnowledgeWikiFolder,
  KnowledgeWikiPageListItem,
  KnowledgeWikiPageType,
  KnowledgeWikiPageGroup,
  KnowledgeWikiTaxonomy
} from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardTreeComponent,
  ZardTreeImports,
  type TreeNode
} from '@xpert-ai/headless-ui'
import { firstValueFrom, Subject, takeUntil } from 'rxjs'
import { KnowledgeWikiService, getErrorMessage } from '../../../../../@core'

type WikiTreeItem =
  | { kind: 'folder'; folder: KnowledgeWikiFolder; count: number }
  | { kind: 'unclassified'; count: number }
  | { kind: 'page'; page: KnowledgeWikiPageListItem }
  | { kind: 'more'; branch: string; loading: boolean; error?: string }
type BranchPages = { items: KnowledgeWikiPageListItem[]; total: number; loading: boolean; error?: string }
const folderKey = (id: string) => `folder:${id}`
const pageKey = (id: string) => `page:${id}`
const branchFor = (page: KnowledgeWikiPageListItem) =>
  page.pageType === 'index' ? 'index' : page.placement?.folderId ? folderKey(page.placement.folderId) : 'unclassified'

@Component({
  standalone: true,
  selector: 'xp-wiki-page-tree',
  imports: [...ZardTreeImports, TranslateModule, ZardButtonComponent, ZardIconComponent],
  templateUrl: './wiki-page-tree.component.html',
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WikiPageTreeComponent {
  readonly id = input.required<string>()
  readonly taxonomy = input<KnowledgeWikiTaxonomy | null>(null)
  readonly pages = input<KnowledgeWikiPageListItem[]>([])
  readonly selectedPage = input<KnowledgeWikiPageListItem | null>(null)
  readonly folderId = input<string | null>(null)
  readonly search = input('')
  readonly pageGroup = input<KnowledgeWikiPageGroup | undefined>()
  readonly pageType = input<KnowledgeWikiPageType | undefined>()
  readonly loading = input(false)
  readonly canManage = input(false)
  readonly organizing = input(false)
  readonly openPage = output<string>()
  readonly folderSelected = output<string>()
  readonly editFolder = output<KnowledgeWikiFolder>()
  readonly tree = viewChild<ZardTreeComponent<WikiTreeItem>>('tree')
  readonly branches = signal(new Map<string, BranchPages>())
  readonly filtered = computed(() => !!this.search() || !!this.pageType() || !!this.pageGroup())
  readonly #service = inject(KnowledgeWikiService)
  readonly #translate = inject(TranslateService)
  readonly #cancel = new Subject<void>()
  #scope = 0
  #knowledgebaseId: string | undefined

  readonly nodes = computed<TreeNode<WikiTreeItem>[]>(() => {
    const taxonomy = this.taxonomy()
    if (!taxonomy) return []
    const folders = new Map<string, TreeNode<WikiTreeItem>>()
    for (const folder of taxonomy.folders) {
      folders.set(folder.id, {
        key: folderKey(folder.id),
        label: folder.name,
        data: { kind: 'folder', folder, count: this.branches().get(folderKey(folder.id))?.total ?? folder.pageCount },
        children: []
      })
    }
    const roots: TreeNode<WikiTreeItem>[] = []
    for (const folder of taxonomy.folders) {
      const node = folders.get(folder.id)
      const parent = folders.get(folder.parentId)
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    const populate = (node: TreeNode<WikiTreeItem>): TreeNode<WikiTreeItem> | null => {
      if (node.data?.kind !== 'folder') return node
      const children = node.children.map(populate).filter((child): child is TreeNode<WikiTreeItem> => child !== null)
      node.data.count += children.reduce(
        (count, child) => count + (child.data?.kind === 'folder' ? child.data.count : 0),
        0
      )
      if (this.filtered() && node.data.count === 0) return null
      node.children = [...children, ...this.pageNodes(node.key)]
      return node
    }
    const result = [
      ...this.pageNodes('index'),
      ...roots.map(populate).filter((node): node is TreeNode<WikiTreeItem> => node !== null)
    ]
    const unclassified = this.branches().get('unclassified')?.total ?? taxonomy.unclassifiedCount
    if (unclassified > 0)
      result.push({
        key: 'unclassified',
        label: this.#translate.instant('XP.Knowledgebase.Wiki.Organization.Unclassified'),
        data: { kind: 'unclassified', count: unclassified },
        children: this.pageNodes('unclassified')
      })
    return result
  })

  constructor() {
    effect(() => {
      const id = this.id()
      this.taxonomy()
      this.pages()
      this.search()
      this.pageType()
      this.pageGroup()
      untracked(() => {
        this.#scope++
        this.#cancel.next()
        this.branches.set(new Map())
        if (this.#knowledgebaseId !== id) this.tree()?.treeService.collapseAll()
        this.#knowledgebaseId = id
      })
    })
    effect(() => {
      const tree = this.tree(),
        selected = this.selectedPage(),
        folder = this.folderId(),
        taxonomy = this.taxonomy(),
        pages = this.pages(),
        filtered = this.filtered()
      if (!tree || !taxonomy) return
      untracked(() => {
        const reveal = (branch: string) => {
          const visited = new Set<string>()
          while (branch !== 'index' && !visited.has(branch)) {
            visited.add(branch)
            tree.treeService.expand(branch)
            const parent = taxonomy.folders.find((item) => folderKey(item.id) === branch)?.parentId
            if (!parent) break
            branch = folderKey(parent)
          }
        }
        if (folder) reveal(folder === 'unclassified' ? folder : folderKey(folder))
        if (selected && (!filtered || pages.some((page) => page.id === selected.id))) {
          reveal(branchFor(selected))
          tree.treeService.select(pageKey(selected.id), 'single')
        } else tree.treeService.selectedKeys.set(new Set())
        if (filtered) pages.forEach((page) => reveal(branchFor(page)))
        if (!taxonomy.folders.length) reveal('unclassified')
      })
    })
    effect(() => {
      const tree = this.tree(),
        rows = tree?.treeService.flattenedNodes() ?? [],
        expanded = tree?.treeService.expandedKeys(),
        branches = this.branches()
      this.taxonomy()
      this.pages()
      if (this.loading() && !this.pages().length) return
      untracked(() => {
        const loadFirst = (branch: string) => {
          if (!branches.has(branch) && this.seedPages(branch).length === 0 && this.branchCount(branch) > 0)
            void this.loadBranch(branch)
        }
        loadFirst('index')
        for (const row of rows) {
          if (
            expanded?.has(row.node.key) &&
            (row.node.data?.kind === 'folder' || row.node.data?.kind === 'unclassified')
          )
            loadFirst(row.node.key)
        }
      })
    })
    inject(DestroyRef).onDestroy(() => {
      this.#scope++
      this.#cancel.next()
      this.#cancel.complete()
    })
  }

  nodeData(node: TreeNode<WikiTreeItem>) {
    return node.data
  }

  private seedPages(branch: string) {
    return this.pages().filter((page) => branchFor(page) === branch)
  }

  private branchCount(branch: string) {
    const taxonomy = this.taxonomy()
    if (!taxonomy) return 0
    if (branch === 'index')
      return Math.max(
        0,
        taxonomy.total -
          taxonomy.unclassifiedCount -
          taxonomy.folders.reduce((total, folder) => total + folder.pageCount, 0)
      )
    if (branch === 'unclassified') return taxonomy.unclassifiedCount
    return taxonomy.folders.find((folder) => folderKey(folder.id) === branch)?.pageCount ?? 0
  }

  private pageNodes(branch: string): TreeNode<WikiTreeItem>[] {
    const cached = this.branches().get(branch),
      pages = cached?.items ?? this.seedPages(branch),
      total = cached?.total ?? this.branchCount(branch)
    const visible = [...pages]
    const selected = this.selectedPage()
    if (
      !this.filtered() &&
      selected &&
      branchFor(selected) === branch &&
      !visible.some((page) => page.id === selected.id)
    )
      visible.push(selected)
    const nodes: TreeNode<WikiTreeItem>[] = visible.map((page) => ({
      key: pageKey(page.id),
      label: page.title,
      leaf: true,
      data: { kind: 'page', page }
    }))
    if (pages.length < total || cached?.error)
      nodes.push({
        key: `more:${branch}`,
        leaf: true,
        disabled: cached?.loading,
        label: this.#translate.instant(
          cached?.error ? 'XP.ACTIONS.Retry' : 'XP.Knowledgebase.Wiki.Organization.LoadMore'
        ),
        data: { kind: 'more', branch, loading: cached?.loading ?? false, error: cached?.error }
      })
    return nodes
  }

  selectNode(node: TreeNode<WikiTreeItem>) {
    const data = node.data
    if (!data) return
    if (data.kind === 'page') this.openPage.emit(data.page.id)
    else if (data.kind === 'more') void this.loadBranch(data.branch)
    else {
      this.tree()?.treeService.toggle(node.key)
      this.folderSelected.emit(data.kind === 'folder' ? data.folder.id : 'unclassified')
    }
  }

  async loadBranch(branch: string) {
    const cached = this.branches().get(branch)
    if (cached?.loading) return
    const pages = cached?.items ?? this.seedPages(branch),
      scope = this.#scope
    const folder = this.taxonomy()?.folders.find((item) => folderKey(item.id) === branch)
    if (!folder && branch !== 'index' && branch !== 'unclassified') return
    this.branches.update((value) =>
      new Map(value).set(branch, { items: pages, total: cached?.total ?? this.branchCount(branch), loading: true })
    )
    try {
      const result = await firstValueFrom(
        this.#service
          .getPages(this.id(), {
            search: this.search() || undefined,
            pageType: branch === 'index' ? 'index' : this.pageType(),
            pageGroup: branch === 'index' ? undefined : this.pageGroup(),
            folderId: folder?.id,
            unclassified: branch === 'unclassified',
            skip: pages.length,
            take: 50
          })
          .pipe(takeUntil(this.#cancel)),
        { defaultValue: null }
      )
      if (!result || scope !== this.#scope) return
      const items = Array.from(new Map([...pages, ...result.items].map((page) => [page.id, page])).values())
      this.branches.update((value) => new Map(value).set(branch, { items, total: result.total, loading: false }))
    } catch (error) {
      if (scope === this.#scope)
        this.branches.update((value) =>
          new Map(value).set(branch, {
            items: pages,
            total: cached?.total ?? this.branchCount(branch),
            loading: false,
            error: getErrorMessage(error)
          })
        )
    }
  }
}
