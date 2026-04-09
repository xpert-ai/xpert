import { cva, type VariantProps } from 'class-variance-authority';

import type { zAlign } from './tabs.component';

export const tabContainerVariants = cva('z-tab-group flex min-h-0 min-w-0', {
  variants: {
    zPosition: {
      top: 'flex-col',
      bottom: 'flex-col',
      left: 'flex-row',
      right: 'flex-row',
    },
  },
  defaultVariants: {
    zPosition: 'top',
  },
});

export const tabNavBarVariants = cva(
  'z-tab-nav-bar z-tab-group__nav nav-tab-scroll flex min-h-0 min-w-0 overflow-auto border-border',
  {
    variants: {
      headerPosition: {
        above: 'flex-row border-b mb-1',
        below: 'flex-row border-t mt-1',
      },
      zAlignTabs: {
        start: 'justify-start',
        center: 'justify-center',
        end: 'justify-end',
      },
      zSize: {
        sm: 'gap-0.5',
        default: 'gap-1',
        lg: 'gap-1.5',
      },
    },
    defaultVariants: {
      headerPosition: 'above',
      zAlignTabs: 'start',
      zSize: 'default',
    },
  },
);

export const tabNavVariants = cva(
  'z-tab-group__nav nav-tab-scroll flex min-h-0 min-w-0 overflow-auto border-border',
  {
    variants: {
      zPosition: {
        top: 'mb-4 flex-row border-b pb-1',
        bottom: 'mt-4 flex-row border-t pt-1',
        left: 'mr-4 flex-col border-r pr-2',
        right: 'ml-4 flex-col border-l pl-2',
      },
      zAlignTabs: {
        start: 'justify-start',
        center: 'justify-center',
        end: 'justify-end',
      },
      zSize: {
        sm: 'gap-0.5',
        default: 'gap-1',
        lg: 'gap-1.5',
      },
    },
    defaultVariants: {
      zPosition: 'top',
      zAlignTabs: 'start',
      zSize: 'default',
    },
  },
);

export const tabButtonVariants = cva(
  'z-tab-group__trigger relative flex shrink-0 items-center font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:bg-muted/60 hover:text-foreground',
  {
    variants: {
      zActivePosition: {
        top: 'border-t-2',
        bottom: 'border-b-2',
        left: 'border-l-2',
        right: 'border-r-2',
      },
      zSize: {
        sm: 'gap-1 px-2.5 py-1.5 text-xs',
        default: 'gap-1 px-3 py-2 text-sm',
        lg: 'gap-1.5 px-4 py-2.5 text-base',
      },
      isActive: {
        true: 'bg-muted/40 text-foreground',
        false: '',
      },
      isDisabled: {
        true: 'cursor-not-allowed opacity-50',
        false: 'cursor-pointer',
      },
      stretchTabs: {
        true: 'flex-1 justify-center text-center',
        false: '',
      },
    },
    compoundVariants: [
      {
        zActivePosition: 'top',
        isActive: true,
        class: 'border-t-primary',
      },
      {
        zActivePosition: 'top',
        isActive: false,
        class: 'border-t-transparent',
      },
      {
        zActivePosition: 'bottom',
        isActive: true,
        class: 'border-b-primary',
      },
      {
        zActivePosition: 'bottom',
        isActive: false,
        class: 'border-b-transparent',
      },
      {
        zActivePosition: 'left',
        isActive: true,
        class: 'border-l-primary',
      },
      {
        zActivePosition: 'left',
        isActive: false,
        class: 'border-l-transparent',
      },
      {
        zActivePosition: 'right',
        isActive: true,
        class: 'border-r-primary',
      },
      {
        zActivePosition: 'right',
        isActive: false,
        class: 'border-r-transparent',
      },
    ],
    defaultVariants: {
      zActivePosition: 'bottom',
      zSize: 'default',
      isActive: false,
      isDisabled: false,
      stretchTabs: false,
    },
  },
);

type ZardTabNavVariants = VariantProps<typeof tabNavVariants>;
type ZardTabButtonVariants = VariantProps<typeof tabButtonVariants>;

export type ZardTabSizeVariants = NonNullable<ZardTabButtonVariants['zSize']>;
export type ZardTabVariants = VariantProps<typeof tabContainerVariants> &
  ZardTabNavVariants &
  ZardTabButtonVariants & { zAlignTabs: zAlign };
