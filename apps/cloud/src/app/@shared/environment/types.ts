import { TEnvironmentVariable, TSelectOption } from "@cloud/app/@core/types";

export const VariableTypeOptions: TSelectOption<TEnvironmentVariable['type']>[] = [
    {
      value: 'default',
      label: {
        en_US: 'Default',
        zh_Hans: '默认'
      }
    },
    {
      value: 'secret',
      label: {
        en_US: 'Secret',
        zh_Hans: '密钥'
      }
    }
  ]