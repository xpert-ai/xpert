import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  AiModelTypeEnum,
  getErrorMessage,
  injectToastr,
  IXpert,
  IXpertProject,
  TXpertTeamDraft,
  XpertAPIService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertBasicDialogComponent } from '@cloud/app/@shared/xpert'
import { XpSpinComponent, ZardSearchInputComponent } from '@xpert-ai/headless-ui'
import { attrModel, linkedModel } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { EMPTY, pipe } from 'rxjs'
import { combineLatestWith, debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    XpSpinComponent,
    ZardSearchInputComponent,
    EmojiAvatarComponent
  ],
  selector: 'project-install-xpert',
  templateUrl: 'xpert.component.html',
  styleUrl: 'xpert.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class ProjectInstallXpertComponent {
  eAiModelTypeEnum = AiModelTypeEnum
  readonly xpertService = inject(XpertAPIService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #dialog = inject(Dialog)

  // Inputs
  readonly project = input<IXpertProject>()
  readonly xpertDraft = input<TXpertTeamDraft>()
  readonly myXperts = input<IXpert[]>()

  // Models
  readonly #xpertModel = linkedModel({
    initialValue: null,
    compute: () => this.xpertDraft()?.team,
    update: (value) => {
      //
    }
  })
  readonly avatar = attrModel(this.#xpertModel, 'avatar')
  readonly name = attrModel(this.#xpertModel, 'name')
  readonly description = attrModel(this.#xpertModel, 'description')
  readonly copilotModel = attrModel(this.#xpertModel, 'copilotModel')
  readonly title = attrModel(this.#xpertModel, 'title')
  readonly workspaceId = computed(() => this.project()?.workspaceId)

  readonly bindedXpert = signal<IXpert>(null)
  readonly createdXpert = model<IXpert>(null)

  readonly loading = signal(false)
  readonly error = signal<string>('')

  // All xperts
  readonly searchControl = new FormControl<string>('')
  readonly allXperts = derivedFrom(
    [this.myXperts],
    pipe(
      combineLatestWith(
        this.searchControl.valueChanges.pipe(
          debounceTime(300),
          startWith(this.searchControl.value),
          map((text) => text?.trim().toLowerCase())
        )
      ),
      map(([[xperts], text]) => {
        return text
          ? xperts?.filter(
              (_) =>
                _.name.toLowerCase().includes(text) ||
                _.title?.toLowerCase().includes(text) ||
                _.description?.toLowerCase().includes(text)
            )
          : xperts
      })
    )
  )

  constructor() {
    effect(() => {
      // console.log(this.xpertDraft())
    })
  }

  bindExpert(xpert: IXpert) {
    this.bindedXpert.set(xpert)
  }
  removeBindedXpert() {
    this.bindedXpert.set(null)
  }

  importXpert() {
    this.error.set('')
    if (this.bindedXpert()) {
      this.createdXpert.set(this.bindedXpert())
      return
    }
    const dsl = this.xpertDraft()
    this.#dialog
      .open<Partial<IXpert>>(XpertBasicDialogComponent, {
        data: {
          name: dsl.team.name,
          avatar: dsl.team.avatar,
          description: dsl.team.description,
          title: dsl.team.title,
          copilotModel: dsl.team.copilotModel,
          showWorkspaceDataScope: false
        }
      })
      .closed.pipe(
        switchMap((basic) => {
          if (basic) {
            this.loading.set(true)
            const { workspaceDataScope: _workspaceDataScope, ...portableBasic } = basic
            return this.xpertService
              .importDSL({
                ...dsl,
                team: {
                  ...dsl.team,
                  ...portableBasic,
                  workspaceId: this.workspaceId()
                }
              })
              .pipe(tap(() => this.loading.set(false)))
          }
          return EMPTY
        })
      )
      .subscribe({
        next: (xpert) => {
          this.createdXpert.set(xpert)
          this.#toastr.success(
            this.#translate.instant('XP.Xpert.ImportSuccess', { Default: 'DSL file imported successfully' })
          )
        },
        error: (err) => {
          const error = getErrorMessage(err)
          this.error.set(error)
          this.#toastr.error(
            this.#translate.instant('XP.Xpert.ImportError', { Default: 'Failed to import DSL file' }) + ': ' + error
          )
        }
      })
  }
}
