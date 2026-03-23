import { DisplayDensity } from '@metad/ocap-angular/core'
import { CalculationType } from '@metad/ocap-core'
import { z } from 'zod'

export const ComponentStylingSchema = z.object({
  padding: z.number().optional().describe('The padding of story'),
  borderRadius: z.number().optional().describe('The border radius of story'),
  backgroundColor: z.string().optional().describe('The background color of story'),
  background: z.string().optional().describe('The background of story'),
  backgroundImage: z.string().optional().describe('The background image of story'),
  backgroundSize: z.string().optional().describe('The background size'),
  backgroundRepeat: z.string().optional().describe('The background repeat'),
  backdropFilter: z.string().optional().describe('The backdrop filter'),
  color: z.string().optional().describe('The color of story'),

  borderColor: z.string().optional().describe('The border color'),
  borderWidth: z.number().optional().describe('The border width'),
  borderStyle: z.string().optional().describe('The border style'),

  boxShadow: z.string().optional().describe('The box shadow'),

  fontFamily: z.string().optional().describe('The font family'),
  fontSize: z.number().optional().describe('The font size'),
  lineHeight: z.number().optional().describe('The line height of text'),
  textAlign: z.enum(['left', 'center', 'right']).optional().describe('Align text'),

  filter: z.string().optional().describe('The filter'),
  opacity: z.number().optional().describe('The opacity')
})

export const KPIStylingSchema = z
  .object({
    component: ComponentStylingSchema.optional().describe('css styling of kpi widget'),
    title: ComponentStylingSchema.optional().describe('css styling of title of kpi widget'),
    value: ComponentStylingSchema.optional().describe('css styling of value text of kpi widget'),
  })
  .optional()
  .describe('The styles of kpi widget')

export const StoryStyleSchema = z.object({
  story: z
    .object({
      themeName: z.enum(['default', 'light', 'dark']).optional().describe('The theme name of story'),
      displayDensity: z.enum([DisplayDensity.compact, DisplayDensity.cosy, null]).optional().describe('The display density of story'),
      enableWatermark: z.boolean().optional().default(false).describe('Enable watermark of story'),
      watermarkOptions: z
        .object({
          text: z.string().optional().describe('The text of watermark')
        })
        .optional(),
      colors: z.array(z.string()).optional().describe('The series colors of story'),
      tabBar: z.enum(['fixed', 'point', 'hidden']).optional().describe('The page header bar style of story'),
      pageHeaderPosition: z.enum(['above', 'below']).optional().describe('The page header position of story'),
      pageHeaderStretchTabs: z.boolean().default(false).optional().describe('The page header is stretch tabs'),
      pageHeaderAlignTabs: z.enum(['start', 'center', 'end']).optional().describe('The page header align tabs'),
      pageHeaderShowLabel: z.enum(['auto', 'always', 'never']).default('auto').optional().describe('The page header show label'),
      pageHeaderFitInkBarToContent: z.boolean().optional().describe('The page header fit ink bar to content')
    })
    .optional()
    .describe('The story preferences'),

  storyStyling: ComponentStylingSchema.optional().describe('The story css styling'),

  widget: z
    .object({
      styling: ComponentStylingSchema.optional().describe('css styling for all widgets')
    })
    .optional()
    .describe('The preferences for all widgets'),

  card: z
    .object({
      styling: ComponentStylingSchema.optional().describe('css styling of card widget')
    })
    .optional()
    .describe('The card widget preferences'),

  table: z
    .object({
      styling: ComponentStylingSchema.optional().describe('css styling of table widget')
    })
    .optional()
    .describe('The table widget preferences'),

  control: z
    .object({
      styling: ComponentStylingSchema.optional().describe('css styling of control widget')
    })
    .optional()
    .describe('The control widget preferences'),

  kpi: z
  .object({
    styling: ComponentStylingSchema.optional().describe('css styling of kpi widget'),
    title: ComponentStylingSchema.optional().describe('css styling of title of kpi widget'),
    value: ComponentStylingSchema.optional().describe('css styling of value text of kpi widget'),
  })
  .optional()
  .describe('The styles of kpi widget')
})

export const CalculationMeasureSchema = z.object({
  calculationType: z.enum([CalculationType.Calculated, CalculationType.Restricted]).describe('The calculation type'),
  name: z.string().optional().describe('The name of calculation measure'),
  formula: z.string().optional().describe(`The mdx formula when calculationType is 'Calculated'`),
  caption: z.string().optional().describe('The caption of calculation measure')
})

export const WidgetStyleSchema = z
  .object({
    component: ComponentStylingSchema.optional().describe('css styling of the widget')
  })
  .optional()
  .describe('The widget styles')

export const EmulatedDeviceSchema = z.object({
  name: z.string().describe('Name of the emulated device'),
  width: z.number().describe('Width (px) of the device'),
  height: z.number().describe('Height (px) of the device'),
})
