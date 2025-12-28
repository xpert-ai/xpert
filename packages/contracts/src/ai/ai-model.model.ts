import { AiModelTypeEnum } from '../agent/index'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { I18nObject } from '../types'
import { ICopilot } from './copilot.model'


export interface IAiModel extends IBasePerTenantAndOrganizationEntityModel {
  /**
   * Model name
   */
  name: string

  /**
   * Model display name
   */
  label: string

  /**
   * Model type
   */
  modelType: string

  /**
   * Model features
   */
  features: string[]

  /**
   * Model properties
   */
  modelProperties: Record<string, any>

  /**
   * Parameter rules
   */
  parameterRules: Record<string, any>[]

  /**
   * Pricing information
   */
  pricing: {
    input: string
    output: string
    unit: string
    currency: string
  }

  /**
   * Deprecated
   */
  deprecated: boolean
}

export enum ProviderType {
  CUSTOM = 'custom',
  SYSTEM = 'system'
}

export interface ICopilotWithProvider extends ICopilot {
  providerWithModels: Partial<IAiProviderEntity>
}

export interface IAiProviderEntity {
  provider: string;
  label: I18nObject;
  description: I18nObject;
  icon_small: I18nObject;
  icon_large: I18nObject;
  background: string;
  help: ProviderHelpInfo;
  supported_model_types: AiModelTypeEnum[];
  configurate_methods: ConfigurateMethod[];
  model_credential_schema: ModelCredentialSchema;
  provider_credential_schema: ProviderCredentialSchema;
  models: ProviderModel[]
  /**
   * Not yet implemented, your contribution is needed
   */
  not_implemented?: boolean
}

export interface ProviderHelpInfo {
  title: I18nObject;
  url: I18nObject;
}

export interface ProviderModel {
  model: string;
  label: I18nObject;
  model_type: AiModelTypeEnum;
  features?: ModelFeature[];
  fetch_from: FetchFrom;
  model_properties: Partial<Record<ModelPropertyKey, any>>;
  deprecated?: boolean;
  modelConfig?: any;
}

export interface ProviderCredentialSchema {
  credential_form_schemas: CredentialFormSchema[];
}

/**
 * @todo Use JSON Schema to implement
 */
export enum CredentialFormTypeEnum {
  TEXT_INPUT = "text-input",
  SECRET_INPUT = "secret-input",
  SELECT = "select",
  RADIO = "radio",
  // SWITCH = "switch", // use ParameterType.BOOLEAN
}

export interface CredentialFormSchema {
  variable: string;
  label: I18nObject;
  type: CredentialFormTypeEnum | ParameterType
  required: boolean;
  default?: number | string | boolean
  options?: {
    label: I18nObject
    value: number | string | boolean
    show_on?: FormShowOnObject[]
  }[]
  placeholder: I18nObject;

  max_length?: number
  show_on?: FormShowOnObject[]
}

export interface FormShowOnObject {
  variable: string
  value: string
}

export enum FetchFrom {
  PREDEFINED_MODEL = "predefined-model",
  CUSTOMIZABLE_MODEL = "customizable-model"
}

export enum ModelFeature {
  TOOL_CALL = "tool-call",
  MULTI_TOOL_CALL = "multi-tool-call",
  AGENT_THOUGHT = "agent-thought",
  VISION = "vision",
  STREAM_TOOL_CALL = "stream-tool-call",
  VIDEO = "video",
  STRUCTURED_OUTPUT = "structured-output"
}

export enum ModelPropertyKey {
  MODE = "mode",
  CONTEXT_SIZE = "context_size",
  MAX_CHUNKS = "max_chunks",
  FILE_UPLOAD_LIMIT = "file_upload_limit",
  SUPPORTED_FILE_EXTENSIONS = "supported_file_extensions",
  MAX_CHARACTERS_PER_CHUNK = "max_characters_per_chunk",
  DEFAULT_VOICE = "default_voice",
  VOICES = "voices",
  WORD_LIMIT = "word_limit",
  AUDIO_TYPE = "audio_type",
  MAX_WORKERS = "max_workers"
}

export enum ConfigurateMethod {
  PREDEFINED_MODEL = 'predefined-model',
  CUSTOMIZABLE_MODEL = 'customizable-model'
}

/**
 * @todo Use JSON Schema to implement
 */
export enum ParameterType {
  FLOAT = "float",
  INT = "int",
  STRING = "string",
  BOOLEAN = "boolean",
  TEXT = "text"
}

/**
 * @todo Use JSON Schema to implement
 */
export interface ParameterRule {
  name?: string;
  useTemplate?: string;
  label: I18nObject;
  type: ParameterType;
  help?: I18nObject;
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  precision?: number;
  options?: string[];
}

export interface PriceConfig {
  input: number;
  output?: number;
  unit: number;
  currency: string;
}

export interface AIModelEntity extends ProviderModel {
  parameter_rules?: ParameterRule[]
  pricing?: PriceConfig
}

export interface FieldModelSchema {
  label: I18nObject
  placeholder?: I18nObject
}
    

export interface ModelCredentialSchema {
  model: FieldModelSchema
  credential_form_schemas: CredentialFormSchema[]
}

export const AI_MODEL_TYPE_VARIABLE = "__model_type"

export enum PriceType {
  INPUT = "input",
  OUTPUT = "output"
}

export interface PriceInfo {
  unitPrice: number;
  unit: number;
  totalAmount: number;
  currency: string;
}
