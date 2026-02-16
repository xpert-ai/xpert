import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  standalone: false,
  selector: 'pac-passport-register-result',
  templateUrl: './register-result.component.html'
})
export class UserRegisterResultComponent {
  params = { email: '' };
  email = '';
  constructor(route: ActivatedRoute) {
    this.params.email = this.email = route.snapshot.queryParams.email
  }
}
