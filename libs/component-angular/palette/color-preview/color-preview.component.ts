
import { animate, query, stagger, style, transition, trigger } from '@angular/animations'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core'
import { NgmChromaticInterpolate, previewChromaticInterpolate } from '../types'

const listEnterAnimation = trigger('listEnterAnimation', [
  transition('* <=> *', [
    query(':enter', [style({ opacity: 0 }), stagger('20ms', animate('100ms ease-out', style({ opacity: 1 })))], {
      optional: true
    })
  ])
])

@Component({
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-chromatic-preview',
  templateUrl: 'color-preview.component.html',
  animations: [listEnterAnimation],
  styleUrls: ['./color-preview.component.scss']
})
export class NxChromaticPreviewComponent implements OnInit {
  private readonly _cdr = inject(ChangeDetectorRef)

  @Input() interpolate: NgmChromaticInterpolate

  colors = []

  async ngOnInit() {
    this.colors = await previewChromaticInterpolate(this.interpolate)
    this.interpolate.colors = this.colors
    this._cdr.detectChanges()
  }
}
