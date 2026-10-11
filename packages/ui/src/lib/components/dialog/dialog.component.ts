import { A11yModule } from '@angular/cdk/a11y'
import { OverlayModule } from '@angular/cdk/overlay'
import {
  BasePortalOutlet,
  CdkPortalOutlet,
  type ComponentPortal,
  PortalModule,
  type TemplatePortal
} from '@angular/cdk/portal'
import { NgTemplateOutlet } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  ElementRef,
  type EmbeddedViewRef,
  type EventEmitter,
  inject,
  NgModule,
  output,
  type TemplateRef,
  type Type,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { XpDialogFrameImports } from './dialog-frame.directive'

import { mergeClasses, noopFn } from '../../utils/merge-classes'

import { ZardButtonComponent } from '../button/button.component'
import { ZardIconComponent } from '../icon/icon.component'
import type { ZardIcon } from '../icon/icons'
import { UiDialogCloseDirective } from './dialog-close.directive'
import { XpDialogActionsDirective, XpDialogContentDirective, XpDialogTitleDirective } from './dialog-layout.directive'
import type { ZardDialogRef } from './dialog-ref'
import { ZardDialogService } from './dialog.service'
import { dialogVariants } from './dialog.variants'

// Used by the NgModule provider definition

export type OnClickCallback<T> = (instance: T) => false | void | object
export class ZardDialogOptions<T, U> {
  /** Content supplied through open() owns its shared frame. */
  zBare?: boolean
  zBackdropClass?: string | string[]
  zCancelIcon?: ZardIcon
  zCancelText?: string | null
  zClosable?: boolean
  zContent?: string | TemplateRef<T> | Type<T>
  zCustomClasses?: string
  zData?: U
  zDescription?: string
  zHideFooter?: boolean
  zMaskClosable?: boolean
  zOkDestructive?: boolean
  zOkDisabled?: boolean
  zOkIcon?: ZardIcon
  zOkText?: string | null
  zOnCancel?: EventEmitter<T> | OnClickCallback<T> = noopFn
  zOnOk?: EventEmitter<T> | OnClickCallback<T> = noopFn
  zTitle?: string | TemplateRef<T>
  zViewContainerRef?: ViewContainerRef
  zHeight?: string
  zMaxHeight?: string
  zMaxWidth?: string
  zMinHeight?: string
  zMinWidth?: string
  zWidth?: string
}

let nextDialogId = 0

@Component({
  selector: 'z-dialog',
  imports: [
    A11yModule,
    NgTemplateOutlet,
    ...XpDialogFrameImports,
    OverlayModule,
    PortalModule,
    ZardButtonComponent,
    ZardIconComponent
  ],
  template: `
    <div
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      class="flex min-h-0 flex-1 flex-col"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="config.zTitle ? titleId : null"
    >
      @if (config.zBare) {
        <ng-container *ngTemplateOutlet="content" />
      } @else {
        <div xpDialogLayout="standard" class="max-h-full">
          @if (config.zTitle || config.zDescription || config.zClosable !== false) {
            <header xpDialogHeader>
              @if (config.zTitle) {
                <h2 xpDialogHeading data-testid="z-title" [id]="titleId">{{ config.zTitle }}</h2>
              }
              @if (config.zDescription) {
                <p xpDialogDescription data-testid="z-description">{{ config.zDescription }}</p>
              }
              @if (config.zClosable !== false) {
                <button
                  type="button"
                  data-testid="z-close-header-button"
                  xpDialogCloseButton
                  z-button
                  zType="ghost"
                  zSize="icon"
                  [attr.aria-label]="config.zCancelText ?? 'Close'"
                  (click)="onCloseClick()"
                >
                  <z-icon zType="x" />
                </button>
              }
            </header>
          }
          <main xpDialogBody><ng-container *ngTemplateOutlet="content" /></main>
          @if (!config.zHideFooter) {
            <footer xpDialogFooter>
              @if (config.zCancelText !== null) {
                <button type="button" data-testid="z-cancel-button" z-button zType="outline" (click)="onCloseClick()">
                  @if (config.zCancelIcon) {
                    <z-icon [zType]="config.zCancelIcon" />
                  }
                  {{ config.zCancelText ?? 'Cancel' }}
                </button>
              }
              @if (config.zOkText !== null) {
                <button
                  type="button"
                  data-testid="z-ok-button"
                  z-button
                  [zType]="config.zOkDestructive ? 'destructive' : 'default'"
                  [zDisabled]="config.zOkDisabled ?? false"
                  (click)="onOkClick()"
                >
                  @if (config.zOkIcon) {
                    <z-icon [zType]="config.zOkIcon" />
                  }
                  {{ config.zOkText ?? 'OK' }}
                </button>
              }
            </footer>
          }
        </div>
      }
    </div>
    <ng-template #content>
      <ng-template cdkPortalOutlet />
      @if (isStringContent) {
        <div data-testid="z-content" [innerHTML]="config.zContent"></div>
      }
    </ng-template>
  `,
  styles: `
    :host {
      opacity: 1;
      transform: scale(1);
      transition:
        opacity 150ms ease-out,
        transform 150ms ease-out;
    }

    @starting-style {
      :host {
        opacity: 0;
        transform: scale(0.9);
      }
    }

    :host.dialog-leave {
      opacity: 0;
      transform: scale(0.9);
      transition:
        opacity 150ms ease-in,
        transform 150ms ease-in;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    'animate.enter': 'dialog-enter',
    'animate.leave': 'dialog-leave'
  },
  exportAs: 'zDialog'
})
export class ZardDialogComponent<T, U> extends BasePortalOutlet {
  readonly titleId = `z-dialog-title-${nextDialogId++}`
  private readonly host = inject(ElementRef<HTMLElement>)
  private readonly viewContainerRef = inject(ViewContainerRef)
  protected readonly config = inject(ZardDialogOptions<T, U>)

  protected readonly classes = computed(() => mergeClasses(dialogVariants()))
  dialogRef?: ZardDialogRef<T>

  protected readonly isStringContent = typeof this.config.zContent === 'string'

  readonly portalOutlet = viewChild.required(CdkPortalOutlet)

  okTriggered = output<void>()
  cancelTriggered = output<void>()

  constructor() {
    super()
  }

  getNativeElement(): HTMLElement {
    return this.host.nativeElement
  }

  getViewContainerRef(): ViewContainerRef {
    return this.viewContainerRef
  }

  attachComponentPortal<T>(portal: ComponentPortal<T>): ComponentRef<T> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error('Attempting to attach modal content after content is already attached')
    }
    return this.portalOutlet()?.attachComponentPortal(portal)
  }

  attachTemplatePortal<C>(portal: TemplatePortal<C>): EmbeddedViewRef<C> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error('Attempting to attach modal content after content is already attached')
    }

    return this.portalOutlet()?.attachTemplatePortal(portal)
  }

  onOkClick() {
    this.okTriggered.emit()
  }

  onCloseClick() {
    this.cancelTriggered.emit()
  }
}

@NgModule({
  imports: [
    UiDialogCloseDirective,
    XpDialogActionsDirective,
    XpDialogContentDirective,
    XpDialogTitleDirective,
    ZardButtonComponent,
    ZardDialogComponent,
    OverlayModule,
    PortalModule
  ],
  exports: [UiDialogCloseDirective, XpDialogActionsDirective, XpDialogContentDirective, XpDialogTitleDirective],
  providers: [ZardDialogService]
})
export class ZardDialogModule {}
