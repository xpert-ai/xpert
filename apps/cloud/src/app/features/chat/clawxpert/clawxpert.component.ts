import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { RouterModule } from '@angular/router'

@Component({
  standalone: true,
  selector: 'pac-clawxpert',
  imports: [CommonModule, RouterModule],
  template: `
    <div class="h-full overflow-hidden">
      <router-outlet />
    </div>
  `
})
export class ClawXpertComponent {}
