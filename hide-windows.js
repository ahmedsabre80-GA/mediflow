// Forces windowsHide:true on every child process Next.js spawns (kills popup windows)
const cp = require('child_process');
const _spawn = cp.spawn.bind(cp);
const _fork  = cp.fork.bind(cp);

cp.spawn = function(cmd, args, opts) {
  if (typeof args === 'object' && !Array.isArray(args)) { opts = args; args = []; }
  opts = Object.assign({}, opts, { windowsHide: true });
  return _spawn(cmd, args || [], opts);
};

cp.fork = function(mod, args, opts) {
  if (typeof args === 'object' && !Array.isArray(args)) { opts = args; args = []; }
  opts = Object.assign({}, opts, { windowsHide: true });
  return _fork(mod, args || [], opts);
};
