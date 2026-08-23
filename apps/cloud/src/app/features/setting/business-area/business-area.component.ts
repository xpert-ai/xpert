import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { injectOrganization } from '@cloud/app/@core/state'
import { XpTreeSelectComponent } from '@cloud/app/@shared/form-fields'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { IBusinessArea } from '@xpert-ai/contracts'
import {
  injectConfirmDelete,
  type TreeNode,
  XpSpinComponent,
  ZardButtonComponent,
  ZardTreeComponent,
  ZardTreeImports,
  ZardInputDirective,
  ZardSearchInputComponent
} from '@xpert-ai/headless-ui'
import { finalize, firstValueFrom } from 'rxjs'

import { getErrorMessage, injectBusinessAreaAPI, injectToastr, OrderTypeEnum } from '../../../@core'

interface BusinessAreaRow {
  area: IBusinessArea
  childCount: number
}

interface BusinessAreaTreeNode extends TreeNode<IBusinessArea> {
  data: IBusinessArea
  children?: BusinessAreaTreeNode[]
}

interface BusinessAreaParentTreeNode {
  key: string
  label: string
  raw: IBusinessArea
  children?: BusinessAreaParentTreeNode[]
}

@Component({
  standalone: true,
  selector: 'xp-business-area-settings',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    XpSpinComponent,
    XpTreeSelectComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSearchInputComponent,
    ...ZardTreeImports
  ],
  templateUrl: './business-area.component.html',
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusinessAreaSettingsComponent {
  readonly #businessAreaService = injectBusinessAreaAPI()
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()

  #loadRequestId = 0

  readonly organization = injectOrganization()
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly deleting = signal(false)
  readonly areas = signal<IBusinessArea[]>([])
  readonly selectedAreaId = signal<string | null>(null)
  readonly creating = signal(false)
  readonly search = signal('')

  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required]
  })
  readonly parentId = new FormControl<string | null>(null)

  readonly treeNodes = computed(() => this.buildTreeNodes(this.areas()))
  readonly rows = computed(() => this.flattenTreeNodes(this.treeNodes()))
  readonly selectedArea = computed(() => this.areas().find((area) => area.id === this.selectedAreaId()) ?? null)
  readonly filteredTreeNodes = computed(() => this.filterTreeNodes(this.treeNodes(), this.search()))
  readonly legacyAreaCount = computed(() => this.areas().filter((area) => !area.name?.trim()).length)
  readonly selectedChildCount = computed(
    () => this.rows().find(({ area }) => area.id === this.selectedAreaId())?.childCount ?? 0
  )
  readonly parentTreeNodes = computed(() => {
    const selectedId = this.creating() ? null : this.selectedAreaId()
    const excluded = selectedId ? this.descendantIds(selectedId) : new Set<string>()
    if (selectedId) {
      excluded.add(selectedId)
    }
    return this.toParentTreeNodes(this.buildTreeNodes(this.areas().filter((area) => !excluded.has(area.id))))
  })
  readonly busy = computed(() => this.loading() || this.saving() || this.deleting())
  readonly businessAreaTree = viewChild<ZardTreeComponent<IBusinessArea>>('businessAreaTree')

  constructor() {
    effect(() => {
      const organizationId = this.organization()?.id
      if (!organizationId) {
        this.areas.set([])
        this.selectedAreaId.set(null)
        return
      }
      void this.loadAreas()
    })

    effect(() => {
      if (this.creating()) {
        return
      }
      const area = this.selectedArea()
      this.name.setValue(area?.name?.trim() ?? '', { emitEvent: false })
      this.parentId.setValue(area?.parentId ?? null, { emitEvent: false })
      this.name.markAsUntouched()
    })

    effect(() => {
      const tree = this.businessAreaTree()
      const selectedId = this.creating() ? null : this.selectedAreaId()
      if (!tree) {
        return
      }
      if (selectedId) {
        tree.treeService.select(selectedId, 'single')
      } else {
        tree.treeService.selectedKeys.set(new Set())
      }
    })

    effect(() => {
      const tree = this.businessAreaTree()
      const query = this.search().trim()
      this.filteredTreeNodes()
      if (tree && query) {
        queueMicrotask(() => tree.treeService.expandAll())
      }
    })
  }

  async loadAreas(preferredAreaId?: string | null) {
    const requestId = ++this.#loadRequestId
    this.loading.set(true)
    try {
      const { items } = await firstValueFrom(
        this.#businessAreaService.getAllInOrg({
          order: { name: OrderTypeEnum.ASC },
          take: 500
        })
      )
      if (requestId !== this.#loadRequestId) {
        return
      }

      const areas = (items ?? []).filter((area) => typeof area.id === 'string' && Boolean(area.id))
      this.areas.set(areas)
      const currentId = preferredAreaId ?? this.selectedAreaId()
      const nextId = areas.some((area) => area.id === currentId)
        ? currentId
        : (this.flattenTreeNodes(this.buildTreeNodes(areas))[0]?.area.id ?? null)
      this.creating.set(false)
      this.selectedAreaId.set(nextId)
    } catch (error) {
      if (requestId === this.#loadRequestId) {
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (requestId === this.#loadRequestId) {
        this.loading.set(false)
      }
    }
  }

  selectArea(area: IBusinessArea) {
    this.creating.set(false)
    this.selectedAreaId.set(area.id)
  }

  selectTreeArea(node: TreeNode<IBusinessArea>) {
    if (node.data) {
      this.selectArea(node.data)
    }
  }

  startCreate(parent?: IBusinessArea | null) {
    this.creating.set(true)
    this.selectedAreaId.set(null)
    this.name.setValue('')
    this.parentId.setValue(parent?.id ?? null)
    this.name.markAsUntouched()
  }

  cancelCreate() {
    this.creating.set(false)
    this.selectedAreaId.set(this.rows()[0]?.area.id ?? null)
  }

  resetForm() {
    const area = this.selectedArea()
    if (!area) {
      this.cancelCreate()
      return
    }
    this.name.setValue(area.name?.trim() ?? '')
    this.parentId.setValue(area.parentId ?? null)
    this.name.markAsUntouched()
  }

  updateSearch(value: string) {
    this.search.set(value)
  }

  async save() {
    this.name.markAsTouched()
    const name = this.name.getRawValue().trim()
    if (!name) {
      return
    }

    this.saving.set(true)
    try {
      const parentId = this.parentId.getRawValue() || null
      const selected = this.selectedArea()
      const saved =
        this.creating() || !selected
          ? await firstValueFrom(this.#businessAreaService.create({ name, parentId }))
          : await firstValueFrom(this.#businessAreaService.update(selected.id, { name, parentId }))

      this.#toastr.success('XP.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
      await this.loadAreas(saved.id)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  deleteSelected() {
    const selected = this.selectedArea()
    if (!selected) {
      return
    }

    this.deleting.set(true)
    this.confirmDelete(
      {
        value: this.areaName(selected),
        information: this.#translate.instant('XP.BusinessArea.DeleteHint', {
          Default:
            'This permanently deletes the business area and all of its descendant business areas. This action cannot be undone.'
        })
      },
      this.#businessAreaService.delete(selected.id)
    )
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.#toastr.success('XP.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
          void this.loadAreas(selected.parentId)
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  areaName(area: IBusinessArea) {
    return (
      area.name?.trim() ||
      this.#translate.instant('XP.BusinessArea.Unnamed', {
        Default: 'Unnamed business area'
      })
    )
  }

  private buildTreeNodes(areas: IBusinessArea[]): BusinessAreaTreeNode[] {
    const byId = new Map(areas.map((area) => [area.id, area]))
    const children = new Map<string | null, IBusinessArea[]>()
    for (const area of areas) {
      const parentKey = area.parentId && byId.has(area.parentId) && area.parentId !== area.id ? area.parentId : null
      children.set(parentKey, [...(children.get(parentKey) ?? []), area])
    }

    const visited = new Set<string>()
    const visit = (area: IBusinessArea): BusinessAreaTreeNode | null => {
      if (visited.has(area.id)) {
        return null
      }
      visited.add(area.id)
      const childNodes = this.sortAreas(children.get(area.id) ?? [])
        .map((child) => visit(child))
        .filter((child): child is BusinessAreaTreeNode => child !== null)
      return {
        key: area.id,
        label: this.areaName(area),
        data: area,
        children: childNodes.length ? childNodes : undefined,
        leaf: childNodes.length === 0
      }
    }

    const roots = this.sortAreas(children.get(null) ?? [])
      .map((area) => visit(area))
      .filter((node): node is BusinessAreaTreeNode => node !== null)
    roots.push(
      ...this.sortAreas(areas.filter((area) => !visited.has(area.id)))
        .map((area) => visit(area))
        .filter((node): node is BusinessAreaTreeNode => node !== null)
    )
    return roots
  }

  private flattenTreeNodes(nodes: BusinessAreaTreeNode[]): BusinessAreaRow[] {
    const rows: BusinessAreaRow[] = []
    const visit = (node: BusinessAreaTreeNode) => {
      rows.push({ area: node.data, childCount: node.children?.length ?? 0 })
      node.children?.forEach(visit)
    }
    nodes.forEach(visit)
    return rows
  }

  private filterTreeNodes(nodes: BusinessAreaTreeNode[], search: string): BusinessAreaTreeNode[] {
    const query = search.trim().toLocaleLowerCase()
    if (!query) {
      return nodes
    }

    const visit = (node: BusinessAreaTreeNode): BusinessAreaTreeNode | null => {
      const filteredChildren = (node.children ?? [])
        .map((child) => visit(child))
        .filter((child): child is BusinessAreaTreeNode => child !== null)
      const matches = [node.label, node.data?.id].some((value) => value?.toLocaleLowerCase().includes(query))
      if (matches) {
        return node
      }
      if (filteredChildren.length) {
        return { ...node, children: filteredChildren, leaf: false }
      }
      return null
    }

    return nodes.map((node) => visit(node)).filter((node): node is BusinessAreaTreeNode => node !== null)
  }

  private toParentTreeNodes(nodes: BusinessAreaTreeNode[]): BusinessAreaParentTreeNode[] {
    return nodes.map((node) => ({
      key: node.key,
      label: node.label,
      raw: node.data,
      children: node.children?.length ? this.toParentTreeNodes(node.children) : undefined
    }))
  }

  private sortAreas(areas: IBusinessArea[]) {
    return [...areas].sort((left, right) => this.areaName(left).localeCompare(this.areaName(right)))
  }

  private descendantIds(areaId: string) {
    const descendants = new Set<string>()
    const byParent = new Map<string, IBusinessArea[]>()
    for (const area of this.areas()) {
      if (area.parentId) {
        byParent.set(area.parentId, [...(byParent.get(area.parentId) ?? []), area])
      }
    }

    const visit = (parentId: string) => {
      for (const child of byParent.get(parentId) ?? []) {
        if (!descendants.has(child.id)) {
          descendants.add(child.id)
          visit(child.id)
        }
      }
    }
    visit(areaId)
    return descendants
  }
}
