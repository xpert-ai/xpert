import { Directive, HostBinding, Input, OnChanges, SimpleChanges } from '@angular/core'

@Directive({
  selector: '[semanticColor]',
  standalone: false
})
export class SemanticColorDirective implements OnChanges {
  @Input() semanticColor: number

  @HostBinding('class.semantic-color_negative')
  isNegative = false
  @HostBinding('class.semantic-color_positive')
  isPositive = false
  constructor() {}

  ngOnChanges({ semanticColor }: SimpleChanges): void {
    if (semanticColor) {
      this.isPositive = semanticColor.currentValue > 0
      this.isNegative = semanticColor.currentValue < 0
    }
  }
}
