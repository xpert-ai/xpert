import { cva, type VariantProps } from 'class-variance-authority';

export const dividerVariants = cva('z-divider block shrink-0 border-border', {
  variants: {
    zOrientation: {
      horizontal: 'w-full border-t',
      vertical: 'inline-block h-full border-l',
    },
    zVariant: {
      solid: 'border-solid',
      dashed: 'border-dashed',
    },
    zSpacing: {
      none: '',
      sm: '',
      default: '',
      lg: '',
    },
  },
  defaultVariants: {
    zOrientation: 'horizontal',
    zVariant: 'solid',
    zSpacing: 'none',
  },
  compoundVariants: [
    {
      zOrientation: 'horizontal',
      zSpacing: 'sm',
      class: 'my-2',
    },
    {
      zOrientation: 'horizontal',
      zSpacing: 'default',
      class: 'my-4',
    },
    {
      zOrientation: 'horizontal',
      zSpacing: 'lg',
      class: 'my-8',
    },
    {
      zOrientation: 'vertical',
      zSpacing: 'sm',
      class: 'mx-2',
    },
    {
      zOrientation: 'vertical',
      zSpacing: 'default',
      class: 'mx-4',
    },
    {
      zOrientation: 'vertical',
      zSpacing: 'lg',
      class: 'mx-8',
    },
  ],
});

export type ZardDividerVariants = VariantProps<typeof dividerVariants>;
