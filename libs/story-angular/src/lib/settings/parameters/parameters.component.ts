import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, ViewContainerRef, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog, MatDialogModule } from '@angular/material/dialog'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { NgmCommonModule, NgmConfirmDeleteComponent } from '@metad/ocap-angular/common'
import { ISelectOption, NgmDSCacheService } from '@metad/ocap-angular/core'
import { NgmParameterCreateComponent } from '@metad/ocap-angular/parameter'
import { CalculationProperty, EntityType, ParameterProperty, getEntityCalculations } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NxCoreService } from '@metad/core'
import { NxStoryService } from '@metad/story/core'
import { firstValueFrom } from 'rxjs'
import { Dialog } from '@angular/cdk/dialog'

/**
 * @deprecated
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatDividerModule,
    TranslateModule,
    NgmCommonModule
  ],
  selector: 'pac-story-parameters',
  templateUrl: 'parameters.component.html',
  styleUrls: ['parameters.component.scss']
})
export class ParametersComponent {
  public readonly dsCoreService = inject(NgmDSCacheService)
  readonly #dialog = inject(Dialog)

  entities: ISelectOption<string>[] = []
  activeLink: { dataSource: string; entity: string }
  entityType: EntityType
  parameters: ParameterProperty[]
  calculations: CalculationProperty[]

  private schemas$ = toSignal(this.storyService.schemas$, { initialValue: null })

  public entities$ = computed(() => {
    const schemas = this.schemas$()
    if (schemas) {
      const entities = []

      Object.keys(schemas).forEach((dataSource) => {
        Object.keys(schemas[dataSource]).forEach((entity) => {
          entities.push({
            dataSource,
            value: entity,
            label: schemas[dataSource][entity].caption
          })
        })
      })

      if (entities.length > 0) {
        this.activeEntity(entities[0].dataSource, entities[0].value)
      }
      return entities
    }

    return null
  })

  constructor(
    private storyService: NxStoryService,
    private coreService: NxCoreService,
    private readonly _dialog: MatDialog,
    private readonly _viewContainerRef: ViewContainerRef
  ) {}

  activeEntity(dataSource: string, entity: string) {
    this.activeLink = { dataSource, entity }
    this.entityType = this.schemas$()?.[dataSource]?.[entity]
    this.parameters = Object.values(this.entityType?.parameters ?? {})
    this.calculations = getEntityCalculations(this.entityType)
  }

  async openCreateParameter(name?: string) {
    const dataSettings = {
      dataSource: this.activeLink.dataSource,
      entitySet: this.activeLink.entity
    }
    const entityType = await firstValueFrom(this.storyService.selectEntityType(dataSettings))
    const result = await firstValueFrom(
      this.#dialog
        .open(NgmParameterCreateComponent, {
          viewContainerRef: this._viewContainerRef,
          data: {
            dataSettings: dataSettings,
            entityType: entityType,
            coreService: this.coreService,
            name: name
          }
        })
        .closed
    )

    if (result) {
      // 参数创建成功
      console.log(result)
    }
  }

  removeParameter(parameter: string) {
    this.storyService.removeEntityParameter({
      dataSource: this.activeLink.dataSource,
      entity: this.activeLink.entity,
      parameter
    })
  }

  async openCreateCalculation() {
    // const dataSettings = {
    //   dataSource: this.activeLink.dataSource,
    //   entitySet: this.activeLink.entity
    // }
    // const entityType = await firstValueFrom(this.storyService.selectEntityType(dataSettings))
    // const data = {
    //   dataSettings,
    //   entityType,
    //   syntax: Syntax.MDX,
    //   coreService: this.coreService,
    //   value: null
    // }

    // const property = await firstValueFrom(
    //   this._dialog
    //     .open<unknown, unknown, CalculationProperty>(CalculationEditorComponent, {
    //       viewContainerRef: this._viewContainerRef,
    //       data
    //     })
    //     .afterClosed()
    // )
    // if (property) {
    //   this.storyService.addCalculationMeasure({ dataSettings, calculation: property })
    // }
  }

  async openEditCalculation(calculationProperty: CalculationProperty) {
    // const dataSettings = {
    //   dataSource: this.activeLink.dataSource,
    //   entitySet: this.activeLink.entity
    // }
    // const entityType = await firstValueFrom(this.storyService.selectEntityType(dataSettings))
    // const property = await firstValueFrom(
    //   this._dialog
    //     .open<unknown, unknown, CalculationProperty>(CalculationEditorComponent, {
    //       viewContainerRef: this._viewContainerRef,
    //       data: {
    //         dataSettings: dataSettings,
    //         entityType: entityType,
    //         value: calculationProperty,
    //         syntax: Syntax.MDX,
    //         coreService: this.coreService
    //       }
    //     })
    //     .afterClosed()
    // )

    // if (property) {
    //   this.storyService.updateCalculationMeasure({ dataSettings, calculation: property })
    // }
  }

  async removeCalculation(calculationProperty: CalculationProperty) {
    const confirm = await firstValueFrom(
      this._dialog
        .open(NgmConfirmDeleteComponent, { data: { value: calculationProperty.caption || calculationProperty.name } })
        .afterClosed()
    )
    if (confirm) {
      this.storyService.removeCalculation({
        dataSettings: { dataSource: this.activeLink.dataSource, entitySet: this.activeLink.entity },
        name: calculationProperty.name
      })
    }
  }
}
