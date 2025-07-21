import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TMessageContentMembers } from '@metad/cloud/state'
import { linkedModel, NgmDSCoreService } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { Syntax } from '@metad/ocap-core'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { OverlayAnimation1 } from '@metad/core'
import { getSemanticModelKey } from '@metad/story/core'
import { ModelDraftBaseComponent } from '../draft-base'
import { ModelMemberEditComponent } from './edit/edit.component'
import { ModelStudioService } from '../model.service'


@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-model-members',
  templateUrl: 'members.component.html',
  styleUrls: ['members.component.scss'],
  imports: [CommonModule, FormsModule, DragDropModule, MatTooltipModule, TranslateModule, ModelMemberEditComponent],
  host: {
    class: 'xp-model-members'
  },
  animations: [ OverlayAnimation1 ],
  providers: [NgmDSCoreService, ModelStudioService]
})
export class ModelMembersComponent extends ModelDraftBaseComponent {
  eSyntax = Syntax
  
  // Inputs
  readonly data = input<TMessageContentMembers>()

  // States
  readonly members = computed(() => this.data()?.data?.members || [])

  readonly #modelId = computed(() => this.data()?.data?.modelId)
  readonly #cubeName = computed(() => this.data()?.data?.cubeName)

  readonly memberKey = signal<string>(null)

  readonly modelKey = computed(() => this.semanticModel() ? getSemanticModelKey(this.semanticModel()) : null)

  readonly cube = linkedModel({
      initialValue: null,
      compute: () =>
        this.draft()?.schema?.cubes?.find((cube) => cube.name === this.cubeName())
      ,
      update: (cube) => {
        this.draft.update((draft) => {
          if (draft.schema && cube) {
            const cubes = draft.schema.cubes ? [...draft.schema.cubes] : []
            const index = cubes.findIndex((c) => c.__id__ === cube.__id__)
            if (index > -1) {
              cubes[index] = cube
            } else {
              cubes.push(cube)
            }
            return {...draft, schema: { ...draft.schema, cubes } }
          }
  
          return draft
        })
      }
    })

  readonly member = linkedModel({
    initialValue: null,
    compute: () => {
      const cube = this.cube()
      return cube?.calculatedMembers?.find((member) => member.__id__ === this.memberKey())
    },
    update: (member) => {
      this.cube.update((cube) => {
        const calculatedMembers = cube.calculatedMembers ? [...cube.calculatedMembers] : []
        const index = calculatedMembers.findIndex((m) => m.__id__ === member.__id__)
        if (index > -1) {
          calculatedMembers[index] = member
        } else {
          calculatedMembers.push(member)
        }
        return { ...cube, calculatedMembers }
      })
    }
  })

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

  onMemberClick(member) {
    this.memberKey.set(member.key)
  }
}
