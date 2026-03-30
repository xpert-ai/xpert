import { cva, type VariantProps } from 'class-variance-authority';

export const sliderVariants = cva(
  'relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
  {
    variants: {
      orientation: {
        horizontal: 'items-center',
        vertical: 'flex-col h-full min-h-44 w-auto',
      },
      disabled: {
        true: 'opacity-50 pointer-events-none',
        false: '',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
      disabled: false,
    },
  },
);

export type SliderVariants = VariantProps<typeof sliderVariants>;

export const sliderTrackVariants = cva(
  'bg-border relative block grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
  {
    variants: {
      zOrientation: {
        horizontal: 'h-1.5 w-full',
        vertical: 'w-1.5 h-full min-h-44',
      },
    },
    defaultVariants: {
      zOrientation: 'horizontal',
    },
  },
);

export type SliderTrackVariants = VariantProps<typeof sliderTrackVariants>;

export const sliderRangeVariants = cva(
  'bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
  {
    variants: {
      zOrientation: {
        horizontal: 'h-full',
        vertical: 'w-full',
      },
    },
    defaultVariants: {
      zOrientation: 'horizontal',
    },
  },
);

export type SliderRangeVariants = VariantProps<typeof sliderRangeVariants>;

export const sliderThumbVariants = cva(
  'border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      disabled: {
        true: '',
        false: 'hover:ring-4',
      },
      active: {
        true: 'ring-4',
        false: '',
      },
    },
  },
);

export type SliderThumbVariants = VariantProps<typeof sliderThumbVariants>;

export const sliderTickVariants = cva('bg-border absolute rounded-full', {
  variants: {
    zOrientation: {
      horizontal: 'top-1/2 h-1.5 w-px -translate-x-1/2 -translate-y-1/2',
      vertical: 'left-1/2 h-px w-1.5 -translate-x-1/2 translate-y-1/2',
    },
  },
  defaultVariants: {
    zOrientation: 'horizontal',
  },
});

export type SliderTickVariants = VariantProps<typeof sliderTickVariants>;

export const sliderOrientationVariants = cva('absolute', {
  variants: {
    zOrientation: {
      horizontal: 'top-1/2 -translate-x-1/2 -translate-y-1/2',
      vertical: 'left-1/2 translate-y-1/2 -translate-x-1/2',
    },
  },
  defaultVariants: {
    zOrientation: 'horizontal',
  },
});

export type SliderOrientationVariants = VariantProps<typeof sliderOrientationVariants>;

export const sliderLabelVariants = cva(
  'bg-foreground text-background pointer-events-none absolute inline-flex min-w-8 justify-center rounded-md px-1.5 py-0.5 text-[10px] font-medium shadow-sm',
  {
    variants: {
      zOrientation: {
        horizontal: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
        vertical: 'left-full top-1/2 ml-2 -translate-y-1/2',
      },
    },
    defaultVariants: {
      zOrientation: 'horizontal',
    },
  },
);

export type SliderLabelVariants = VariantProps<typeof sliderLabelVariants>;
