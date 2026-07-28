import { Component } from '@angular/core'
import { XpDensityDirective } from '../../core'

@Component({
  standalone: true,
  imports: [],
  selector: 'xp-spin',
  templateUrl: 'spin.component.html',
  styleUrls: ['spin.component.scss'],
  hostDirectives: [
    {
      directive: XpDensityDirective,
      inputs: ['small', 'large']
    }
  ]
})
export class XpSpinComponent {}
