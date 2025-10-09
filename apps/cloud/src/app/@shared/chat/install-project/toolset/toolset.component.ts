import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { AiModelTypeEnum, injectToastr, IXpertProject, IXpertToolset, XpertAPIService, XpertToolsetService } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { injectConfigureBuiltin } from '@cloud/app/features/xpert/tools'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { omit } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { map } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmSpinComponent,
    EmojiAvatarComponent
  ],
  selector: 'project-install-toolset',
  templateUrl: 'toolset.component.html',
  styleUrl: 'toolset.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectInstallToolsetComponent {
  eAiModelTypeEnum = AiModelTypeEnum
  readonly xpertService = inject(XpertAPIService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #dialog = inject(Dialog)
  readonly toolsetService = inject(XpertToolsetService)
  readonly configureBuiltin = injectConfigureBuiltin()

  // Inputs
  readonly project = input<IXpertProject>()
  readonly toolset = input<IXpertToolset>()

  // Models
  readonly workspaceId = computed(() => this.project()?.workspaceId)
  readonly name = computed(() => this.toolset()?.name || '')
  readonly description = computed(() => this.toolset()?.description || '')

  readonly bindedToolset = signal<IXpertToolset>(null)
  readonly createdToolset = model<IXpertToolset>(null)

  readonly loading = signal(false)
  readonly error = signal<string>('')

  readonly providerName = computed(() => this.toolset()?.type)
  readonly toolsets = derivedAsync(() => {
    if (this.providerName() && this.workspaceId()) {
      return this.toolsetService
        .getBuiltinToolInstances(this.workspaceId(), this.providerName())
        .pipe(map(({ items }) => items))
    }
    return null
  })

  constructor() {
    effect(() => {
      // console.log(this.xpertDraft())
    })
  }

  bindToolset(item: IXpertToolset) {
    this.bindedToolset.set(item)
  }
  removeBindedToolset() {
    this.bindedToolset.set(null)
  }

  importToolset() {
    if (this.bindedToolset())  {
      this.createdToolset.set(this.bindedToolset())
    } else {
      this.configureToolBuiltin()
    }
  }

  configureToolBuiltin() {
    const providerName = this.toolset().type
    this.configureBuiltin(
      providerName,
      this.workspaceId(),
      omit(this.toolset(), 'id', 'tools'),
      this.toolset().tools?.map((tool) => omit(tool, 'id', 'toolsetId'))
    ).subscribe((toolset) => {
      if (toolset && toolset.id) {
        this.createdToolset.set(toolset)
      }
    })
  }
}
