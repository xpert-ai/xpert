import { cva, type VariantProps } from 'class-variance-authority'

export const checkboxVariants = cva(
  'z-checkbox__control cursor-[unset] peer appearance-none border transition shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      zType: {
        default: 'border-primary checked:bg-primary',
        destructive: 'border-destructive checked:bg-destructive'
      },
      zSize: {
        default: 'size-4',
        lg: 'size-6'
      },
      zShape: {
        default: 'rounded',
        circle: 'rounded-full',
        square: 'rounded-none'
      },
      displayDensity: {
        default: 'size-4',
        cosy: 'size-4',
        compact: 'size-3.5'
      }
    },
    defaultVariants: {
      zType: 'default',
      zSize: 'default',
      zShape: 'default',
      displayDensity: 'default'
    }
  }
)

export const checkboxLabelVariants = cva(
  'z-checkbox__label min-w-0 flex-1 cursor-[unset] text-current empty:hidden select-none',
  {
    variants: {
      zSize: {
        default: 'text-base',
        lg: 'text-lg'
      },
      displayDensity: {
        default: 'text-base',
        cosy: 'text-sm',
        compact: 'text-sm'
      }
    },
    defaultVariants: {
      zSize: 'default',
      displayDensity: 'default'
    }
  }
)

export type ZardCheckboxShapeVariants = NonNullable<VariantProps<typeof checkboxVariants>['zShape']>
export type ZardCheckboxSizeVariants = NonNullable<VariantProps<typeof checkboxVariants>['zSize']>
export type ZardCheckboxTypeVariants = NonNullable<VariantProps<typeof checkboxVariants>['zType']>
export type ZardCheckboxDisplayDensity = NonNullable<VariantProps<typeof checkboxVariants>['displayDensity']>
