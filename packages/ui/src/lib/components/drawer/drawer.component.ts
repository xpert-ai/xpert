import { booleanAttribute, ChangeDetectionStrategy, Component, ContentChild, EventEmitter, HostBinding, Input, Output, ViewEncapsulation } from '@angular/core';

export type ZardDrawerMode = 'side' | 'over';
export type ZardDrawerPosition = 'start' | 'end';

@Component({
  selector: 'z-drawer',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'drawer',
    '[attr.data-mode]': 'mode',
    '[attr.data-position]': 'position',
    '[attr.data-state]': 'opened ? "open" : "closed"',
  },
  styles: `
    z-drawer {
      --z-drawer-size: 20rem;
      --z-drawer-bg: var(--popover, var(--card, white));
      --z-drawer-border-color: var(--border);
      --z-drawer-radius: 0;
      --z-drawer-shadow: 0 24px 48px color-mix(in oklab, var(--foreground) 18%, transparent);

      position: relative;
      z-index: 2;
      display: flex;
      min-width: 0;
      min-height: 0;
      overflow: visible;
      color: inherit;
      background: var(--z-drawer-bg);
      transition:
        transform 200ms ease,
        opacity 200ms ease,
        width 200ms ease,
        flex-basis 200ms ease,
        visibility 200ms ease,
        box-shadow 200ms ease;
    }

    z-drawer[data-mode='side'] {
      width: var(--z-drawer-size);
      max-width: 100%;
      flex: 0 0 auto;
      opacity: 1;
      visibility: visible;
    }

    z-drawer[data-mode='side'][data-position='start'] {
      border-inline-end: 1px solid var(--z-drawer-border-color);
    }

    z-drawer[data-mode='side'][data-position='end'] {
      border-inline-start: 1px solid var(--z-drawer-border-color);
    }

    z-drawer[data-mode='side'][data-state='closed'] {
      width: 0;
      max-width: 0;
      flex-basis: 0;
      opacity: 0;
      visibility: hidden;
      border-inline-width: 0;
      pointer-events: none;
    }

    z-drawer[data-mode='over'] {
      position: absolute;
      inset-block: 0;
      width: var(--z-drawer-size);
      max-width: min(100%, var(--z-drawer-size));
      box-shadow: var(--z-drawer-shadow);
    }

    z-drawer[data-mode='over'][data-position='start'] {
      inset-inline-start: 0;
      border-inline-end: 1px solid var(--z-drawer-border-color);
    }

    z-drawer[data-mode='over'][data-position='end'] {
      inset-inline-end: 0;
      border-inline-start: 1px solid var(--z-drawer-border-color);
    }

    z-drawer[data-mode='over'][data-state='closed'] {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    z-drawer[data-mode='over'][data-position='start'][data-state='closed'] {
      transform: translateX(calc(-100% - 1px));
    }

    z-drawer[data-mode='over'][data-position='end'][data-state='closed'] {
      transform: translateX(calc(100% + 1px));
    }

    z-drawer[data-mode='over'][data-state='open'] {
      transform: translateX(0);
      opacity: 1;
      visibility: visible;
    }
  `,
  exportAs: 'zDrawer',
  standalone: true,
})
export class ZardDrawerComponent {
  private _opened = false;
  private _mode: ZardDrawerMode = 'side';
  private _position: ZardDrawerPosition = 'start';

  @Input({ transform: booleanAttribute })
  get opened(): boolean {
    return this._opened;
  }

  set opened(value: boolean) {
    this._opened = value;
  }

  @Input()
  get mode(): ZardDrawerMode {
    return this._mode;
  }

  set mode(value: ZardDrawerMode) {
    this._mode = value ?? 'side';
  }

  @Input()
  get position(): ZardDrawerPosition {
    return this._position;
  }

  set position(value: ZardDrawerPosition) {
    this._position = value ?? 'start';
  }

  @Output() readonly openedChange = new EventEmitter<boolean>();

  open(): void {
    this.setOpened(true);
  }

  close(): void {
    this.setOpened(false);
  }

  toggle(): void {
    this.setOpened(!this.opened);
  }

  private setOpened(nextState: boolean): void {
    if (this._opened === nextState) {
      return;
    }

    this._opened = nextState;
    this.openedChange.emit(nextState);
  }
}

@Component({
  selector: 'z-drawer-content',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'drawer-content',
  },
  styles: `
    z-drawer-content {
      --z-drawer-content-bg: var(--background, transparent);
      --z-drawer-radius: 0;

      position: relative;
      z-index: 1;
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--z-drawer-content-bg);
      border-radius: var(--z-drawer-radius);
    }
  `,
  exportAs: 'zDrawerContent',
  standalone: true,
})
export class ZardDrawerContentComponent {}

@Component({
  selector: 'z-drawer-container',
  template: `
    <ng-content />

    @if (showBackdrop) {
      <div
        class="z-drawer-container__backdrop"
        data-slot="drawer-backdrop"
        (click)="closeDrawer()"
      ></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Default,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'drawer-container',
    '[class.z-drawer-container--side-start]': 'drawerMode === "side" && drawerPosition === "start"',
    '[class.z-drawer-container--side-end]': 'drawerMode === "side" && drawerPosition === "end"',
    '[class.z-drawer-container--over]': 'drawerMode === "over"',
  },
  styles: `
    z-drawer-container {
      position: relative;
      display: flex;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      isolation: isolate;
    }

    z-drawer-container.z-drawer-container--side-end {
      flex-direction: row-reverse;
    }

    z-drawer-container.z-drawer-container--over {
      flex-direction: row;
    }

    z-drawer-container > z-drawer-content {
      flex: 1 1 auto;
    }

    z-drawer-container > [data-slot='drawer-backdrop'] {
      position: absolute;
      inset: 0;
      z-index: 1;
      background: color-mix(in oklab, var(--foreground) 18%, transparent);
      backdrop-filter: blur(2px);
    }
  `,
  exportAs: 'zDrawerContainer',
  standalone: true,
})
export class ZardDrawerContainerComponent {
  @Input({ transform: booleanAttribute }) hasBackdrop = true;

  @ContentChild(ZardDrawerComponent) drawer?: ZardDrawerComponent;

  @HostBinding('attr.data-mode')
  get drawerMode(): ZardDrawerMode {
    return this.drawer?.mode ?? 'side';
  }

  @HostBinding('attr.data-position')
  get drawerPosition(): ZardDrawerPosition {
    return this.drawer?.position ?? 'start';
  }

  get showBackdrop(): boolean {
    return this.hasBackdrop && this.drawerMode === 'over' && !!this.drawer?.opened;
  }

  closeDrawer(): void {
    this.drawer?.close();
  }
}
