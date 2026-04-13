// tslint:disable: no-inferrable-types
import { Injectable, Inject, LOCALE_ID } from '@angular/core';
import { formatDate } from '@angular/common';
import { CountdownFormatFn, CountdownConfig } from './interfaces';

/**
 * @deprecated use `@xpert-ai/ocap-angular/common`
 */
@Injectable({ providedIn: 'root' })
export class CountdownGlobalConfig implements CountdownConfig {
  constructor(@Inject(LOCALE_ID) private locale: string) {}

  demand?: boolean = false;

  leftTime?: number = 0;

  format?: string = 'HH:mm:ss';

  timezone?: string = '+0000';

  formatDate?: CountdownFormatFn = ({ date, formatStr, timezone }) => {
    return formatDate(new Date(date), formatStr, this.locale, timezone || this.timezone || '+0000');
  }
}
