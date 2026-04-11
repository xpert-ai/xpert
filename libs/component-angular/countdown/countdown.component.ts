import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  Output,
  EventEmitter,
  OnInit,
  SimpleChange,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  Inject,
  LOCALE_ID,
  ChangeDetectorRef,
  TemplateRef,
  NgZone,
} from '@angular/core';
import { CountdownConfig, CountdownStatus, CountdownEvent, CountdownEventAction, CountdownItem } from './interfaces';
import { CountdownTimer } from './countdown.timer';
import { CountdownGlobalConfig } from './countdown.config';

/**
 * @deprecated use `@xpert-ai/ocap-angular/common`
 */
@Component({
  selector: 'countdown',
  standalone: false,
  template: `
    @if (!render) {
      <span [innerHTML]="i.text"></span>
    }
    <ng-container *ngTemplateOutlet="render; context: { $implicit: i }"></ng-container>
    `,
  host: { '[class.count-down]': 'true' },
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountdownComponent implements OnInit, OnChanges, OnDestroy {
  private frequency = 1000;
  private _notify: { [key: number]: boolean } = {};
  private status: CountdownStatus = CountdownStatus.ing;
  private isDestroy = false;
  private _config!: CountdownConfig;
  i: CountdownItem = {};
  left = 0;

  @Input()
  set config(i: CountdownConfig) {
    if (i.notify != null && !Array.isArray(i.notify) && i.notify > 0) {
      i.notify = [i.notify];
    }
    this._config = i;
  }
  get config(): CountdownConfig {
    return this._config;
  }
  @Input() render!: TemplateRef<{$implicit: CountdownItem}>;
  @Output() readonly event = new EventEmitter<CountdownEvent>();

  constructor(
    @Inject(LOCALE_ID) private locale: string,
    private timer: CountdownTimer,
    private defCog: CountdownGlobalConfig,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  /**
   * Start countdown, you must manually call when `demand: false`
   */
  begin(): void {
    this.status = CountdownStatus.ing;
    this.callEvent('start');
  }

  /**
   * Restart countdown
   */
  restart(): void {
    if (this.status !== CountdownStatus.stop) {
      this.destroy();
    }
    this.init();
    this.callEvent('restart');
  }

  /**
   * Stop countdown, must call `restart` when stopped, it's different from pause, unable to recover
   */
  stop(): void {
    if (this.status === CountdownStatus.stop) {
      return;
    }
    this.status = CountdownStatus.stop;
    this.destroy();
    this.callEvent('stop');
  }

  /**
   * Pause countdown, you can use `resume` to recover again
   */
  pause(): void {
    if (this.status === CountdownStatus.stop || this.status === CountdownStatus.pause) {
      return;
    }
    this.status = CountdownStatus.pause;
    this.callEvent('pause');
  }

  /**
   * Resume countdown
   */
  resume(): void {
    if (this.status === CountdownStatus.stop || this.status !== CountdownStatus.pause) {
      return;
    }
    this.status = CountdownStatus.ing;
    this.callEvent('resume');
  }

  private callEvent(action: CountdownEventAction): void {
    this.event.emit({ action, left: this.left, status: this.status, text: this.i.text! });
  }

  private init(): void {
    const { locale, defCog } = this;
    const config = (this.config = {
      ...new CountdownGlobalConfig(locale),
      ...defCog,
      ...this.config,
    });
    // tslint:disable-next-line: no-bitwise
    const frq = (this.frequency = ~config.format!.indexOf('S') ? 100 : 1000);
    this.status = config.demand ? CountdownStatus.pause : CountdownStatus.ing;

    this.getLeft();

    // bind reflow to me
    const _reflow = this.reflow;
    this.reflow = (count: number = 0, force: boolean = false) => _reflow.apply(this, [count, force]);

    if (Array.isArray(config.notify)) {
      config.notify.forEach((time: number) => {
        if (time < 1) {
          throw new Error(`The notify config must be a positive integer.`);
        }

        time = time * 1000;
        time = time - (time % frq);
        this._notify[time] = true;
      });
    }

    this.timer.add(this.reflow, frq).start();

    this.reflow(0, true);
  }

  private destroy(): this {
    this.timer.remove(this.reflow);
    return this;
  }

  /**
   * 更新时钟
   */
  private reflow(count: number = 0, force: boolean = false): void {
    if (this.isDestroy) {
      return;
    }

    const { status, config, _notify } = this;
    if (!force && status !== CountdownStatus.ing) {
      return;
    }

    let value = (this.left = this.left - this.frequency * count);
    if (value < 1) {
      value = 0;
    }
    this.i = {
      value,
      text: config.formatDate!({ date: value, formatStr: config.format!, timezone: config.timezone }),
    };
    if (typeof config.prettyText === 'function') {
      this.i.text = config.prettyText(this.i.text!);
    }
    this.cdr.detectChanges();

    if (config.notify === 0 || _notify[value]) {
      this.ngZone.run(() => {
        this.callEvent('notify');
      });
    }

    if (value === 0) {
      this.ngZone.run(() => {
        this.status = CountdownStatus.done;
        this.destroy();
        this.callEvent('done');
      });
    }
  }

  /**
   * 获取倒计时剩余帧数
   */
  private getLeft(): void {
    const { config, frequency } = this;
    let left = config.leftTime! * 1000;
    const end = config.stopTime;

    if (!left && end) {
      left = end - new Date().getTime();
    }

    this.left = left - (left % frequency);
  }

  ngOnInit(): void {
    this.init();
    if (!this.config.demand) {
      this.begin();
    }
  }

  ngOnDestroy(): void {
    this.isDestroy = true;
    this.destroy();
  }

  ngOnChanges(changes: { [P in keyof this]?: SimpleChange } & SimpleChanges): void {
    if (!changes.config!.firstChange) {
      this.restart();
    }
  }
}
