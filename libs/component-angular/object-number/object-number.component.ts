import { CommonModule, getCurrencySymbol } from '@angular/common'
import { Component, Input, LOCALE_ID, OnChanges, SimpleChanges, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

/**
 * @deprecated
 * 
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  selector: 'ngm-object-number',
  templateUrl: './object-number.component.html',
  styleUrls: ['./object-number.component.scss']
})
export class NxObjectNumberComponent implements OnChanges {

  private _defaultLocale = inject(LOCALE_ID)

  @Input() number: number
  @Input() unit: string
  @Input() unitSemantics: 'currency-code' | 'unit-of-measure'
  @Input() shortNumber: boolean
  @Input() digitsInfo = '1.0-5'
  @Input() get locale(): string {
    return this._locale || this._defaultLocale
  }
  set locale(value) {
    this._locale = value
  }
  private _locale: string

  _number: number
  shortNumberValues: [number, string] | null = null
  text: string
  getCurrencySymbol = getCurrencySymbol

  ngOnChanges({ number, unit }: SimpleChanges): void {
    if (number) {
      this._number = this.number
    }
    if (number?.currentValue || unit?.currentValue) {
      if (this.unit === '%' && this.number !== null && this.number !== undefined) {
        this._number = this.number * 100
      }
    }

    this.shortNumberValues = this.formatShortNumber(this._number)
  }

  private formatShortNumber(value: number): [number, string] | null {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null
    }

    const abs = Math.abs(value)
    const units: Array<{ base: number; unit: string }> = [
      { base: 1e15, unit: 'Q' },
      { base: 1e12, unit: 'T' },
      { base: 1e9, unit: 'B' },
      { base: 1e6, unit: 'M' },
      { base: 1e3, unit: 'K' }
    ]

    for (const { base, unit } of units) {
      if (abs >= base) {
        return [value / base, unit]
      }
    }

    return [value, '']
  }
}
