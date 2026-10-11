import { computed, Directive, forwardRef, inject, input } from '@angular/core'
import type { ClassValue } from 'clsx'
import { mergeClasses } from '../../utils/merge-classes'
import { ZardIconComponent } from '../icon/icon.component'
import { XP_DIALOG_ACTION_CONTEXT, XP_DIALOG_CONTEXT, type XpDialogPurpose } from './dialog-context'
import {
  dialogBodyClasses,
  dialogCloseClasses,
  dialogDescriptionClasses,
  dialogFooterClasses,
  dialogFrameVariants,
  dialogHeaderClasses,
  dialogSectionBodyClasses,
  dialogTitleClasses
} from './dialog-frame.variants'

@Directive({
  selector: '[xpDialogLayout]',
  providers: [{ provide: XP_DIALOG_CONTEXT, useExisting: forwardRef(() => XpDialogLayoutDirective) }],
  host: { '[class]': 'classes()', 'data-dialog-layout': '' }
})
export class XpDialogLayoutDirective {
  readonly xpDialogLayout = input<'standard' | 'wide'>('standard')
  readonly purpose = input<XpDialogPurpose>('standard', { alias: 'xpDialogPurpose' })
  readonly class = input<ClassValue>('')
  protected readonly classes = computed(() =>
    mergeClasses(dialogFrameVariants({ layout: this.xpDialogLayout() }), this.class())
  )
}

@Directive({
  selector: '[xpDialogHeader]',
  providers: [{ provide: XP_DIALOG_ACTION_CONTEXT, useExisting: forwardRef(() => XpDialogHeaderDirective) }],
  host: { '[class]': 'classes()', 'data-dialog-action-group': 'header' }
})
export class XpDialogHeaderDirective {
  readonly role = computed(() => 'header' as const)
  readonly purpose = computed(() => 'standard' as const)
  readonly class = input<ClassValue>('')
  protected readonly classes = computed(() => mergeClasses(dialogHeaderClasses, this.class()))
}

@Directive({ selector: '[xpDialogHeading]', host: { '[class]': 'classes()' } })
export class XpDialogHeadingDirective {
  readonly class = input<ClassValue>('')
  protected readonly classes = computed(() => mergeClasses(dialogTitleClasses, this.class()))
}

@Directive({ selector: '[xpDialogDescription]', host: { '[class]': 'classes()' } })
export class XpDialogDescriptionDirective {
  readonly class = input<ClassValue>('')
  protected readonly classes = computed(() => mergeClasses(dialogDescriptionClasses, this.class()))
}

@Directive({ selector: '[xpDialogBody]', host: { '[class]': 'classes()' } })
export class XpDialogBodyDirective {
  readonly xpDialogBody = input<'' | 'section'>('')
  readonly class = input<ClassValue>('')
  protected readonly classes = computed(() =>
    mergeClasses(dialogBodyClasses, this.xpDialogBody() === 'section' ? dialogSectionBodyClasses : '', this.class())
  )
}

@Directive({
  selector: '[xpDialogFooter]',
  providers: [{ provide: XP_DIALOG_ACTION_CONTEXT, useExisting: forwardRef(() => XpDialogFooterDirective) }],
  host: { '[class]': 'classes()', 'data-dialog-action-group': 'footer' }
})
export class XpDialogFooterDirective {
  private readonly dialog = inject(XP_DIALOG_CONTEXT, { optional: true })
  readonly role = computed(() => 'footer' as const)
  readonly purpose = computed(() => this.dialog?.purpose() ?? 'standard')
  readonly class = input<ClassValue>('')
  protected readonly classes = computed(() => mergeClasses(dialogFooterClasses, this.class()))
}

@Directive({ selector: '[xpDialogCloseButton]', host: { class: dialogCloseClasses } })
export class XpDialogCloseButtonDirective {}

export const XpDialogFrameImports = [
  ZardIconComponent,
  XpDialogLayoutDirective,
  XpDialogHeaderDirective,
  XpDialogHeadingDirective,
  XpDialogDescriptionDirective,
  XpDialogBodyDirective,
  XpDialogFooterDirective,
  XpDialogCloseButtonDirective
] as const
