/**
 * dsh-model-fold — Host half.
 *
 * The plugin is entirely a browser-side concern: it shadows the composer's
 * model-selection seat with a folding variant, so this half has no runtime
 * work. The row still has to mount, because the Web GUI only loads a package's
 * `./client` entry while a live loader row names that package.
 *
 * No `Config` is exported on purpose. Cordis reads an exported `Config` as the
 * schema it validates the row's config against, and a `Config` that is not a
 * schema fails the row — which would take the browser half down with it.
 */

/** Stable cordis plugin name (matches the cordis.patch.yml insert id). */
export const name = 'model-fold'

/** Mount the plugin row; the browser half owns every behaviour. */
export function apply() {}
