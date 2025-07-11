import { Component, inject } from '@angular/core'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { map } from 'rxjs/operators'
import { ModelComponent } from '../model.component'
import { SemanticModelService } from '../model.service'
import { CommonModule } from '@angular/common'
import { MatButtonModule } from '@angular/material/button'
import { NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { UserPipe } from '@cloud/app/@shared/pipes'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    MatButtonModule,
    NgmTableComponent,
    UserPipe
  ],
  selector: 'pac-model-overview',
  templateUrl: 'overview.component.html',
  styleUrls: ['overview.component.scss']
})
export class ModelOverviewComponent {
  private readonly modelState = inject(SemanticModelService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  readonly #model = inject(ModelComponent)

  conversations = []
  asking = false
  text = ''

  public readonly dimensions$ = this.modelState.dimensions$
  public readonly cubes$ = this.modelState.cubes$
  public readonly virtualCubes$ = this.modelState.virtualCubes$
  public readonly stories$ = this.modelState.stories$
  public readonly roles$ = this.modelState.roles$.pipe(map((roles) => (roles?.length ? roles : null)))
  public readonly indicators$ = this.modelState.indicators$

  readonly modelSideMenuOpened = this.#model.sideMenuOpened

  openSideMenu() {
    this.modelSideMenuOpened.set(true)
  }
}
