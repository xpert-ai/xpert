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
import { FormGroup, FormsModule } from '@angular/forms'
import { injectHelpWebsite } from '@cloud/app/@core'
import { I18nService } from '@cloud/app/@shared/i18n'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/formly'
import { DensityDirective } from '@metad/ocap-angular/core'
import { Cube, nonBlank } from '@metad/ocap-core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { filter, map, switchMap } from 'rxjs/operators'
import { CubeStudioComponent } from '../../studio.component'
import { ModelStudioService } from '../../studio.service'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-cube-settings',
  templateUrl: 'settings.component.html',
  styleUrls: ['settings.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, DensityDirective],
  host: {
    class: 'xp-cube-studio-settings-settings'
  }
})
export class CubeStudioCubeSettingsComponent {
  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly elementRef = inject(ElementRef)
  readonly i18n = inject(I18nService)
  readonly helpWebsite = injectHelpWebsite()

  // Inputs
  readonly cube = model<Cube>()

  // Outputs
  readonly close = output<void>()

  readonly formGroup = new FormGroup({})
  readonly fields = computed(() => this.getFields())
  readonly options = {}

  // States
  readonly SCHEMA = toSignal(this.i18n.stream('PAC.MODEL.SCHEMA'))
  readonly HIERARCHY = computed(() => this.SCHEMA()?.HIERARCHY ?? {})

  // readonly cube = this.studio.cube

  readonly cube$ = toObservable(this.studio.cube)

  readonly measures$ = this.cube$.pipe(
    map((cube) => {
      const measures = [
        {
          key: null,
          caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
        }
      ]

      if (cube.measures) {
        measures.push(
          ...cube.measures.map((measure) => ({
            key: measure.name,
            caption: measure.caption
          }))
        )
      }

      return measures
    })
  )

  readonly tables$ = this.studioService.tablesSelectOptions$

  readonly tableOptions$ = this.tables$.pipe(
    map((tables) => tables?.map((_) => ({ value: _.key, label: _.caption || _.key })))
  )

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

  getFields() {
    const COMMON = this.SCHEMA().COMMON
    const CUBE = this.SCHEMA().CUBE
    const className = FORMLY_W_1_2
    return [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            key: 'name',
            type: 'input',
            className,
            props: {
              label: CUBE?.Name ?? 'Name'
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
              rows: 1,
              autosize: true
            }
          },
          {
            className,
            key: 'defaultMeasure',
            type: 'ngm-select',
            props: {
              label: CUBE?.DefaultMeasure ?? 'Default Measure',
              valueKey: 'key',
              options: this.measures$,
              searchable: true
              // required: true
            }
          },
          {
            className,
            key: 'visible',
            type: 'checkbox',
            defaultValue: true,
            props: {
              label: COMMON?.Visible ?? 'Visible'
            }
          },
          {
            className,
            key: 'enabled',
            type: 'checkbox',
            defaultValue: true,
            props: {
              label: COMMON?.Enabled ?? 'Enabled'
            }
          },
          {
            className,
            key: 'cache',
            type: 'checkbox',
            defaultValue: true,
            props: {
              label: COMMON?.Cache ?? 'Cache'
            }
          }
        ]
      },
      {
        key: 'fact',
        type: 'fact',
        props: {
          label: COMMON?.FactTable ?? 'Fact Table',
          valueKey: 'key',
          options$: this.tableOptions$
        },
        className: 'my-4'
      }
    ]
  }
}
