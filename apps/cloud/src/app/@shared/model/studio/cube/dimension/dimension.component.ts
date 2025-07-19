import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  model,
  output
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, FormGroup, FormsModule } from '@angular/forms'
import { injectHelpWebsite } from '@cloud/app/@core'
import { I18nService } from '@cloud/app/@shared/i18n'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/formly'
import { DensityDirective } from '@metad/ocap-angular/core'
import { DimensionType, nonBlank, PropertyDimension } from '@metad/ocap-core'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { filter, map, switchMap } from 'rxjs/operators'
import { CubeStudioComponent } from '../../studio.component'
import { ModelStudioService } from '../../studio.service'
import { SemanticsAccordionWrapper } from '../../types'
import { isEqual } from 'lodash-es'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-dimension-settings',
  templateUrl: 'dimension.component.html',
  styleUrls: ['dimension.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, DensityDirective],
  host: {
    class: 'xp-cube-studio-dimension-settings'
  }
})
export class CubeStudioDimensionSettingsComponent {
  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly elementRef = inject(ElementRef)
  readonly i18n = inject(I18nService)
  readonly helpWebsite = injectHelpWebsite()

  // Inputs
  readonly dimension = model<PropertyDimension>()

  // Outputs
  readonly close = output<void>()

  readonly formGroup = new FormGroup({})
  readonly fields = computed(() => this.getFields(this.otherDimensionNames()))
  readonly options = {}

  // States
  readonly SCHEMA = toSignal(this.i18n.stream('PAC.MODEL.SCHEMA'))
  readonly HIERARCHY = computed(() => this.SCHEMA()?.HIERARCHY ?? {})

  readonly cube = this.studio.cube

  readonly otherDimensionNames = computed(
    () => this.cube()?.dimensions?.filter((dimension) => dimension.__id__ !== this.dimension()?.__id__).map(({name}) => ({name})) ?? []
    , { equal: isEqual })
  /**
   * Original Fact table fields
   */
  readonly factFields$ = toObservable(this.studio.factName).pipe(
    filter(nonBlank),
    switchMap((table) => this.studioService.selectOriginalEntityProperties(table)),
    map((properties) => [
      {
        value: null,
        key: null,
        caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
      },
      ...properties.map((property) => ({
        value: property.name,
        key: property.name,
        caption: property.caption
      }))
    ])
  )

  readonly hierarchies$ = toObservable(this.dimension).pipe(map((dimension) => dimension?.hierarchies ?? []))

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    const element = this.elementRef.nativeElement as HTMLElement
    if (document.activeElement && element.contains(document.activeElement)) {
      this.close.emit()
    }
  }

  getTranslation(key: string, interpolateParams?: any) {
    return this.i18n.instant(key, interpolateParams)
  }

  getFields(dimensions: {name: string}[]) {
    const COMMON = this.SCHEMA().COMMON
    const DIMENSION = this.SCHEMA().DIMENSION
    const className = FORMLY_W_1_2
    return [
      {
        wrappers: ['panel'],
        props: {
          label: DIMENSION?.Modeling ?? 'Modeling',
          padding: true
        },
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            key: 'name',
            type: 'input',
            className,
            props: {
              label: DIMENSION?.Name ?? 'Name',
              required: true
            },
            validators: {
              name: {
                expression: (c: AbstractControl) => !(!c.value || dimensions.find((item) => item.name === c.value)),
                message: (error: any, field: FormlyFieldConfig) =>
                  field.formControl.value
                    ? this.getTranslation('PAC.Messages.AlreadyExists', {
                        Default: `Name already exists`,
                        value: this.getTranslation('PAC.KEY_WORDS.Name', { Default: 'Name' })
                      })
                    : this.getTranslation('PAC.Messages.IsRequired', {
                        Default: `Name is required`,
                        value: this.getTranslation('PAC.KEY_WORDS.Name', { Default: 'Name' })
                      })
              }
            }
          },
          {
            key: 'caption',
            type: 'input',
            className,
            props: {
              label: COMMON?.Caption ?? 'Caption'
            }
          },
          {
            className: FORMLY_W_FULL,
            key: 'description',
            type: 'textarea',
            props: {
              label: COMMON?.Description ?? 'Description',
              autosizeMinRows: 2,
              autosize: true
            }
          },
          {
            className: FORMLY_W_1_2,
            key: 'visible',
            type: 'checkbox',
            defaultValue: true,
            props: {
              label: COMMON?.Visible ?? 'Visible'
            }
          },
          {
            // This property needs to be set only for inline dimensions with independent dimension tables.
            key: 'foreignKey',
            type: 'ngm-select',
            className,
            props: {
              label: DIMENSION?.ForeignKey ?? 'Foreign Key',
              valueKey: 'key',
              options: this.factFields$,
              // required: isCube,
              searchable: true,
              info:
                DIMENSION?.ForeignKey_Info ??
                'Inline dimension with independent tables need to specify the foreign key of this fact table here.'
            }
          },
          {
            key: 'type',
            type: 'select',
            className,
            props: {
              label: DIMENSION?.DimensionType ?? 'Dimension Type',
              options: [
                {
                  value: null,
                  label: COMMON?.None ?? 'None'
                },
                {
                  value: DimensionType.StandardDimension,
                  label: 'Regular'
                },
                {
                  value: DimensionType.TimeDimension,
                  label: 'Time'
                }
                // Not figured out how to use
                // {
                //   value: DimensionType.MeasuresDimension,
                //   label: 'Measures'
                // }
                // Mondrian 不支持其他维度类型, 需要用 Semantic 属性来实现
                // {
                //   value: 'GeographyDimension',
                //   label: 'Geography',
                // }
              ]
            }
          },
          // Default Hierarchy: use source name
          {
            className,
            key: 'defaultHierarchy',
            type: 'select',
            props: {
              label: DIMENSION?.DefaultHierarchy ?? 'Default Hierarchy',
              options: this.hierarchies$.pipe(
                map((hierarchies) => {
                  const options =
                    hierarchies?.map((hierarchy) => ({
                      key: hierarchy.name || '',
                      value: hierarchy.name || '',
                      caption: hierarchy.caption
                    })) ?? []

                  options.unshift({
                    key: null,
                    value: null,
                    caption: COMMON?.None ?? 'None'
                  })
                  return options
                })
              )
            }
          }
        ]
      },
      // Dimension 应该没有 KeyExpression
      // KeyExpression(COMMON),
      ...SemanticsAccordionWrapper(COMMON, this.helpWebsite() + '/docs/models/dimension-designer/semantics/')
    ]
  }
}
