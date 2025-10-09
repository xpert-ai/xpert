import { TDocumentTransformerConfig, TDocumentTransformerResult } from '@xpert-ai/plugin-sdk'

export const Default = 'default'
export const Text = 'text'

export const icon = `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 421 511.605"><path fill="#6DBF39" d="M95.705.014h199.094L421 136.548v317.555c0 31.54-25.961 57.502-57.502 57.502H95.705c-31.55 0-57.502-25.873-57.502-57.502V57.515C38.203 25.886 64.076.014 95.705.014z"/><path fill="#589B2E" d="M341.028 133.408h-.019L421 188.771v-52.066h-54.357c-9.458-.15-17.998-1.274-25.615-3.297z"/><path fill="#DFFACD" d="M294.8 0L421 136.533v.172h-54.357c-45.068-.718-69.33-23.397-71.843-61.384V0z"/><path fill="#4F8C29" fill-rule="nonzero" d="M0 431.901V253.404l.028-1.261c.668-16.446 14.333-29.706 30.936-29.706h7.238v50.589h342.975c12.862 0 23.373 10.51 23.373 23.371v135.504c0 12.83-10.543 23.373-23.373 23.373H23.373C10.541 455.274 0 444.75 0 431.901z"/><path fill="#4F8C29" fill-rule="nonzero" d="M143.448 240.364a8.496 8.496 0 01-8.496-8.497 8.496 8.496 0 018.496-8.497h163.176a8.496 8.496 0 018.496 8.497 8.496 8.496 0 01-8.496 8.497H143.448zm0-59.176a8.496 8.496 0 010-16.993h172.304a8.496 8.496 0 110 16.993H143.448z"/><path fill="#fff" fill-rule="nonzero" d="M11.329 276.171v154.728c0 7.793 6.38 14.178 14.179 14.178H380.175c7.799 0 14.178-6.379 14.178-14.178V297.405c0-7.798-6.388-14.178-14.178-14.178H37.892c-12.618-.096-19.586-1.638-26.563-7.056z"/><path fill="#1A1A1A" fill-rule="nonzero" d="M158.472 340.642h-18.999v60.929h-26.206v-60.929H94.268v-20.965h64.204v20.965zm35.33-20.965l9.041 21.883h1.31l9.04-21.883h28.434l-18.214 39.571 18.214 42.323h-29.089l-9.826-23.585h-1.18l-9.695 23.585h-27.779l17.819-41.535-17.819-40.359h29.744zm117.613 20.965h-19v60.929H266.21v-60.929h-19v-20.965h64.205v20.965z"/></svg>`


export type TDocumentParseResult = TDocumentTransformerResult & {
  metadata: TDocumentTransformerResult['metadata'] & {
    parser: 'default'
  }
}

export type TDefaultTransformerConfig = TDocumentTransformerConfig
