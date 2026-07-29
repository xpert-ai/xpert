/**
 * @license
 * Copyright Xpert. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
import { Component, Inject, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { XP_AUTH_OPTIONS } from '../auth.options'
import { getDeepFromObject } from '../helpers'
import { XpAuthResult, XpAuthService } from '../services'

@Component({
  standalone: false,
  selector: 'xp-logout',
  templateUrl: './logout.component.html'
})
export class XpLogoutComponent implements OnInit {
  redirectDelay = 0
  strategy = ''

  constructor(
    protected service: XpAuthService,
    @Inject(XP_AUTH_OPTIONS) protected options = {},
    protected router: Router
  ) {
    this.redirectDelay = this.getConfigValue('forms.logout.redirectDelay')
    this.strategy = this.getConfigValue('forms.logout.strategy')
  }

  ngOnInit(): void {
    this.logout(this.strategy)
  }

  logout(strategy: string): void {
    this.service.logout(strategy).subscribe((result: XpAuthResult) => {
      const redirect = result.getRedirect()
      if (redirect) {
        setTimeout(() => {
          return this.router.navigateByUrl(redirect)
        }, this.redirectDelay)
      }
    })
  }

  getConfigValue(key: string): any {
    return getDeepFromObject(this.options, key, null)
  }
}
