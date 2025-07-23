import { CdkDrag, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatSelectModule } from '@angular/material/select'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { injectToastr } from '@cloud/app/@core'
import { TMessageContentVirtualCube } from '@metad/contracts'
import { NgmCommonModule, ResizerModule } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, myRxResource, NgmDSCoreService, NgmI18nPipe, OcapCoreModule } from '@metad/ocap-angular/core'
import { EntityCapacity, NgmCalculatedMeasureComponent, NgmEntitySchemaComponent } from '@metad/ocap-angular/entity'
import {
  AggregationRole,
  C_MEASURES,
  CalculatedMember,
  CubeUsage,
  isEntitySet,
  Syntax,
  VirtualCube,
  VirtualCubeDimension
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { ModelDraftBaseComponent } from '../draft-base'
import { ModelStudioService } from '../model.service'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ModelChecklistComponent } from '../checklist/checklist.component'


@Component({
  standalone: true,
  selector: 'xp-model-virtual-cube',
  templateUrl: 'virtual-cube.component.html',
  styleUrls: ['virtual-cube.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    MatTooltipModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatFormFieldModule,
    MatExpansionModule,
    MatListModule,
    MatSlideToggleModule,
    MatInputModule,
    TranslateModule,
    OcapCoreModule,
    NgmEntitySchemaComponent,
    ResizerModule,
    NgmCommonModule,
    NgmCalculatedMeasureComponent,
    ModelChecklistComponent
  ],
  providers: [NgmDSCoreService, ModelStudioService]
})
export class ModelVirtualCubeComponent extends ModelDraftBaseComponent {
  Syntax = Syntax
  EntityCapacity = EntityCapacity

  // private dsCoreService = inject(NgmDSCoreService)
  readonly #logger = inject(NGXLogger)
  readonly #toastr = injectToastr()

  // Inputs
  readonly data = input<TMessageContentVirtualCube>()

  // States
  readonly #modelId = computed(() => this.data()?.data?.modelId)
  readonly #cubeName = computed(() => this.data()?.data?.cubeName)

  readonly virtualCube = linkedModel({
    initialValue: null,
    compute: () => {
      const cubeName = this.#cubeName()
      return this.draft()?.schema?.virtualCubes?.find((vc) => vc.name === cubeName)
    },
    update: (virtualCube) => {
      this.draft.update((draft) => {
        const virtualCubes = draft.schema?.virtualCubes ? [...draft.schema.virtualCubes] : []
        const index = virtualCubes.findIndex((vc) => vc.__id__ === virtualCube.__id__)
        if (index > -1) {
          virtualCubes[index] = virtualCube
        } else {
          virtualCubes.push(virtualCube)
        }

        return { ...draft, schema: { ...draft.schema, virtualCubes } }
      })
    }
  })

  readonly cubeUsages = attrModel(this.virtualCube, 'cubeUsages')
  readonly dimensions = attrModel(this.virtualCube, 'virtualCubeDimensions')
  readonly measures = attrModel(this.virtualCube, 'virtualCubeMeasures')
  readonly calculatedMembers = attrModel(this.virtualCube, 'calculatedMembers')
  readonly virtualCubeName = attrModel(this.virtualCube, 'name')
  readonly caption = attrModel(this.virtualCube, 'caption')
  readonly description = attrModel(this.virtualCube, 'description')

  selectedCube: string
  calcMemberFormGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    caption: new FormControl(),
    dimension: new FormControl(C_MEASURES, [Validators.required]),
    formula: new FormControl('', [Validators.required]),
    unit: new FormControl()
  })

  get name() {
    return this.calcMemberFormGroup.get('name').value
  }
  get formula() {
    return this.calcMemberFormGroup.get('formula') as FormControl
  }
  public _formula = ''

  // readonly dataSource = this.semanticModelKey
  // readonly dataSettings$ = computed(() => ({
  //   dataSource: this.dataSource(),
  //   entitySet: this.virtualCubeName()
  // }))

  // readonly #entityType = derivedAsync(() => {
  //   const request = this.dataSettings$()
  //   return this.dsCoreService.selectEntitySetOrFail(request.dataSource, request.entitySet).pipe(
  //       map((entitySet) => {
  //         if (isEntitySet(entitySet)) {
  //           return {...entitySet, error: null}
  //         }
  //         return {error: entitySet, entityType: null}
  //       }),
  //     )
  // })
 
  // readonly entityType = computed(() => this.#entityType()?.entityType)
  // readonly error = computed(() => this.#entityType()?.error)

  readonly showCalculatedMember = signal(false)
  readonly showFormula = signal(false)

  // Editing Virtual Cube
  readonly _virtualCube = model<VirtualCube>()
  readonly _virtualCubeName = attrModel(this._virtualCube, 'name')
  readonly _caption = attrModel(this._virtualCube, 'caption')
  readonly _description = attrModel(this._virtualCube, 'description')
  
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

  trackByName(index: number, item: CubeUsage) {
    return item.cubeName
  }

  editVirtualCube(cube: VirtualCube) {
    this._virtualCube.set({ ...cube })
  }

  applyVirtualCube() {
    this.virtualCube.update((vc) => {
      return {
        ...vc,
        name: this.virtualCubeName(),
        caption: this.caption(),
        description: this.description(),
      }
    })
  }

  cancelVirtualCube() {
    this._virtualCube.set(null)
  }

  cubeRemovePredicate(item: CdkDrag<any>) {
    return item.data?.type === 'Entity'
  }

  changeIgnoreUnrelatedDimensions(event: MatSlideToggleChange, cube: CubeUsage) {
    this.virtualCube.update((vc) => {
      const updatedCubeUsages = vc.cubeUsages?.map((cu) => {
        if (cu.cubeName === cube.cubeName) {
          return { ...cu, ignoreUnrelatedDimensions: event.checked }
        }
        return cu
      })
      return { ...vc, cubeUsages: updatedCubeUsages }
    })
  }

  removeCube(name: string) {
    this.virtualCube.update((vc) => {
      const updatedCubeUsages = vc.cubeUsages?.filter((cu) => cu.cubeName !== name)
      return { ...vc, cubeUsages: updatedCubeUsages }
    })
  }

  dropDimensionPredicate(item: CdkDrag<any>) {
    return item.data?.role === AggregationRole.dimension
  }

  dropDimension(event: CdkDragDrop<VirtualCubeDimension[]>) {
    if (event.container === event.previousContainer) {
      this.virtualCube.update((vc) => {
        const updatedDimensions = [...vc.virtualCubeDimensions]
        moveItemInArray(updatedDimensions, event.previousIndex, event.currentIndex)
        return { ...vc, virtualCubeDimensions: updatedDimensions }
      })
    } else if (event.item.data.role === AggregationRole.dimension) {
      const dimension = event.item.data as any
      this.virtualCube.update((vc) => {
        const virtualCubeDimensions = [...(vc.virtualCubeDimensions || [])]
        const dimensionName = (dimension as any).dimensionName
        if (virtualCubeDimensions.find((item) => item.name === dimensionName)) {
          this.#toastr.warning('PAC.MODEL.VirtualCube.DimensionAlreadyExists', {
            Default: 'Dimension already exists!'
          })
        } else {
          virtualCubeDimensions.splice(event.currentIndex, 0, {
            name: dimensionName,
            label: dimension.caption,
            caption: dimension.caption,
            cubeName: dimension.entity
          })
        }
        return { ...vc, virtualCubeDimensions }
      })
    }
  }

  changeDimensionShared(event: MatSlideToggleChange, name: string) {
    this.virtualCube.update((vc) => {
      const updatedDimensions = vc.virtualCubeDimensions?.map((dim) => {
        if (dim.name === name) {
          return { ...dim, __shared__: event.checked }
        }
        return dim
      })
      return { ...vc, virtualCubeDimensions: updatedDimensions }
    })
  }

  removeDimension(name: string) {
    this.virtualCube.update((vc) => {
      const updatedDimensions = vc.virtualCubeDimensions?.filter((dim) => dim.name !== name)
      return { ...vc, virtualCubeDimensions: updatedDimensions }
    })
  }

  dropMeasurePredicate(item: CdkDrag<any>) {
    return item.data?.role === AggregationRole.measure
  }

  dropMeasure(event: CdkDragDrop<{ name: string }[]>) {
    if (event.container === event.previousContainer) {
      this.virtualCube.update((vc) => {
        const updatedMeasures = [...vc.virtualCubeMeasures]
        moveItemInArray(updatedMeasures, event.previousIndex, event.currentIndex)
        return { ...vc, virtualCubeMeasures: updatedMeasures }
      })
    } else if (event.item.data.role === AggregationRole.measure) {
      this.virtualCube.update((vc) => {
        const virtualCubeMeasures = [...(vc.virtualCubeMeasures || [])]
        const measureName = event.item.data.uniqueName
        if (virtualCubeMeasures.find((item) => item.name === measureName)) {
          this.#toastr.warning('PAC.MODEL.VirtualCube.MeasureAlreadyExists', {
            Default: 'Measure already exists!'
          })
        } else {
          virtualCubeMeasures.splice(event.currentIndex, 0, {
            name: measureName,
            caption: event.item.data.caption,
            cubeName: event.item.data.entity,
            visible: true
          })
        }
        return { ...vc, virtualCubeMeasures }
      })
    }
  }

  removeMeasure(name: string) {
    this.virtualCube.update((vc) => {
      const updatedMeasures = vc.virtualCubeMeasures?.filter((measure) => measure.name !== name)
      return { ...vc, virtualCubeMeasures: updatedMeasures }
    })
  }

  createCalculatedMember() {
    this.showCalculatedMember.set(true)
    this.calcMemberFormGroup.reset({ dimension: C_MEASURES })
  }

  editCalculatedMember(member: CalculatedMember) {
    this.showCalculatedMember.set(true)
    this.calcMemberFormGroup.setValue(member as any)
  }

  applyCalculatedMember() {
    const member = this.calcMemberFormGroup.value as CalculatedMember
    this.virtualCube.update((vc) => {
      const calculatedMembers = [...(vc.calculatedMembers || [])]
      let index = calculatedMembers.findIndex((item) => item.name === member.name)
      if (index === -1) {
        index = calculatedMembers.length
      }
      calculatedMembers[index] = {
        ...member
      }

      return { ...vc, calculatedMembers }
    })
    this.showCalculatedMember.set(null)
  }

  removeCalculatedMember(name: string) {
    this.virtualCube.update((vc) => {
      const updatedCalculatedMembers = vc.calculatedMembers?.filter((cm) => cm.name !== name)
      return { ...vc, calculatedMembers: updatedCalculatedMembers }
    })
    this.calcMemberFormGroup.reset()
  }

  cancelCalculatedMember() {
    this.showCalculatedMember.set(null)
  }

  toggleFormula() {
    this.showFormula.update((state) => !state)
  }

  onApplyFormula() {
    this.formula.setValue(this._formula)
  }

  testVirtualCube() {
    //
  }

  // openNeedSaveMessage() {
  //   this.#snackBar.openFromComponent(NgmNotificationComponent, {
  //     data: {
  //       color: 'primary',
  //       message: this.#translate.instant('PAC.MODEL.VirtualCube.PleaseSave', { Default: 'Please Save' }),
  //       description: this.#translate.instant('PAC.MODEL.VirtualCube.PleaseSaveTheCorrectVirtualCube', {
  //         Default: 'Please save the correct virtual cube configuration before editing the formula.'
  //       })
  //     },
  //     duration: 5 * 1000,
  //     horizontalPosition: 'end',
  //     verticalPosition: 'bottom'
  //   })
  // }
}
