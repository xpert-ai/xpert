export type CountdownFormatFn = (opt: CountdownFormatFnOption) => string

export interface CountdownFormatFnOption {
  date: number
  formatStr: string
  timezone?: string
}

export enum CountdownStatus {
  ing,
  pause,
  stop,
  done
}

export interface CountdownConfig {
  /**
   * Start the counter on demand, must call `begin()` to starting, Default: `false`
   */
  demand?: boolean

  /**
   * Calculate the remaining time based on the server, e.g: `10`,`5.5`, (Unit: seconds)
   */
  leftTime?: number

  /**
   * Refers to counting down from local time to end time (Unit: Milliseconds second UNIX timestamp)
   */
  stopTime?: number

  /**
   * Formats a date value, pls refer to [Accepted patterns](https://angular.io/api/common/DatePipe#usage-notes), Default: `HH:mm:ss`
   */
  format?: string

  /**
   * Beautify text, generally used to convert formatted time text into HTML
   */
  prettyText?: (text: string) => string

  /**
   * Should be trigger type `notify` event on the x second. When values is `0` will be trigger every time.
   */
  notify?: number[] | number

  /**
   * Default based on the implementation of `formatDate` in `@angular/common`
   *
   * You can changed to other libs, e.g: [date-fns](https://date-fns.org/v2.0.1/docs/format)
   */
  formatDate?: CountdownFormatFn

  /**
   * A timezone offset (such as '+0430'), or a standard UTC/GMT.
   * When not supplied, uses the end-user's local system timezone, Default: `+0000`
   */
  timezone?: string
}

export type CountdownEventAction = 'start' | 'stop' | 'restart' | 'pause' | 'resume' | 'notify' | 'done'

export interface CountdownEvent {
  action: CountdownEventAction
  status: CountdownStatus
  left: number
  text: string
}

export interface CountdownItem {
  text?: string
  value?: number
}
