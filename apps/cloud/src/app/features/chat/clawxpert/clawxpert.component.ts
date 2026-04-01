import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { RouterModule } from '@angular/router'
import { ClawXpertFacade } from './clawxpert.facade'

@Component({
  standalone: true,
  selector: 'pac-clawxpert',
  providers: [ClawXpertFacade],
  imports: [CommonModule, RouterModule],
  template: `
    <div class="h-full overflow-hidden p-4">
      <router-outlet />
    </div>
  `
})
export class ClawXpertComponent {}
