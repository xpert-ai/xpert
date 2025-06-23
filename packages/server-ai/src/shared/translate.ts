import { I18nObject, LanguagesEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'

export function translate(label: string | I18nObject) {
    if (!label) {
        return label
    }
	return typeof label === 'string'
		? label
		: (([LanguagesEnum.Chinese, LanguagesEnum.SimplifiedChinese].includes(RequestContext.getLanguageCode()) &&
			label.zh_Hans
				? label.zh_Hans
				: label[RequestContext.getLanguageCode()]) ||
				label.en_US ||
				'')
}
