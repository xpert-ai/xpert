import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectToastr, TMessageContentCube } from '@cloud/app/@core'
import { SemanticModelServerService } from '@metad/cloud/state'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ModelDraftBaseComponent } from '../draft-base'
import { ModelStudioService } from '../model.service'
import { CubeStudioComponent } from '../studio/studio.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ModelChecklistComponent } from '../checklist/checklist.component'
import { NgmSpinComponent } from '@metad/ocap-angular/common'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-model-cube',
  templateUrl: 'cube.component.html',
  styleUrls: ['cube.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, CdkMenuModule, MatTooltipModule, NgmSpinComponent, ModelChecklistComponent, CubeStudioComponent],
  host: {
    class: 'xp-model-cube'
  },
  providers: [NgmDSCoreService, ModelStudioService]
})
export class ModelCubeComponent extends ModelDraftBaseComponent {
  readonly modelAPI = inject(SemanticModelServerService)
  readonly studioService = inject(ModelStudioService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly data = input<TMessageContentCube>()

  // States
  readonly #modelId = computed(() => this.data()?.data?.modelId)
  readonly #cubeName = computed(() => this.data()?.data?.cubeName)

  readonly cube = computed(() => this.draft()?.schema?.cubes?.find((cube) => cube.name === this.cubeName()))

  constructor() {
    super()

    effect(
      () => {
        if (this.#modelId()) {
          this.modelId.set(this.#modelId())
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.#cubeName()) {
          this.cubeName.set(this.#cubeName())
        }
      },
      { allowSignalWrites: true }
    )
  }
}
