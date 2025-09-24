import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService, XpertAPIService, XpertTypeEnum, IfAnimation } from '../../../../@core'
import { CopilotKnowledgesComponent } from '../../../../@shared/copilot'
import { XpertComponent } from '../xpert.component'

@Component({
  selector: 'xpert-copilot',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, FormsModule, CdkListboxModule, CopilotKnowledgesComponent],
  templateUrl: './copilot.component.html',
  styleUrl: './copilot.component.scss',
  animations: [IfAnimation]
})
export class XpertCopilotComponent {
  eXpertTypeEnum = XpertTypeEnum

  readonly xpertService = inject(XpertAPIService)
  readonly #toastr = inject(ToastrService)
  readonly xpertComponent = inject(XpertComponent)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)

  readonly xpert = this.xpertComponent.xpert

  retrievalTesting() {
    this.router.navigate(['testing'], { relativeTo: this.route })
  }
}
