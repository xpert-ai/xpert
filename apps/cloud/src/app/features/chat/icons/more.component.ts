import { ChangeDetectionStrategy, Component } from '@angular/core'

@Component({
  standalone: true,
  imports: [],
  selector: 'xp-chat-more-svg',
  template: `<svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    fill="none"
    viewBox="0 0 24 24"
    class="icon-md"
  >
    <path
      fill="currentColor"
      fill-rule="evenodd"
      d="M3 12a2 2 0 1 1 4 0 2 2 0 0 1-4 0m7 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0m7 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0"
      clip-rule="evenodd"
    ></path>
  </svg>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatMoreComponent {}
