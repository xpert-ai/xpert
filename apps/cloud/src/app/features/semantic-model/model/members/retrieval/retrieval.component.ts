import { DIALOG_DATA } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { injectToastr, SemanticModelMemberService } from '@cloud/app/@core'
import { getErrorMessage, ISemanticModelEntity } from '@cloud/app/@core/types'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { Cube, EntityType, getEntityDimensions, Property } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { Document } from '@langchain/core/documents'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, DragDropModule, MatTooltipModule, NgmSelectComponent],
  selector: 'pac-model-members-retrieval',
  templateUrl: 'retrieval.component.html',
  styleUrl: 'retrieval.component.scss'
})
export class ModelMembersRetrievalTestingComponent {
  readonly memberAPI = inject(SemanticModelMemberService)
  readonly #toastr = injectToastr()

  readonly #data = inject<{
    modelId: string
    cube: Cube & {
      entityType?: EntityType
      __entity__: ISemanticModelEntity
    }
  }>(DIALOG_DATA)

  readonly cube = signal(this.#data.cube)

  readonly dimensions = computed<Array<Property & { expand?: boolean }>>(() =>
    this.cube() ? getEntityDimensions(this.cube().entityType) : []
  )

  readonly dimensionsOptions = computed(() =>
    this.dimensions().map((dimension) => ({
      value: dimension.name,
      label: dimension.caption || dimension.name,
      description: dimension.description
    }))
  )

  readonly hierachyOptions = computed(() => {
    const dimension = this.dimensions()?.find((d) => d.name === this.dimension())
    if (!dimension) {
      return []
    }
    return dimension.hierarchies?.map((hierarchy) => ({
      value: hierarchy.name,
      label: hierarchy.caption || hierarchy.name,
      description: hierarchy.description
    }))
  })

  readonly levelOptions = computed(() => {
    const dimension = this.dimensions()?.find((d) => d.name === this.dimension())
    if (!dimension) {
      return []
    }
    const hierarchy = dimension.hierarchies?.find((h) => h.name === this.hierarchy())
    if (!hierarchy) {
      return []
    }
    return hierarchy.levels?.map((level) => ({
      value: level.name,
      label: level.caption || level.name,
      description: level.description
    }))
  })

  // Models
  readonly dimension = model<string>(null)
  readonly hierarchy = model<string>(null)
  readonly level = model<string>(null)
  readonly queryText = model<string>('')
  readonly members = signal<[Document<{
    dimension: string
    hierarchy: string
    id: string
    key: string
    level: string
    member: string
  }>, number][]>([])

  readonly retrieving = signal(false)

  // constructor() {
  //   effect(() => {
  //     console.log('Cube:', this.cube(), this.dimensions())
  //   })
  // }

  test() {
    this.retrieving.set(true)
    this.memberAPI
      .retrieve({
        modelId: this.#data.modelId,
        cube: this.cube()?.name,
        dimension: this.dimension(),
        hierarchy: this.hierarchy(),
        level: this.level(),
        query: this.queryText(),
        k: 10
      })
      .subscribe({
        next: (members) => {
          this.retrieving.set(false)
          this.members.set(members)
        },
        error: (error) => {
          this.retrieving.set(false)
          this.#toastr.error(getErrorMessage(error),)
        }
      })
  }
}
