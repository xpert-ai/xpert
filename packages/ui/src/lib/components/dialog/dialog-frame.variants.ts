import { cva } from 'class-variance-authority'

// Cloud uses a 14px root font. Keep Dialog typography independent of rem density.
export const dialogTypography =
  'text-[14px] leading-[20px] [--text-sm:14px] [--text-sm--line-height:20px] [--text-xs:12px] [--text-xs--line-height:18px]'

export const dialogFrameVariants = cva(`flex min-h-0 min-w-0 flex-col ${dialogTypography}`, {
  variants: {
    layout: {
      standard: '[--xp-dialog-padding:calc(var(--spacing)*4)]',
      wide: '[--xp-dialog-padding:calc(var(--spacing)*4)]'
    }
  }
})

export const dialogHeaderClasses =
  'relative flex shrink-0 flex-col gap-2 px-(--xp-dialog-padding) pt-(--xp-dialog-padding) pb-4 has-[>[xpDialogCloseButton]]:pe-[52px] pointer-coarse:has-[>[xpDialogCloseButton]]:pe-[60px]'
export const dialogTitleClasses = 'm-0 text-[16px] leading-none font-medium text-foreground wrap-anywhere'
export const dialogDescriptionClasses = 'm-0 text-[14px] leading-[20px] text-muted-foreground wrap-anywhere'
export const dialogBodyClasses =
  'min-h-0 flex-1 space-y-4 overflow-y-auto px-(--xp-dialog-padding) pb-(--xp-dialog-padding)'
export const dialogSectionBodyClasses = 'pt-(--xp-dialog-padding)'
export const dialogFooterClasses =
  'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/50 px-4 py-2.5'
// Match Zard's fixed corner inset; retain the shared 36px (44px touch) target.
export const dialogCloseClasses = 'absolute! end-[8px] top-[8px]'

export const dialogControlVariants = cva('text-[14px] leading-[20px] px-[12px]', {
  variants: {
    kind: {
      single: 'h-[36px] min-h-[36px] py-0 pointer-coarse:h-[44px] pointer-coarse:min-h-[44px]',
      multiple: 'h-auto min-h-[36px] py-[7px] pointer-coarse:min-h-[44px] pointer-coarse:py-[11px]',
      textarea: 'h-auto min-h-[80px] py-[8px]'
    }
  }
})
