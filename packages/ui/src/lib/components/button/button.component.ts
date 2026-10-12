import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type OnDestroy,
  ElementRef,
  inject,
  input,
  signal,
  ViewEncapsulation,
  booleanAttribute
} from '@angular/core'

import { NgIcon, provideIcons } from '@ng-icons/core'
import { NgTemplateOutlet } from '@angular/common'
import { lucideLoaderCircle } from '@ng-icons/lucide'
import type { ClassValue } from 'clsx'

import { mergeClasses } from '../../utils/merge-classes'
import { dialogActionVariants } from './dialog-action.variants'
import { XP_DIALOG_ACTION_CONTEXT } from '../dialog/dialog-context'

import {
  buttonVariants,
  type ZardButtonShapeVariants,
  type ZardButtonSizeVariants,
  type ZardButtonTypeVariants
} from './button.variants'

@Component({
  selector: 'z-button, button[z-button], a[z-button]',
  imports: [NgIcon, NgTemplateOutlet],
  template: `
    <ng-template #content><ng-content /></ng-template>
    @if (dialogActionRole()) {
      <span class="inline-flex items-center justify-center gap-[inherit]" [class.opacity-0]="zLoading()">
        <ng-container [ngTemplateOutlet]="content" />
      </span>
      @if (zLoading()) {
        <ng-icon name="lucideLoaderCircle" class="absolute animate-spin duration-2000" aria-hidden="true" />
      }
    } @else {
      @if (zLoading()) {
        <ng-icon name="lucideLoaderCircle" class="animate-spin duration-2000" />
      }
      <ng-container [ngTemplateOutlet]="content" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  viewProviders: [provideIcons({ lucideLoaderCircle })],
  host: {
    '[class]': 'classes()',
    '[attr.data-dialog-action]': 'dialogActionRole() ?? null',
    '[attr.aria-busy]': 'dialogActionRole() && zLoading() ? true : null',
    '[attr.data-icon-only]': 'iconOnly() || null',
    '[attr.data-disabled]': 'isNotInsideOfButtonOrLink() && zDisabled() || null',
    '[attr.aria-disabled]': 'isNotInsideOfButtonOrLink() && zDisabled() || null',
    '[attr.disabled]': 'isNotInsideOfButtonOrLink() && zDisabled() ? "" : null',
    '[attr.role]': 'isNotInsideOfButtonOrLink() ? "button" : null',
    '[attr.tabindex]': 'isNotInsideOfButtonOrLink() ? "0" : null'
  },
  exportAs: 'zButton'
})
export class ZardButtonComponent implements OnDestroy {
  private readonly elementRef = inject(ElementRef<HTMLElement>)
  private readonly dialogActions = inject(XP_DIALOG_ACTION_CONTEXT, { optional: true })

  readonly zType = input<ZardButtonTypeVariants>('default')
  readonly zSize = input<ZardButtonSizeVariants>('default')
  protected readonly dialogActionRole = computed(() => this.dialogActions?.role())
  readonly zShape = input<ZardButtonShapeVariants>('default')
  readonly class = input<ClassValue>('')
  readonly zFull = input(false, { transform: booleanAttribute })
  readonly zLoading = input(false, { transform: booleanAttribute })
  readonly zDisabled = input(false, { transform: booleanAttribute })

  private readonly iconOnlyState = signal(false)
  readonly iconOnly = this.iconOnlyState.asReadonly()

  private _mutationObserver: MutationObserver | null = null

  constructor() {
    afterNextRender(() => {
      if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
        return
      }

      const check = () => {
        const el = this.elementRef.nativeElement
        const hasIcon = el.querySelector('ng-icon') !== null
        const children = Array.from<Node>(el.childNodes)
        const hasText = children.some((node) => {
          if (node.nodeType === 3) {
            return node.textContent?.trim() !== ''
          }
          if (node.nodeType === 1) {
            const element = node as HTMLElement
            if (element.matches('ng-icon')) {
              return false
            }
            return element.textContent?.trim() !== ''
          }
          return false
        })

        this.iconOnlyState.set(hasIcon && !hasText)
      }

      check()
      this._mutationObserver = new MutationObserver(check)
      this._mutationObserver.observe(this.elementRef.nativeElement, {
        childList: true,
        characterData: true,
        subtree: true
      })
    })
  }

  ngOnDestroy(): void {
    if (this._mutationObserver) {
      this._mutationObserver.disconnect()
      this._mutationObserver = null
    }
  }

  protected readonly classes = computed(() =>
    mergeClasses(
      buttonVariants({
        zType: this.zType(),
        zSize: this.zSize(),
        zShape: this.zShape(),
        zFull: this.zFull(),
        zLoading: this.zLoading(),
        zDisabled: this.zDisabled()
      }),
      this.class(),
      this.dialogActionRole()
        ? dialogActionVariants({ purpose: this.dialogActions?.purpose(), icon: this.zSize().startsWith('icon') })
        : ''
    )
  )

  protected readonly isNotInsideOfButtonOrLink = computed(() => {
    // Evaluated once; assumes component parent doesn't change after mount
    const zardButtonElement = this.elementRef.nativeElement
    if (zardButtonElement.parentElement) {
      const { tagName } = zardButtonElement.parentElement
      return tagName !== 'BUTTON' && tagName !== 'A'
    }
    return true
  })
}
