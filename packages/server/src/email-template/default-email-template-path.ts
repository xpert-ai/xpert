import fs from 'fs';
import path from 'path';

const DEFAULT_EMAIL_TEMPLATE_PATH_SEGMENTS = [
	'core',
	'seeds',
	'data',
	'default-email-templates'
] as const;

export function resolveDefaultEmailTemplateFolder(
	cwd = process.cwd(),
	dirname = __dirname
): string | null {
	const candidates = [
		path.join(dirname, '../', ...DEFAULT_EMAIL_TEMPLATE_PATH_SEGMENTS),
		path.resolve(cwd, 'packages', 'server', 'src', ...DEFAULT_EMAIL_TEMPLATE_PATH_SEGMENTS),
		path.resolve(cwd, 'dist', 'packages', 'server', 'src', ...DEFAULT_EMAIL_TEMPLATE_PATH_SEGMENTS),
		path.resolve(cwd, 'packages', 'server', 'dist', 'src', ...DEFAULT_EMAIL_TEMPLATE_PATH_SEGMENTS),
		path.resolve(cwd, 'data', 'default-email-templates')
	];

	return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
