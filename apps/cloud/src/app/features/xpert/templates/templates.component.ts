
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, RouterModule],
  selector: 'xpert-templates',
  templateUrl: './templates.component.html',
  styleUrl: 'templates.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpertTemplatesComponent {}
