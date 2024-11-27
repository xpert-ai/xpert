import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotKnowledgeComponent } from '../../../../../@shared'
import { XpertComponent } from '../../xpert.component'
import { IfAnimation } from 'apps/cloud/src/app/@core'

@Component({
  selector: 'xpert-copilot-knowledge-blank',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, CopilotKnowledgeComponent],
  templateUrl: './blank.component.html',
  styleUrl: './blank.component.scss',
})
export class XpertCopilotKnowledgeNewBlankComponent {
  readonly xpertComponent = inject(XpertComponent)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)

  readonly xpert = this.xpertComponent.xpert

  close() {
    this.router.navigate(['..'], { relativeTo: this.route })
  }
}
