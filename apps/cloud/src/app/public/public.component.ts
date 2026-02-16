import { Component } from '@angular/core'
import { routeAnimations } from '../@core'

@Component({
  standalone: false,
  selector: 'metad-ocap-public',
  templateUrl: 'public.component.html',
  styles: [
    `
      :host {
        display: flex;
        flex: 1;
        height: 100%;
        overflow: auto;
      }
    `
  ],
  animations: [routeAnimations]
})
export class PublicComponent {}
