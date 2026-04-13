import { Injectable, NgZone } from '@angular/core';

/**
 * @deprecated use `@xpert-ai/ocap-angular/common`
 */
@Injectable()
export class CountdownTimer {
  private fns: Array<((count: number) => number | void) | number> = [];
  private commands: Array<() => void> = [];
  private nextTime = 0;
  private ing = false;

  constructor(private ngZone: NgZone) {}

  start(): void {
    if (this.ing === true) {
      return;
    }

    this.ing = true;
    this.nextTime = +new Date();
    this.ngZone.runOutsideAngular(() => {
      this.process();
    });
  }

  private process(): void {
    while (this.commands.length) {
      this.commands.shift()!();
    }
    let diff = +new Date() - this.nextTime;
    const count = 1 + Math.floor(diff / 100);

    diff = 100 - (diff % 100);
    this.nextTime += 100 * count;

    for (let i = 0, len = this.fns.length; i < len; i += 2) {
      let frequency = this.fns[i + 1] as number;

      // 100/s
      if (0 === frequency) {
        (this.fns[i] as (count: number) => void)(count);
        // 1000/s
      } else {
        // 先把末位至0，再每次加2
        frequency += 2 * count - 1;

        const step = Math.floor(frequency / 20);
        if (step > 0) {
          (this.fns[i] as (count: number) => void)(step);
        }

        // 把末位还原成1
        this.fns[i + 1] = (frequency % 20) + 1;
      }
    }

    if (!this.ing) {
      return;
    }

    setTimeout(() => this.process(), diff);
  }

  add(fn: () => void, frequency: number): this {
    this.commands.push(() => {
      this.fns.push(fn);
      this.fns.push(frequency === 1000 ? 1 : 0);
      this.ing = true;
    });
    return this;
  }

  remove(fn: () => void): this {
    this.commands.push(() => {
      const i = this.fns.indexOf(fn);
      if (i !== -1) {
        this.fns.splice(i, 2);
      }
      this.ing = this.fns.length > 0;
    });
    return this;
  }
}
