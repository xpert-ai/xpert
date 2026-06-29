import { ToolProviderDTO } from './tool-provider.dto'

describe('ToolProviderDTO', () => {
    it('includes encoded organization id in generated builtin icon avatar urls', () => {
        const dto = new ToolProviderDTO(
            {
                name: 'custom-provider'
            },
            'https://api.example.com',
            'org 1/2'
        )

        expect(dto.avatar).toEqual({
            url: 'https://api.example.com/api/xpert-toolset/builtin-provider/custom-provider/icon?org=org%201%2F2'
        })
    })
})
