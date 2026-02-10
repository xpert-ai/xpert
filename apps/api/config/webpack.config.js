const { composePlugins, withNx } = require('@nx/webpack')

console.log('Using custom Webpack Config -> __dirname: ' + __dirname);
console.log('Using custom Webpack Config -> process.cwd: ' + process.cwd());

// Nx plugins for webpack.
module.exports = composePlugins(withNx({
  target: 'node', // Target for Node.js
}), (config) => {
    // Watch options
	config.watchOptions = {
		ignored: ['**/node_modules/**', '**/dist/**', '**/public/**/*'], // Ignore unnecessary folders
		aggregateTimeout: 300, // Delay rebuild slightly
		poll: false, // Disable polling
	};
	return config;
})
