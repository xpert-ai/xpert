/**
 * @license
 * Copyright Xpert. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
import { Component, Inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PAC_AUTH_OPTIONS } from '../auth.options';
import { getDeepFromObject } from '../helpers';
import { PacAuthResult, PacAuthService } from '../services';

@Component({
  standalone: false,
  selector: 'pac-logout',
  templateUrl: './logout.component.html',
})
export class PacLogoutComponent implements OnInit {

  redirectDelay = 0;
  strategy = '';

  constructor(protected service: PacAuthService,
              @Inject(PAC_AUTH_OPTIONS) protected options = {},
              protected router: Router) {
    this.redirectDelay = this.getConfigValue('forms.logout.redirectDelay');
    this.strategy = this.getConfigValue('forms.logout.strategy');
  }

  ngOnInit(): void {
    this.logout(this.strategy);
  }

  logout(strategy: string): void {
    this.service.logout(strategy).subscribe((result: PacAuthResult) => {

      const redirect = result.getRedirect();
      if (redirect) {
        setTimeout(() => {
          return this.router.navigateByUrl(redirect);
        }, this.redirectDelay);
      }
    });
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null);
  }
}
