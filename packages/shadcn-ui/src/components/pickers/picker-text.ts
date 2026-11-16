const en = {
    locale: 'en-US', date: 'Date', chooseDate: 'Choose a date', time: 'Time', chooseTime: 'Choose a time',
    hour: 'Hour', minute: 'Minute', cancel: 'Cancel', done: 'Done', timeZone: 'Time zone',
    searchTimeZone: 'Search city or time zone', noResults: 'No matches. Try another search.'
}
const zh: typeof en = {
    locale: 'zh-Hans', date: '日期', chooseDate: '选择日期', time: '时间', chooseTime: '选择时间',
    hour: '小时', minute: '分钟', cancel: '取消', done: '完成', timeZone: '时区',
    searchTimeZone: '搜索城市或时区', noResults: '没有匹配结果，请换个关键词。'
}

export function pickerText(locale: string) {
    return /^zh(?:[-_]|$)/i.test(locale) ? zh : en
}
