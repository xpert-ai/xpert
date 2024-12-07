import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, model, signal, viewChild } from '@angular/core'
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { ButtonGroupDirective, NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { MatDialog } from '@angular/material/dialog'
import { NgmConfirmDeleteComponent } from '@metad/ocap-angular/common'
import { distinctUntilChanged, switchMap } from 'rxjs/operators'
import { EMPTY, of } from 'rxjs'
import { toObservable } from '@angular/core/rxjs-interop'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { getErrorMessage, IXpertTool, IXpertToolset, routeAnimations, ToastrService, TToolParameter, XpertToolsetService } from '../../../../@core'
import { XpertToolsetToolTestComponent } from '../tool-test/test/tool.component'
import { XpertStudioConfigureODataComponent } from '../odata'
import { XpertStudioConfigureToolComponent } from '../openapi/'
import { XpertConfigureToolComponent } from './types'
import { omit } from 'lodash-es'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { XpertToolNameInputComponent } from 'apps/cloud/src/app/@shared/xpert'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    MaterialModule,
    ButtonGroupDirective,
    NgmI18nPipe,
    NgmDensityDirective,
    EmojiAvatarComponent,
    XpertStudioConfigureToolComponent,
    XpertStudioConfigureODataComponent,
    XpertToolsetToolTestComponent,
    XpertToolNameInputComponent
  ],
  selector: 'pac-xpert-api-tool',
  templateUrl: './api-tool.component.html',
  styleUrl: 'api-tool.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStudioAPIToolComponent {
  readonly paramId = injectParams('id')
  readonly toolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly #dialog = inject(MatDialog)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #fb = inject(FormBuilder)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #translate = inject(TranslateService)

  // Inputs
  readonly toolset = model<IXpertToolset>(null)

  // Children
  readonly configure = viewChild('configure', { read: XpertConfigureToolComponent })
  
  // Inner states
  readonly avatar = computed(() => this.toolset()?.avatar)
  // Single tool
  readonly selectedToolIds = signal<string[]>([])
  readonly selectedTools = computed(() => this.selectedToolIds().map((id) => this.toolset()?.tools.find((_) => _.id === id)))
  readonly parameters = model<Record<string, any>>(null)
  readonly testResult = signal(null)

  readonly tools = computed(() => {
    return this.toolset() ? this.toolset().tools.sort((a, b) => a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1) : []
  })

  readonly toolsDirty = signal(false)

  readonly loading = signal(false)

  private toolsetSub = toObservable(this.paramId).pipe(
    distinctUntilChanged(),
    switchMap((id) => id ? this.toolsetService.getById(this.paramId(), { relations: ['tools', 'createdBy'] }) : of(null))
  ).subscribe({
    next: (value) => {
      this.toolset.set(value)
    },
    error: (error) => {
      this.#toastr.error(getErrorMessage(error))
    }
  })

  constructor() {
    effect(() => {
      // console.log(this.selectedTools())
    })
  }

  isDirty() {
    return this.configure()?.isDirty() || this.toolsDirty()
  }

  isValid() {
    return this.configure()?.isValid()
  }

  saveToolset() {
    this.loading.set(true)
    let value: Partial<IXpertToolset> = {}
    if (this.configure()) {
      value = {
        ...this.configure().formGroup.value,
      }
    }
    if (this.toolsDirty()) {
      value.tools = this.toolset().tools
    } else {
      value = omit(value, 'tools')
    }

    this.toolsetService.update(this.toolset().id, value).subscribe({
      next: () => {
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated Successfully!' })
        this.loading.set(false)
        this.toolsDirty.set(false)
        this.configure()?.formGroup.markAsPristine()
        this.#cdr.detectChanges()
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  selectTool(tool?: IXpertTool) {
    this.selectedToolIds.set(tool ? [tool.id] : [])
    this.parameters.set(null)
  }

  updateTool(id: string, value: Partial<IXpertTool>) {
    this.toolset.update((state) => {
      const index = state.tools.findIndex((item) => item.id === id)
      if (index > -1) {
        state.tools[index] = {
          ...state.tools[index],
          ...value
        }
      }
      return {
        ...state,
        tools: [...state.tools]
      }
    })
    this.toolsDirty.set(true)
    this.#cdr.detectChanges()
  }

  onParameter(name: string, event: any) {
    this.parameters.update((state) => ({
      ...(state ?? {}),
      [name]: event
    }))
  }

  /**
   * Update parameter of tool
   * 
   * @param tool Xpert tool
   * @param name Name of parameter
   * @param parameter New value of parameter
   */
  updateParameter(tool: IXpertTool, name: string, parameter: Partial<TToolParameter>) {
    this.toolset.update((state) => {
      const index = state.tools.findIndex((item) => item.id === tool.id)
      if (index > -1) {
        const parameters = state.tools[index].schema?.parameters ?? []
        const j = parameters.findIndex((_) => _.name === name)
        if (j > -1) {
          parameters[j] = {
            ...parameters[j],
            ...parameter
          }
        } else {
          parameters.push({
            name,
            ...parameter
          })
        }
        state.tools[index] = {
          ...state.tools[index],
          schema: {
            ...state.tools[index].schema,
            parameters: [...parameters]
          }
        }
      }
      return {
        ...state,
        tools: [...state.tools]
      }
    })
    this.toolsDirty.set(true)
    this.#cdr.detectChanges()
  }

  saveParametersAsDefault(tool: IXpertTool, parameters: Record<string, unknown>) {
    this.updateTool(tool.id, {parameters})
  }

  testTool() {
    this.loading.set(true)
    this.testResult.set(null)
    this.toolsetService.testOpenAPI({
      ...this.selectedTools()[0],
      parameters: this.parameters(),
      toolset: this.toolset(),
    }).subscribe({
      next: (result) => {
        this.loading.set(false)
        if (result) {
          this.testResult.set(JSON.stringify(result, null, 4))
        } else {
          this.testResult.set(null)
        }
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  deleteToolset() {
    const toolset = this.toolset()
    this.#dialog
      .open(NgmConfirmDeleteComponent, {
        data: {
          value: toolset.name,
          information: this.#translate.instant('PAC.Xpert.DeleteAllTools', {Default: 'Delete all tools of toolset'})
        }
      })
      .afterClosed()
      .pipe(switchMap((confirm) => (confirm ? this.toolsetService.delete(toolset.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully!' }, toolset.name)
          this.#router.navigate(['/xpert'])
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  cancel() {
    // Back to workspace
    this.#router.navigate(['/xpert/w', this.toolset().workspaceId])
  }
}
