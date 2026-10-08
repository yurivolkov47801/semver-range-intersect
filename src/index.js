/**
 * Public entry point for the semver-range-intersect library.
 *
 * Re-exports the supported intersection primitives so callers can import either
 * the bundle (`semverRangeIntersect`) or the focused primitives directly.
 */
import {
  intersects,
  intersectRanges,
  parseComparator,
  intersectComparators,
  parseSemVer,
  compareSemVer,
  comparePrerelease,
} from './core.js';

export {
  intersects,
  intersectRanges,
  parseComparator,
  intersectComparators,
  parseSemVer,
  compareSemVer,
  comparePrerelease,
};
