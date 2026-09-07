import { DeleteFileAssetCommand } from '../delete-file-asset.command'
import { DeleteFileAssetHandler } from './delete-file-asset.handler'

it('uses only the ordinary deletion entry', async () => {
    const deletion = { delete: jest.fn(), purgeProjectFile: jest.fn() }
    await new DeleteFileAssetHandler(deletion as never).execute(new DeleteFileAssetCommand('file'))
    expect(deletion.delete).toHaveBeenCalledWith('file')
    expect(deletion.purgeProjectFile).not.toHaveBeenCalled()
})
