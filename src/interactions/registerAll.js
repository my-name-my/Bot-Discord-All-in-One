/**
 * Interactions registry — loads each feature's component route module so
 * buttons / select menus / modals are wired into the ComponentHandler.
 *
 * The registry is safe to require even when a feature is not yet active:
 * each module only calls componentHandler.registerComponent(), which is a
 * plain Map insertion. Heavy logic is lazy-required inside handlers.
 *
 * Custom ID scheme (spec §23):
 *   "module:action:extra1:extra2"   (buttons & select menus)
 *   "modal:module:action:extra1"    (modals)
 */
const componentHandler = require('../handlers/componentHandler');

// Feature route modules (each calls registerComponent/registerModal)
const modules = [
  require('./tickets'),
  require('./giveaways'),
  require('./roleMenus'),
];

/** Called from index.js at boot to register every route. */
function registerAll() {
  for (const mod of modules) {
    if (typeof mod?.register === 'function') mod.register(componentHandler);
  }
}

registerAll();

module.exports = { registerAll };
