import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-not-found',
  styleUrls: ['./not-found.component.scss'],
  templateUrl: './not-found.component.html',
  imports: [
    CommonModule,
    TranslateModule,
    ZardButtonComponent
  ]
})
export class NotFoundComponent {
  readonly #router = inject(Router)

  goToHome() {
    this.#router.navigate(['/home'])
  }
}
