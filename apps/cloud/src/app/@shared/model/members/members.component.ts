import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewContainerRef
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TMessageContentMembers } from '@metad/cloud/state'
import { OverlayAnimation1 } from '@metad/core'
import { attrModel, linkedModel, NgmDSCoreService } from '@metad/ocap-angular/core'
import { NgmCalculationEditorComponent } from '@metad/ocap-angular/entity'
import { CalculationProperty, DeepPartial, isCalculationProperty, isParameterProperty, ParameterProperty, Syntax } from '@metad/ocap-core'
import { getSemanticModelKey } from '@metad/story/core'
import { TranslateModule } from '@ngx-translate/core'
import { ModelDraftBaseComponent } from '../draft-base'
import { ModelStudioService } from '../model.service'
import { ModelMemberEditComponent } from './edit/edit.component'
import { NgmParameterCreateComponent } from '@metad/ocap-angular/parameter'
import { MatDialog } from '@angular/material/dialog'

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
  animations: [OverlayAnimation1],
  providers: [NgmDSCoreService, ModelStudioService]
})
export class ModelMembersComponent extends ModelDraftBaseComponent {
  eSyntax = Syntax

  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)


  // Inputs
  readonly data = input<TMessageContentMembers>()

  // States
  readonly members = computed(() => this.data()?.data?.members || [])

  readonly #modelId = computed(() => this.data()?.data?.modelId)
  readonly #cubeName = computed(() => this.data()?.data?.cubeName)

  readonly memberKey = signal<string>(null)

  readonly modelKey = computed(() => (this.semanticModel() ? getSemanticModelKey(this.semanticModel()) : null))

  readonly cube = linkedModel({
    initialValue: null,
    compute: () => this.draft()?.schema?.cubes?.find((cube) => cube.name === this.cubeName()),
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
          return { ...draft, schema: { ...draft.schema, cubes } }
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

  readonly calculations = attrModel(this.cube, 'calculations')

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

    effect(() => {
      console.log(this.members())
    })
  }

  onMemberClick(member: TMessageContentMembers['data']['members'][number]) {
    if (isCalculationProperty(member)) {
      this.openCalculation(member)
    } else if (isParameterProperty(member)) {
      this.onEditParameter(member)
    } else {
      this.memberKey.set(member.__id__)
    }
  }

  openCalculation(calculation: CalculationProperty) {
    this.#dialog
      .open<CalculationProperty>(NgmCalculationEditorComponent, {
        viewContainerRef: this.#vcr,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          dataSettings: this.dataSettings(),
          entityType: this.entityType(),
          syntax: Syntax.MDX,
          value: calculation
        }
      })
      .closed.subscribe({
        next: (calculated) => {
          if (calculated) {
            this.calculations.update((state) => {
              const calculations = [...state]
              const index = calculations.findIndex((c) => c.__id__ === calculated.__id__)
              if (index > -1) {
                calculations[index] = { ...calculated }
              } else {
                calculations.push({ ...calculated })
              }
              return calculations
            })
          }
        }
      })
  }
  // Parameter methods
  onEditParameter(member?: Partial<ParameterProperty>) {
    this.#dialog
      .open(NgmParameterCreateComponent, {
        viewContainerRef: this.#vcr,
        data: {
          dataSettings: this.dataSettings(),
          entityType: this.entityType(),
          name: member?.name
        }
      })
      .closed.subscribe((result: DeepPartial<ParameterProperty>) => {
        console.log(result)
      })
  }
}
