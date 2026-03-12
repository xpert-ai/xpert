import { cva } from 'class-variance-authority';

export type ZardRadioDensity = 'default' | 'cosy' | 'compact';

export const radioItemVariants = cva('z-radio__item relative inline-flex max-w-full select-none items-start gap-2 align-middle', {
  variants: {
    displayDensity: {
      default: 'text-sm',
      cosy: 'gap-2 text-sm',
      compact: 'gap-1.5 text-xs',
    },
  },
  defaultVariants: {
    displayDensity: 'default',
  },
});

export const radioVariants = cva(
  'z-radio__control relative flex shrink-0 items-center justify-center rounded-full border border-input bg-background text-primary shadow-xs transition-[border-color,box-shadow,background-color] peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 dark:bg-input/30',
  {
    variants: {
      displayDensity: {
        default: 'size-4',
        cosy: 'size-4',
        compact: 'size-3.5',
      },
    },
    defaultVariants: {
      displayDensity: 'default',
    },
  },
);

export const radioDotVariants = cva(
  'z-radio__dot pointer-events-none absolute inset-0 m-auto rounded-full bg-primary opacity-0 transition-opacity peer-checked:opacity-100',
  {
    variants: {
      displayDensity: {
        default: 'size-2',
        cosy: 'size-2',
        compact: 'size-1.5',
      },
    },
    defaultVariants: {
      displayDensity: 'default',
    },
  },
);

export const radioLabelVariants = cva('z-radio__label min-w-0 empty:hidden peer-disabled:opacity-50 peer-disabled:cursor-not-allowed', {
  variants: {
    displayDensity: {
      default: 'text-sm',
      cosy: 'text-sm',
      compact: 'text-xs',
    },
  },
  defaultVariants: {
    displayDensity: 'default',
  },
});
