
import { Component } from '@angular/core'

@Component({
  standalone: true,
  imports: [],
  selector: 'pac-dirty-badge',
  template: `<span class="ping-badge pointer-events-none flex h-2 w-2">
  <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"></span>
  <span class="relative inline-flex rounded-full h-2 w-2"></span>
</span>`,
  styleUrl: 'dirty-badge.component.scss'
})
export class DirtyBadgeComponent {}
