import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { routeAnimations } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IBuiltinTool,
  injectHelpWebsite,
  IXpertTool,
  IXpertToolset,
  TagCategoryEnum,
  ToastrService,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { omit } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, of } from 'rxjs'
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators'
import { XpertToolBuiltinAuthorizeComponent } from '../authorize/authorize.component'
import { XpertToolBuiltinToolComponent } from '../tool/tool.component'

/**
 * If toolset and tool do not have id, they are considered as templates.
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTooltipModule,
    EmojiAvatarComponent,
    NgmI18nPipe,

    XpertToolBuiltinAuthorizeComponent,
    XpertToolBuiltinToolComponent
  ],
  selector: 'xpert-tool-configure-builtin',
  templateUrl: './configure.component.html',
  styleUrl: 'configure.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertToolConfigureBuiltinComponent {
  eTagCategoryEnum = TagCategoryEnum

  readonly #toolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly #dialogRef = inject(DialogRef<IXpertToolset>)
  readonly #data = inject<{
    workspaceId: string
    providerName: string
    toolset: IXpertToolset
    tools?: IXpertTool[]
  }>(DIALOG_DATA)
  readonly helpBaseUrl = injectHelpWebsite()

  readonly #refresh$ = new BehaviorSubject<void>(null)

  readonly toolset = model<IXpertToolset>(this.#data.toolset)
  readonly tools = signal<IXpertTool[]>(this.#data.tools)
  readonly providerName = signal(this.#data.providerName)
  readonly workspaceId = signal(this.#data.workspaceId)
  readonly toolsetId = computed(() => this.toolset()?.id)

  readonly provider = derivedAsync(() =>
    this.providerName() ? this.#toolsetService.getProvider(this.providerName()) : of(null)
  )
  readonly notImplemented = computed(() => this.provider()?.not_implemented)

  readonly builtinTools = derivedAsync(() => {
    if (this.providerName()) {
      return this.#toolsetService.getBuiltinTools(this.providerName())
    }
    return null
  })

  readonly toolsets = derivedAsync(() => {
    if (this.providerName() && !this.toolset()) {
      return this.#refresh$.pipe(
        switchMap(() => this.#toolsetService.getBuiltinToolInstances(this.workspaceId(), this.providerName())),
        map(({ items }) => items)
      )
    }
    return null
  })

  readonly loading = signal(false)
  readonly authorizing = signal(false)

  readonly credentials = model<Record<string, unknown>>(null)

  readonly dirty = signal<boolean>(false)

  // Subscriptions
  private toolsSub = toObservable(this.toolsetId)
    .pipe(
      distinctUntilChanged(),
      switchMap((id) => (id ? this.#toolsetService.getToolsetTools(this.toolsetId()) : of(null)))
    )
    .subscribe((tools) => {
      if (tools) {
        this.tools.update((state) => {
          const _tools = state?.filter((_) => !_.id && !tools.some((tool) => tool.name === _.name) && 
              !(_.toolsetId && _.toolsetId !== this.toolsetId())
            ) ?? []
          return _tools.concat(tools)
        })
      }
    })

  openAuthorize(toolset?: IXpertToolset) {
    this.toolset.set(toolset)
    this.authorizing.set(true)
  }

  closeAuthorize(refresh: boolean) {
    this.authorizing.set(false)
    if (refresh) {
      this.#refresh$.next()
    }
    this.dirty.set(true)
  }

  cancel(event: MouseEvent) {
    this.#dialogRef.close()
    event.preventDefault()
  }

  getToolEnabled(name: string) {
    return this.tools()?.find((_) => _.name === name)?.enabled
  }

  setToolEnabled(name: string, enabled: boolean, schema: IBuiltinTool) {
    const tool = this.tools()?.find((_) => _.name === name)
    if (tool) {
      tool.enabled = enabled
    } else {
      this.tools.update((state) => {
        return [...(state ?? []), {
          name,
          enabled,
          schema
        }]
      })
    }

    this.dirty.set(true)
  }

  save() {
    this.loading.set(true)
    const toolset = {
      ...omit(this.toolset(), 'tags'),
      tools: this.tools(),
      options: {
        ...(this.toolset().options ?? {}),
        toolPositions: this.getToolPositions()
      }
    }
    this.#toolsetService
      .update(this.toolset().id, toolset)
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
          this.loading.set(false)
          this.#dialogRef.close(toolset)
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
          this.loading.set(false)
        }
      })
  }

  getToolPositions() {
    return this.builtinTools().reduce((acc, tool, index) => {
      acc[tool.identity.name] = index
      return acc
    }, {})
  }
}

export function injectConfigureBuiltin() {
  const dialog = inject(Dialog)

  return (providerName: string, workspaceId: string, toolset: IXpertToolset, tools: IXpertTool[]) => {
    return dialog.open<IXpertToolset>(XpertToolConfigureBuiltinComponent, {
      disableClose: true,
      data: {
        providerName,
        workspaceId,
        toolset,
        tools
      }
    }).closed
  }
}
