/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
import { XpAuthTokenClass } from '../services/token/token'

export interface NbStrategyToken {
  class?: XpAuthTokenClass
  [key: string]: any
}

export class XpAuthStrategyOptions {
  name: string
  token?: NbStrategyToken
}
