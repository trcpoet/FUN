// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-syntax-import-assertions'], // sometimes needed
      ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
    ],
  };
};
