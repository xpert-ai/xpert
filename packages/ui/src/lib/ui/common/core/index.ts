import { HttpErrorResponse, HttpParams } from '@angular/common/http'
import {
  booleanAttribute,
  computed,
  Directive,
  EnvironmentProviders,
  HostBinding,
  inject,
  Inject,
  Injectable,
  Input,
  input,
  importProvidersFrom,
  LOCALE_ID,
  Pipe,
  PipeTransform,
  signal,
  Type
} from '@angular/core'
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  MissingTranslationHandler,
  MissingTranslationHandlerParams,
  TranslateLoader,
  TranslateModule,
  TranslateService,
  type TranslationObject
} from '@ngx-translate/core'
import { Observable, Subject, Subscription, isObservable, of } from 'rxjs'

export enum DisplayDensity {
  comfortable = 'comfortable',
  cosy = 'cosy',
  compact = 'compact'
}

@Directive({
  standalone: true,
  selector: '[displayDensity]'
})
export class DensityDirective {
  @Input() displayDensity: DisplayDensity | string

  @HostBinding('class.ngm-density__comfortable')
  get densityCosy(): boolean {
    return this.displayDensity === DisplayDensity.comfortable
  }

  @HostBinding('class.ngm-density__compact')
  get densityCompact(): boolean {
    return this.displayDensity === DisplayDensity.compact
  }

  @HostBinding('class.ngm-density__cosy')
  get densityComfortable(): boolean {
    return this.displayDensity === DisplayDensity.cosy
  }
}

@Directive({
  standalone: true,
  selector: '[ngmDensity],[ngm-density]',
  host: {
    '[class.ngm-density__cosy]': 'cosy()',
    '[class.ngm-density__compact]': 'small()',
    '[class.small]': 'small()',
    '[class.ngm-density__comfortable]': 'large()',
    '[class.large]': 'large()',
    '[class]': 'ngmDensity()'
  }
})
export class NgmDensityDirective {
  readonly ngmDensity = input<string>(null, {
    alias: 'ngm-density'
  })

  readonly small = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly large = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly cosy = computed(() => !this.ngmDensity() && !this.small() && !this.large())
}

@Directive({
  standalone: true,
  selector: '[ngmButtonGroup]',
  host: {
    class: 'ngm-button-group'
  }
})
export class ButtonGroupDirective {}

export type TI18N = {
  zh_Hans?: string
  en_US: string
}

export interface ISelectOption<T = unknown> {
  key?: string
  value?: T
  label?: string
  caption?: string
  selected?: boolean
  icon?: string
}

export type TSelectOption<T = string | number | boolean, K = string> = {
  key?: K
  value: T
  label?: TI18N | string
  icon?: string
  description?: TI18N | string
}

export type TSelectOptionCompareWith<T> = (a: T, b: T) => boolean

const defaultCompareWith = <T>(a: T, b: T) => a === b

export function formatSelectOptionValue(value: unknown): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`
  }

  if (typeof value === 'object') {
    if ('id' in value && value.id != null) {
      return `${value.id}`
    }
    if ('key' in value && value.key != null) {
      return `${value.key}`
    }
    if ('name' in value && value.name != null) {
      return `${value.name}`
    }
    if ('label' in value && value.label != null) {
      return `${value.label}`
    }

    try {
      return JSON.stringify(value)
    } catch {
      return `${value}`
    }
  }

  return `${value}`
}

export function compareSelectOptionValue<T>(
  a: T,
  b: T,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): boolean {
  return compareWith(a, b)
}

export function hasSelectOptionValue<T>(
  values: readonly T[] | null | undefined,
  value: T,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): boolean {
  return values?.some((item) => compareSelectOptionValue(item, value, compareWith)) ?? false
}

export function findMissingSelectOptionValues<T>(
  values: readonly T[] | null | undefined,
  options: readonly TSelectOption<T>[] | null | undefined,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): T[] {
  if (!values?.length) {
    return []
  }

  return values.filter(
    (value) => !options?.some((option) => compareSelectOptionValue(option.value, value, compareWith))
  )
}

export function mergeSelectedValues<T>(
  options: readonly T[] | null | undefined,
  values: readonly T[] | null | undefined,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): T[] {
  const merged = [...(options ?? [])]

  values?.forEach((value) => {
    if (!merged.some((option) => compareSelectOptionValue(option, value, compareWith))) {
      merged.push(value)
    }
  })

  return merged
}

export function buildListboxOptions<T>(
  options: readonly TSelectOption<T>[] | null | undefined,
  values: readonly T[] | null | undefined,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith,
  missingDescription = 'Current value not found, please reselect or clear'
): TSelectOption<T>[] {
  const listboxOptions = [...(options ?? [])]
  const missingValues = findMissingSelectOptionValues(values, listboxOptions, compareWith)

  missingValues.forEach((value, index) => {
    if (!listboxOptions.some((option) => compareSelectOptionValue(option.value, value, compareWith))) {
      const text = formatSelectOptionValue(value)
      listboxOptions.push({
        key: `__missing__:${text}:${index}` as string,
        value,
        label: text,
        description: missingDescription
      })
    }
  })

  return listboxOptions
}

export type NgmFieldAppearance = 'fill' | 'outline' | 'standard' | 'legacy'
export type NgmFloatLabel = 'always' | 'auto' | 'never'
export type NgmFieldColor = 'primary' | 'accent' | 'warn' | null | undefined

export enum DisplayBehaviour {
  descriptionAndId = 'descriptionAndId',
  descriptionOnly = 'descriptionOnly',
  idAndDescription = 'idAndDescription',
  idOnly = 'idOnly',
  auto = ''
}

export interface Property {
  __id__?: string
  uniqueName?: string
  name: string
  caption?: string
  description?: string
}

export interface TreeNodeInterface<T = unknown> {
  key: string
  caption: string
  label?: string
  name?: string
  title?: string
  raw: T
  value?: number
  level?: number
  expand?: boolean
  children?: TreeNodeInterface<T>[]
  parent?: TreeNodeInterface<T>
  isLeaf?: boolean
}

export interface FlatTreeNode<T = unknown> {
  key: string
  caption: string
  name?: string
  label?: string
  value?: number
  level: number
  expandable?: boolean
  childrenCardinality?: number
  raw?: T
}

export function filterTreeNodes<T = unknown>(
  array: TreeNodeInterface<T>[],
  text: string,
  options?: { considerKey?: boolean }
) {
  const normalizedText = text?.trim().toLowerCase()
  if (!normalizedText) {
    return array
  }

  const keywords = normalizedText.split(/\s+/).filter(Boolean)
  const match = (value: string) => {
    if (!value) {
      return false
    }

    const normalizedValue = value.toLowerCase()
    return keywords.some((word) => {
      if (word.includes('*')) {
        const pattern = word.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')
        return new RegExp(`^${pattern}$`).test(normalizedValue)
      }

      return normalizedValue.includes(word)
    })
  }

  const getNodes = (result: TreeNodeInterface<T>[], object: TreeNodeInterface<T>) => {
    const contains = match(object.label) || (options?.considerKey && match(`${object.key}`))
    const children = object.children?.reduce(getNodes, [])

    if (children?.length) {
      result.push({ ...object, children })
    } else if (contains) {
      const { children: _, ...node } = object
      result.push(node)
    }

    return result
  }

  return array.reduce(getNodes, [])
}

export function findTreeNode<T = unknown>(array: TreeNodeInterface<T>[], key: string) {
  const getNodes = (result: TreeNodeInterface<T>, object: TreeNodeInterface<T>) => {
    if (result) {
      return result
    }

    if (object?.key === key) {
      return object
    }

    return object.children?.reduce(getNodes, null)
  }

  return array?.reduce(getNodes, null)
}

export function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim())
}

export function isNumber(value: unknown) {
  return typeof value === 'number' && isFinite(value)
}

export function assign<T extends object>(
  source: T | null | undefined,
  ...params: Array<Partial<T> | null | undefined>
): T {
  return Object.assign(source ?? {}, ...params.map((item) => item ?? {})) as T
}

@Pipe({
  standalone: true,
  name: 'i18n',
  pure: false
})
export class NgmI18nPipe implements PipeTransform {
  private readonly translate = inject(TranslateService)

  transform(value: unknown): string {
    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'object' && value !== null) {
      const dictionary = value as Partial<TI18N>
      return dictionary[mapLanguage(this.translate.currentLang)] ?? dictionary.en_US ?? ''
    }

    return (value ?? '') as string
  }
}

function mapLanguage(language?: string | null): keyof TI18N {
  switch (language) {
    case 'zh':
    case 'zh-CN':
    case 'zh-Hans':
    case 'zh_Hans':
    case 'zh-Hant':
    case 'zh_Hant':
      return 'zh_Hans'
    default:
      return 'en_US'
  }
}

export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') {
    return err
  }

  if (err instanceof HttpErrorResponse) {
    return err.error?.message ?? err.message
  }

  if (err instanceof Error) {
    return err.message
  }

  if (typeof err === 'object' && err !== null && 'error' in err && err.error instanceof Error) {
    return err.error.message
  }

  if (err) {
    return JSON.stringify(err)
  }

  return ''
}

export function toParams(query: Record<string, unknown>) {
  let params = new HttpParams()

  Object.keys(query).forEach((key) => {
    const value = query[key]
    if (isPlainObject(value)) {
      params = toSubParams(params, key, value)
    } else if (value != null) {
      params = params.append(key, String(value))
    }
  })

  return params
}

function toSubParams(params: HttpParams, key: string, object: Record<string, unknown>) {
  Object.keys(object).forEach((childKey) => {
    const value = object[childKey]
    if (isPlainObject(value)) {
      params = toSubParams(params, `${key}[${childKey}]`, value)
    } else if (value != null) {
      params = params.append(`${key}[${childKey}]`, String(value))
    }
  })

  return params
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function splitByHighlight(
  text: string,
  highlight: string | string[]
): Array<{ value: string; match?: boolean }> {
  if (highlight && text) {
    const keywords = (Array.isArray(highlight) ? highlight : highlight.split(/\s+/g)).filter(Boolean)
    if (keywords.length) {
      const pattern = keywords.map(escapeRegExp).join('|')
      const matches = String(text)
        .match(new RegExp(`(${pattern})`, 'ig'))
        ?.map((value) => value.toLowerCase())
      const results = String(text).split(new RegExp(`(${pattern})`, 'i'))

      if (results?.length > 1) {
        return results.map((value) => (matches?.includes(value.toLowerCase()) ? { match: true, value } : { value }))
      }
    }
  }

  return [{ value: text }]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

@Pipe({
  standalone: true,
  name: 'shortNumber'
})
export class NgmShortNumberPipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private readonly locale: string) {}

  transform(value: number | string, locale?: string, factor?: string, shortUnits?: string): [number, string]
  transform(
    value: number | string | null | undefined,
    locale?: string,
    factor?: string,
    shortUnits?: string
  ): [number, string] {
    if (value === null || value === undefined) {
      return null
    }

    return formatShortNumber(value, locale || this.locale, Number(factor), shortUnits)
  }
}

export function formatShortNumber(
  value: number | string,
  locale: string,
  factor?: number,
  shortUnits?: string
): [number, string] {
  try {
    const num = strToNumber(value)
    const localeData = getShortNumberLocale(locale)
    const unitFactor = factor || localeData.shortNumberFactor
    const units = (shortUnits || localeData.shortNumberUnits).split(',').reverse()
    let resultValue = num
    let resultName = ''

    units.every((unitName, index) => {
      const rounder = Math.pow(10, (units.length - index) * unitFactor)
      if (Math.abs(num) >= rounder) {
        resultValue = num / rounder
        resultName = unitName
        return false
      }
      return true
    })

    return [Number(resultValue), resultName]
  } catch (error) {
    throw invalidPipeArgumentError(NgmShortNumberPipe, error instanceof Error ? error.message : `${error}`)
  }
}

function getShortNumberLocale(locale: string): { shortNumberFactor: number; shortNumberUnits: string } {
  const normalizedLocale = locale.toLowerCase().replace(/_/g, '-')

  if (normalizedLocale.startsWith('zh-hant')) {
    return { shortNumberFactor: 4, shortNumberUnits: '萬,億,萬億' }
  }

  if (normalizedLocale.startsWith('zh')) {
    return { shortNumberFactor: 4, shortNumberUnits: '万,亿,万亿' }
  }

  return { shortNumberFactor: 3, shortNumberUnits: 'K,M,B,T,Q' }
}

function strToNumber(value: number | string): number {
  if (typeof value === 'string' && !isNaN(Number(value) - parseFloat(value))) {
    return Number(value)
  }

  if (typeof value !== 'number') {
    throw new Error(`${value} is not a number`)
  }

  return value
}

function invalidPipeArgumentError(type: Type<unknown>, value: string) {
  return Error(`InvalidPipeArgument: '${value}' for pipe '${stringify(type)}'`)
}

function stringify(token: unknown): string {
  if (typeof token === 'string') {
    return token
  }

  if (Array.isArray(token)) {
    return `[${token.map(stringify).join(', ')}]`
  }

  if (token == null) {
    return `${token}`
  }

  if (typeof token === 'function' && token.name) {
    return token.name
  }

  const result = token.toString()
  const newLineIndex = result.indexOf('\n')
  return newLineIndex === -1 ? result : result.substring(0, newLineIndex)
}

export function effectAction<
  ProvidedType = void,
  OriginType extends Observable<ProvidedType> | unknown = Observable<ProvidedType>,
  ObservableType = OriginType extends Observable<infer A> ? A : never,
  ReturnType = ProvidedType | ObservableType extends void
    ? () => void
    : (observableOrValue: ObservableType | Observable<ObservableType>) => Subscription
>(generator: (origin$: OriginType) => Observable<unknown>): ReturnType {
  const destroyed$ = takeUntilDestroyed()
  const origin$ = new Subject<ObservableType>()

  generator(origin$ as OriginType)
    .pipe(destroyed$)
    .subscribe()

  return ((observableOrValue?: ObservableType | Observable<ObservableType>): Subscription => {
    const observable$ = isObservable(observableOrValue) ? observableOrValue : of(observableOrValue)
    return observable$.pipe(destroyed$).subscribe((value) => {
      origin$.next(value as ObservableType)
    })
  }) as ReturnType
}

export enum ThemesEnum {
  default = 'default',
  light = 'light',
  dark = 'dark'
}

export type ThemeHost = ThemesEnum.light | ThemesEnum.dark

export function normalizeTheme(theme?: string | null): ThemesEnum {
  switch (theme) {
    case ThemesEnum.dark:
      return ThemesEnum.dark
    case ThemesEnum.light:
      return ThemesEnum.light
    case ThemesEnum.default:
    case 'system':
    case '':
    case null:
    case undefined:
      return ThemesEnum.default
    case 'thin':
    case 'dark-green':
      return ThemesEnum.dark
    default:
      return ThemesEnum.default
  }
}

export function resolveTheme(theme?: string | null, systemTheme?: string | null): ThemeHost {
  const normalizedTheme = normalizeTheme(theme)
  if (normalizedTheme === ThemesEnum.dark) {
    return ThemesEnum.dark
  }
  if (normalizedTheme === ThemesEnum.light) {
    return ThemesEnum.light
  }

  return normalizeTheme(systemTheme) === ThemesEnum.dark ? ThemesEnum.dark : ThemesEnum.light
}

@Injectable({
  providedIn: 'root'
})
export class NgmThemeService {
  readonly #themeClass$ = signal<string>('')

  readonly themeClass$ = toObservable(this.#themeClass$)
  readonly themeClass = this.#themeClass$.asReadonly()

  constructor() {
    const initialClass = resolveTheme(document.documentElement.dataset['theme'])
    this.#themeClass$.set(initialClass)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const newClass = resolveTheme(document.documentElement.dataset['theme'])
          if (newClass !== this.#themeClass$()) {
            this.#themeClass$.set(newClass)
          }
        }
      }
    })

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
}

export class NgmMissingTranslationHandler implements MissingTranslationHandler {
  handle(params: MissingTranslationHandlerParams) {
    if (params.interpolateParams) {
      return params.interpolateParams['Default'] || params.key
    }
    return params.key
  }
}

class EmptyTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<TranslationObject> {
    return of({})
  }
}

export function provideTranslate(defaultLanguage = 'zh-Hans'): EnvironmentProviders {
  return importProvidersFrom(
    TranslateModule.forRoot({
      missingTranslationHandler: {
        provide: MissingTranslationHandler,
        useClass: NgmMissingTranslationHandler
      },
      loader: {
        provide: TranslateLoader,
        useClass: EmptyTranslateLoader
      },
      defaultLanguage
    })
  )
}
