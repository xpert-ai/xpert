import { TestBed } from '@angular/core/testing'
import { registerLocaleData } from '@angular/common'
import { registerLocaleData as zRegisterLocaleData } from '../i18n/locale_data_api'
import localeZh from '@angular/common/locales/zh-Hans'
import zLocaleZh from '../locales/zh-Hans'
import { LOCALE_ID } from '@angular/core'
import { formatShortNumber, ShortNumberPipe } from './short-number.pipe'

describe('ShortNumberPipe test', () => {
    const number = 3434324.2342
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: LOCALE_ID,
                    useValue: 'zh-Hans',
                },
                ShortNumberPipe,
            ]
        })
        // 标准语言参数发布
        registerLocaleData(localeZh, 'zh-Hans', zLocaleZh)
        // 自定义语言参数发布
        zRegisterLocaleData(zLocaleZh, 'zh-Hans')
    })

    it('shortnumber test', () => {
        const shortNumber = TestBed.inject(ShortNumberPipe)
        expect(shortNumber.transform(number, 'zh-Hans', '3', 'K,M,B,T,Q')).toEqual([3.4343242342, 'M'])
    })

    it('#formatShortNumber', () => {
        expect(formatShortNumber(-1, 'zh-Hans')).toEqual([-1, ""])
    })
})
