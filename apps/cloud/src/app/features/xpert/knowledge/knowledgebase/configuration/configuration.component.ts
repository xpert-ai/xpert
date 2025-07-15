import { ChangeDetectorRef, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IKnowledgebase,
  KnowledgebasePermission,
  KnowledgebaseService,
  AiModelTypeEnum,
  Store,
  ToastrService,
  getErrorMessage,
  routeAnimations
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { EmojiAvatarComponent } from "../../../../../@shared/avatar/emoji-avatar/avatar.component";
import { PACCopilotService } from '../../../../services'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatRadioModule } from '@angular/material/radio'
import { MatInputModule } from '@angular/material/input'
import { MatButtonModule } from '@angular/material/button'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase-configuration',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
  imports: [
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTooltipModule,
    MatRadioModule,
    MatInputModule,
    MatButtonModule,
    NgmCommonModule,
    EmojiAvatarComponent,
    CopilotModelSelectComponent
],
  animations: [routeAnimations]
})
export class KnowledgeConfigurationComponent extends TranslationBaseComponent {
  KnowledgebasePermission = KnowledgebasePermission
  DisplayBehaviour = DisplayBehaviour
  eModelType = AiModelTypeEnum

  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly copilotService = inject(PACCopilotService)
  readonly #cdr = inject(ChangeDetectorRef)

  readonly organizationId = toSignal(this.#store.selectOrganizationId())
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly formGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    description: new FormControl(''),
    avatar: new FormControl(null),
    language: new FormControl(null),
    permission: new FormControl<KnowledgebasePermission>(null),
    // copilotId: new FormControl(null),
    // embeddingModelId: new FormControl(null),

    parserConfig: new FormGroup({
      embeddingBatchSize: new FormControl(null),
      chunkSize: new FormControl(null),
      chunkOverlap: new FormControl(null)
    }),

    similarityThreshold: new FormControl(null),

    copilotModel: new FormControl(null),
    copilotModelId: new FormControl(null),

    rerankModel: new FormControl(null),
    rerankModelId: new FormControl(null),
  })

  readonly loading = signal(false)

  private avatarSub = this.formGroup.get('avatar').valueChanges.subscribe(() => {
    this.#cdr.detectChanges()
  })

  constructor() {
    super()

    effect(
      () => {
        const knowledgebase = this.knowledgebase()
        if (knowledgebase && this.formGroup.pristine) {
          this.formGroup.patchValue(knowledgebase)
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.loading()) {
          this.formGroup.disable()
        } else {
          this.formGroup.enable()
        }
      },
      { allowSignalWrites: true }
    )
  }

  save() {
    this.loading.set(true)
    this.knowledgebaseService
      .update(this.knowledgebase().id, {
        ...this.formGroup.value,
      } as Partial<IKnowledgebase>)
      .subscribe({
        next: () => {
          this.formGroup.markAsPristine()
          this.loading.set(false)
          this._toastrService.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
          this.knowledgebaseComponent.refresh()
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }

  cancel() {
    this.#router.navigate(['../..'], { relativeTo: this.#route })
  }
}
