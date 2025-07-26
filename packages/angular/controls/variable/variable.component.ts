import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, forwardRef, inject, input, model } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { DataSettings, getMemberKey, IMember, isArray, ISlicer, VariableProperty } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSmartFilterService } from '../smart-filter.service'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-variable',
  templateUrl: 'variable.component.html',
  styleUrls: ['variable.component.scss'],
  host: {
    class: 'ngm-variable'
  },
  providers: [
    NgmSmartFilterService,
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmVariableComponent)
    }
  ],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    OcapCoreModule,
    NgmCommonModule
  ]
})
export class NgmVariableComponent implements ControlValueAccessor {
  private smartFilterService = inject(NgmSmartFilterService)

  readonly label = input<string>()

  readonly dataSettings = input<DataSettings>(null)
  readonly variable = input<VariableProperty>()

  readonly value = model<string>()

  private slicer: ISlicer = null

  private _onChange: any
  private onTouched: any
  readonly disabled = model<boolean>(false)

  readonly selectOptions = toSignal(this.smartFilterService.selectOptions$)

  readonly placeholder = computed(() => {
    const value = this.variable()?.value ?? this.variable()?.defaultLow
    if (isArray(value)) {
      return value.map((item) => getMemberKey(item)).join(', ')
    } else if (value) {
      return `${value}`
    }
    return null
  })

  private refreshSub = this.smartFilterService
    .onAfterServiceInit()
    .pipe(takeUntilDestroyed())
    .subscribe(() => {
      this.smartFilterService.refresh()
    })

  constructor() {
    effect(
      () => {
        this.smartFilterService.dataSettings = this.dataSettings()
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.variable()) {
          this.smartFilterService.options = {
            dimension: {
              dimension: this.variable().referenceDimension,
              hierarchy: this.variable().referenceHierarchy
            }
          }
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      const key = this.value()
      const variable = this.variable()
      // Empty values can be emitted only after initialization is complete, otherwise they can only be emitted if there is a value.
      if (variable && (this.slicer && !key || !!key)) {
        const member: IMember = {key}
        if (key) {
          member.caption = this.selectOptions()?.find((item) => item.key === key)?.caption
        }
        this._onChange?.(key
            ? {
                ...this.slicer,
                dimension: {
                  dimension: variable.referenceDimension,
                  hierarchy: variable.referenceHierarchy,
                  parameter: variable.name,
                },
                members: [member]
              }
            : null
        )
      }
    })
  }

  clear() {
    this.value.set(null)
  }

  writeValue(obj: any): void {
    if (obj) {
      this.value.set(obj.members[0]?.key)
      this.slicer = obj
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled.set(isDisabled)
  }
}
