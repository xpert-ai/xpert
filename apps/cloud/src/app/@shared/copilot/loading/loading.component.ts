import { ChangeDetectionStrategy, Component } from '@angular/core'

@Component({
  standalone: true,
  imports: [],
  selector: 'xp-chat-loading',
  templateUrl: 'loading.component.html',
  styleUrl: 'loading.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatLoadingComponent {}
