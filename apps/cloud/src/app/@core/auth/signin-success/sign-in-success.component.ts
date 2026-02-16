import { Component } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { filter } from 'rxjs/operators'
import { Store } from '../../services/store.service'

@Component({
  standalone: false,
  selector: 'pac-sign-in-success',
  templateUrl: './sign-in-success.component.html'
})
export class SignInSuccessComponent {
  constructor(
    private readonly _store: Store,
    private readonly _route: ActivatedRoute,
    private readonly _router: Router
  ) {
    this._route.queryParams.pipe(filter((params) => params.jwt)).subscribe(async ({ jwt, refreshToken, userId }) => {
      this._store.token = jwt
      this._store.userId = userId
      this._store.refreshToken = refreshToken
      await this._router.navigate(['/'])
    })
  }
}
