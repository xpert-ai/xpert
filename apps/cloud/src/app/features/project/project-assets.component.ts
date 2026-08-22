import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardInputDirective,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import type { IXpertProjectAsset } from '@xpert-ai/contracts'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { XpertProjectFacade } from './project.facade'

@Component({
  standalone: true,
  selector: 'xp-project-assets',
  imports: [
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardCardImports,
    ...ZardTableImports
  ],
  template: `
    <section class="mx-auto flex h-full min-h-0 w-full flex-col gap-4 p-4 sm:p-6">
      <header class="flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-text-primary">
            {{ 'XP.XProject.ProjectLibrary' | translate }}
          </h2>
          <p class="mt-1 text-xs text-text-tertiary">
            {{ 'XP.XProject.AssetCount' | translate: { count: facade.assetCount() } }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <input #fileInput type="file" class="hidden" (change)="upload($event, fileInput)" />
          <button
            z-button
            zType="default"
            zSize="default"
            type="button"
            [disabled]="uploading()"
            (click)="fileInput.click()"
          >
            <i class="ri-upload-2-line mr-1"></i
            >{{ (uploading() ? 'XP.XProject.Uploading' : 'XP.XProject.UploadAsset') | translate }}
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1">
        <div class="flex flex-col gap-4">
          @if (folderStack().length) {
            <nav
              class="flex min-w-0 items-center gap-1 overflow-x-auto text-sm"
              [attr.aria-label]="'XP.XProject.ProjectNavigation' | translate"
            >
              <button z-button zType="ghost" zSize="sm" type="button" (click)="goToRoot()">
                {{ 'XP.XProject.ProjectLibrary' | translate }}
              </button>
              @for (folder of folderStack(); track folder.id; let index = $index; let last = $last) {
                <i class="ri-arrow-right-s-line shrink-0 text-text-tertiary"></i>
                <button z-button zType="ghost" zSize="sm" type="button" [disabled]="last" (click)="goToFolder(index)">
                  {{ folder.name }}
                </button>
              }
            </nav>
          }

          <div class="flex flex-col gap-3 md:flex-row">
            <input
              z-input
              class="w-full md:max-w-sm"
              [placeholder]="'XP.XProject.SearchAssets' | translate"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
            />
            <div class="flex gap-1 text-xs">
              @for (filter of filters; track filter) {
                <button
                  z-button
                  zType="ghost"
                  zSize="sm"
                  type="button"
                  [class.bg-background-default-subtle]="kind() === filter"
                  (click)="kind.set(filter)"
                >
                  {{ 'XP.XProject.AssetFilter.' + filter | translate }}
                </button>
              }
            </div>
          </div>

          @if (facade.assetsError()) {
            <div
              class="rounded-lg border border-text-destructive bg-status-error-bg/10 px-4 py-3 text-sm text-text-destructive"
            >
              {{ facade.assetsError() }}
            </div>
          }
          @if (facade.assetsLoading() && !facade.assets().length) {
            <div
              class="rounded-lg border border-divider-subtle bg-components-card-bg px-4 py-10 text-center text-sm text-text-secondary"
            >
              {{ 'XP.XProject.LoadingAssets' | translate }}
            </div>
          } @else {
            <z-card class="w-full overflow-hidden border border-divider-regular bg-components-card-bg shadow-none">
              <z-card-content class="p-0">
                <div class="overflow-x-auto">
                  <table z-table zSize="compact" class="w-full min-w-[760px] text-sm">
                    <thead z-table-header>
                      <tr z-table-row class="bg-background-default-subtle">
                        <th z-table-head>{{ 'XP.XProject.AssetColumn' | translate }}</th>
                        <th z-table-head>{{ 'XP.XProject.TypeColumn' | translate }}</th>
                        <th z-table-head>{{ 'XP.XProject.SourceColumn' | translate }}</th>
                        <th z-table-head>{{ 'XP.XProject.SizeColumn' | translate }}</th>
                        <th z-table-head>{{ 'XP.XProject.StatusColumn' | translate }}</th>
                        <th z-table-head>{{ 'XP.XProject.RelatedObjectColumn' | translate }}</th>
                      </tr>
                    </thead>
                    <tbody z-table-body>
                      @for (asset of visibleAssets(); track asset.id) {
                        <tr z-table-row class="hover:bg-background-default-subtle/60">
                          <td z-table-cell>
                            @if (asset.kind === 'folder') {
                              <button
                                z-button
                                zType="ghost"
                                zSize="sm"
                                type="button"
                                class="-ml-2 max-w-full justify-start"
                                (click)="openFolder(asset)"
                              >
                                <i class="ri-folder-3-line mr-2 text-text-warning"></i
                                ><span class="truncate">{{ asset.name }}</span>
                              </button>
                            } @else {
                              <div class="flex min-w-0 items-center gap-2">
                                <i class="ri-file-3-line text-text-secondary"></i>
                                <div class="min-w-0">
                                  <div class="truncate font-medium text-text-primary">{{ asset.name }}</div>
                                  <div class="truncate text-xs text-text-tertiary">{{ asset.path }}</div>
                                </div>
                              </div>
                            }
                          </td>
                          <td z-table-cell>
                            <z-badge zType="outline">{{ asset.mimeType || asset.kind }}</z-badge>
                          </td>
                          <td z-table-cell class="text-text-secondary">{{ asset.source }}</td>
                          <td z-table-cell class="text-text-secondary">{{ formatSize(asset.size) }}</td>
                          <td z-table-cell>
                            <z-badge zType="outline">{{
                              asset.status || ('XP.XProject.Available' | translate)
                            }}</z-badge>
                          </td>
                          <td z-table-cell class="text-text-secondary">
                            {{ asset.taskId || asset.conversationId || '—' }}
                          </td>
                        </tr>
                      } @empty {
                        <tr z-table-row>
                          <td z-table-cell colspan="6" class="py-12 text-center text-text-tertiary">
                            {{ 'XP.XProject.NoIndexedAssets' | translate }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </z-card-content>
            </z-card>
            @if (hasMore()) {
              <div class="flex justify-center">
                <button
                  z-button
                  zType="outline"
                  zSize="sm"
                  type="button"
                  [disabled]="facade.assetsLoading()"
                  (click)="loadMore()"
                >
                  {{ 'XP.XProject.LoadMoreAssets' | translate }}
                </button>
              </div>
            }
          }
        </div>
      </div>
    </section>
  `,
  host: { class: 'block h-full min-h-0 w-full min-w-0' }
})
export class XpertProjectAssetsComponent implements OnInit {
  readonly facade = inject(XpertProjectFacade)
  readonly #route = inject(ActivatedRoute)
  readonly #toastr = injectToastr()
  readonly projectId = this.#route.parent?.snapshot.paramMap.get('id') ?? ''
  readonly search = signal('')
  readonly kind = signal<'all' | 'file' | 'folder'>('all')
  readonly folderStack = signal<IXpertProjectAsset[]>([])
  readonly uploading = signal(false)
  readonly filters: Array<'all' | 'file' | 'folder'> = ['all', 'file', 'folder']
  readonly visibleAssets = computed(() =>
    this.facade
      .assets()
      .filter(
        (asset) =>
          (this.kind() === 'all' || asset.kind === this.kind()) &&
          `${asset.name} ${asset.path}`.toLowerCase().includes(this.search().toLowerCase().trim())
      )
  )
  readonly hasMore = computed(() => this.facade.assets().length < this.facade.assetsTotal())

  ngOnInit() {
    void this.loadFolder()
  }

  formatSize(size?: number) {
    if (!size) return '—'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  openFolder(asset: IXpertProjectAsset) {
    if (asset.kind !== 'folder') return
    this.folderStack.update((stack) => [...stack, asset])
    this.search.set('')
    this.kind.set('all')
    void this.loadFolder()
  }

  goToRoot() {
    this.folderStack.set([])
    this.search.set('')
    this.kind.set('all')
    void this.loadFolder()
  }

  goToFolder(index: number) {
    this.folderStack.update((stack) => stack.slice(0, index + 1))
    this.search.set('')
    this.kind.set('all')
    void this.loadFolder()
  }

  loadMore() {
    void this.loadFolder(true)
  }

  async upload(event: Event, input: HTMLInputElement) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    this.uploading.set(true)
    try {
      await this.facade.uploadAsset(file)
      await this.loadFolder()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.uploading.set(false)
      input.value = ''
    }
  }

  private loadFolder(append = false) {
    if (!this.projectId) return Promise.resolve()
    const currentFolder = this.folderStack()[this.folderStack().length - 1]
    return this.facade.loadAssets(this.projectId, {
      parentId: currentFolder?.id,
      skip: append ? this.facade.assets().length : 0,
      take: 100,
      append
    })
  }
}
