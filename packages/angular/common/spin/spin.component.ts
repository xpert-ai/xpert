
import { Component } from '@angular/core'
import { NgmDensityDirective } from '@xpert-ai/ocap-angular/core'

@Component({
  standalone: true,
  imports: [],
  selector: 'ngm-spin',
  templateUrl: 'spin.component.html',
  styleUrls: ['spin.component.scss'],
  hostDirectives: [
    {
        directive: NgmDensityDirective,
        inputs: [ 'small', 'large' ]
    }
  ]
})
export class NgmSpinComponent {
    
}