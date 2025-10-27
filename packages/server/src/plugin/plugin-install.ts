import chalk from 'chalk';
import { execSync } from 'child_process'


/**
 * Install plugins configured (via environment variables) during development 
 */
export function installPlugins() {
    const plugins = process.env.PLUGINS?.split(/[,;]/).filter(Boolean) || [];
    // Install plugins
    if (plugins.length > 0) {
        process.stdout.write('Installing plugins: ')
        for (const plugin of plugins) {
            process.stdout.write(chalk.bgBlue(plugin) + ' ')
        }
        process.stdout.write('\n')
        try {
            execSync(`npm install --legacy-peer-deps --no-save ${plugins.join(' ')}`, { stdio: 'inherit' });
            console.log(chalk.green(`Installed plugins: ${plugins.join(', ')}`));
        } catch (error) {
            console.error('Failed to install plugins via npm:', error);
        }
    }
}