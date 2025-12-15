let configModule;

if (process.env.NODE_ENV === 'production') {
  configModule = require('./config.production');
} else if (process.env.NODE_ENV === 'development') {
  configModule = require('./config.development');
} else {
  configModule = require('./config.template');
}

export const config = configModule.config;