/**
 * Node half of the realtime-tps-pet plugin. The browser half in `src/client/`
 * owns every contribution; this entry exists so the package appears as an
 * ordinary Loader row.
 * @module dsh-realtime-tps-pet
 */

/** Loader-visible no-op body; the browser half carries the feature. */
export function apply(): void {}
