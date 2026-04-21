import fs from 'fs';
import {
	resolveDefaultEmailTemplateFolder
} from './default-email-template-path';

describe('resolveDefaultEmailTemplateFolder', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('falls back to the packaged server assets for bundled runtime layouts', () => {
		const cwd = '/srv/xpert';
		const dirname = '/srv/xpert';
		const expected = '/srv/xpert/packages/server/src/core/seeds/data/default-email-templates';

		jest.spyOn(fs, 'existsSync').mockImplementation((candidatePath: fs.PathLike) => {
			return candidatePath === expected;
		});

		expect(resolveDefaultEmailTemplateFolder(cwd, dirname)).toBe(expected);
	});

	it('returns null when no template directory exists', () => {
		jest.spyOn(fs, 'existsSync').mockReturnValue(false);

		expect(resolveDefaultEmailTemplateFolder('/srv/xpert', '/srv/xpert')).toBeNull();
	});
});
