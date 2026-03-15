import { CommonModule, getCurrencySymbol } from '@angular/common';
import { Component, LOCALE_ID, booleanAttribute, computed, inject, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmShortNumberPipe } from '@metad/ocap-angular/core'
import { isNumber } from '@metad/ocap-core'

/**
 * https://experience.sap.com/fiori-design-web/object-display-elements/
 *
 * ## Semantic Colors:
 * https://experience.sap.com/fiori-design-web/how-to-use-semantic-colors/
 * * Regular (neutral) -> basic
 * * Good (positive) -> success
 * * Warning (critical) -> warning
 * * Bad (error) -> danger
 * * Information (highlight) -> primary | info
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgmShortNumberPipe],
  selector: 'ngm-object-number',
  templateUrl: './object-number.component.html',
  styleUrls: ['./object-number.component.scss']
})
export class NgmObjectNumberComponent {
  isNumber = isNumber
  private _defaultLocale = inject(LOCALE_ID)

  readonly number = input<number>()
  readonly unit = input<string>()
  readonly unitSemantics = input<'currency-code' | 'unit-of-measure'>()
  readonly shortNumber = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly digitsInfo = input<string>('1.0-5')
  readonly locale = input<string>()
  readonly _locale = computed(() => this.locale() || this._defaultLocale)
  readonly nanPlaceholder = input<string>()

  // text: string
  getCurrencySymbol = getCurrencySymbol

  readonly _number = computed(() => {
    if (isNumber(this.number())) {
      return this.unit() === '%' ? this.number() * 100 : this.number()
    }
    return null
  })
}
