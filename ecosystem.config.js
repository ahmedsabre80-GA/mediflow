const next = 'D:/mediflow/node_modules/next/dist/bin/next';
const nodeOpts = '--require D:/mediflow/hide-windows.js';

module.exports = {
  apps: [
    {
      name: 'patient',
      cwd: 'D:/mediflow/apps/web-patient',
      script: next,
      args: 'dev --port 3000',
      watch: false,
      windowsHide: true,
      env: { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NO_UPDATE_NOTIFIER: '1', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NODE_OPTIONS: nodeOpts },
    },
    {
      name: 'pharmacy',
      cwd: 'D:/mediflow/apps/web-pharmacy',
      script: next,
      args: 'dev --port 3001',
      watch: false,
      windowsHide: true,
      env: { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NO_UPDATE_NOTIFIER: '1', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NODE_OPTIONS: nodeOpts },
    },
    {
      name: 'admin',
      cwd: 'D:/mediflow/apps/web-admin',
      script: next,
      args: 'dev --port 3002',
      watch: false,
      windowsHide: true,
      env: { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NO_UPDATE_NOTIFIER: '1', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NODE_OPTIONS: nodeOpts },
    },
    {
      name: 'doctor',
      cwd: 'D:/mediflow/apps/web-doctor',
      script: next,
      args: 'dev --port 3003',
      watch: false,
      windowsHide: true,
      env: { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NO_UPDATE_NOTIFIER: '1', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NODE_OPTIONS: nodeOpts },
    },
    {
      name: 'warehouse',
      cwd: 'D:/mediflow/apps/web-warehouse',
      script: next,
      args: 'dev --port 3004',
      watch: false,
      windowsHide: true,
      env: { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NO_UPDATE_NOTIFIER: '1', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NODE_OPTIONS: nodeOpts },
    },
  ],
};
