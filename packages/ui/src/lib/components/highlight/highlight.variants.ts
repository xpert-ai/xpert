import { cva, type VariantProps } from 'class-variance-authority';

export const highlightOverlayVariants = cva('fixed inset-0 z-[1000] pointer-events-none');

export const highlightMaskVariants = cva('fixed bg-foreground/70 pointer-events-auto');

export const highlightTargetVariants = cva(
  'fixed z-[1001] pointer-events-none border-2 border-dashed border-ring bg-background/5 shadow-lg ring-2 ring-ring/50',
);

export const highlightTargetBlockerVariants = cva('fixed z-[1002] bg-transparent pointer-events-auto');

export const highlightCardVariants = cva(
  'fixed z-[1003] w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg pointer-events-auto',
  {
    variants: {
      placement: {
        center: 'highlight-card--center',
        top: 'highlight-card--top',
        topLeft: 'highlight-card--top-left',
        topRight: 'highlight-card--top-right',
        bottom: 'highlight-card--bottom',
        bottomLeft: 'highlight-card--bottom-left',
        bottomRight: 'highlight-card--bottom-right',
        left: 'highlight-card--left',
        leftTop: 'highlight-card--left-top',
        leftBottom: 'highlight-card--left-bottom',
        right: 'highlight-card--right',
        rightTop: 'highlight-card--right-top',
        rightBottom: 'highlight-card--right-bottom',
      },
      zType: {
        default: '',
        primary: 'highlight-card--primary border-ring shadow-xl',
      },
    },
    defaultVariants: {
      placement: 'bottom',
      zType: 'default',
    },
  },
);

export const highlightCloseVariants = cva('absolute top-2 right-2');

export const highlightTitleVariants = cva('pr-8 text-sm font-semibold leading-none text-popover-foreground');

export const highlightDescriptionVariants = cva('mt-2 text-sm leading-relaxed text-muted-foreground');

export const highlightFooterVariants = cva('mt-4 flex items-center justify-between gap-3');

export const highlightActionsVariants = cva('flex items-center gap-2');

export const highlightIndicatorVariants = cva('text-xs text-muted-foreground');

export type ZardHighlightCardVariants = VariantProps<typeof highlightCardVariants>;
