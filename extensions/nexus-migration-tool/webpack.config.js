var webpack = require('webpack');

module.exports = {
  entry: './out/index.js',
  target: 'electron-renderer',
  node: { __filename: false, __dirname: false },
  output: {
    libraryTarget: 'commonjs2',
    library: 'gamebryo-plugin-management',
    filename: './dist/index.js'
  },
  module: {
    loaders: [
      { test: /\.json?$/, loader: 'json-loader' },
    ]
  },
  resolve: { extensions: ['', '.js', '.jsx', '.json'] },
  _plugins: [
    new webpack.optimize.UglifyJsPlugin(
        { compress: { warnings: false }, comments: false, sourceMap: false })
  ],
  devtool: 'source-map',
  externals: [
    'bluebird',
    'fs',
    'fs-extra-promise',
    'lodash',
    'net',
    'nmm-api',
    'node',
    'nbind',
    'path',
    'react',
    'react-act',
    'react-addons-update',
    'react-bootstrap',
    'react-dom',
    'react-i18next',
    'react-layout-pane',
    'react-redux',
    'util'
  ]
};