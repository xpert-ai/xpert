import { cva, type VariantProps } from 'class-variance-authority';

export const iconVariants = cva('flex items-center justify-center leading-none', {
  variants: {
    zSize: {
      sm: 'size-3 text-xs',
      default: 'size-3.5 text-sm',
      lg: 'size-4 text-base',
      xl: 'size-5 text-xl',
    },
  },
  defaultVariants: {
    zSize: 'default',
  },
});

export type ZardIconSizeVariants = NonNullable<VariantProps<typeof iconVariants>['zSize']>;
