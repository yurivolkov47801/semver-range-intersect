# semver-range-intersect

Computes whether two Semantic Versioning range expressions share at least one version. Returns a boolean; it does not produce a minimized range string.

## Usage

```js
import { intersects, intersectRanges } from 'semver-range-intersect';

intersects('^1.2.0', '~1.2.5');        // true
intersectRanges('>=1.0.0 <2.0.0', '1.5.0'); // true
```

Exports: `intersects(a, b)`, `intersectRanges(a, b)`, `parseComparator(token)`, `intersectComparators(a, b)`, plus the `SemVer` and `Comparator` classes.

## Why

Dependency resolution tools repeatedly need to answer "do these two constraints have any version in common?" Full npm-style range resolution pulls in a large grammar (hyphen ranges, `x` wildcards, OR groups) and a minimized-range emitter. This library answers only the compatibility question for the comparators npm expands `~` and `^` into, which covers the vast majority of real-world `package.json` constraints. The trade-off is a smaller grammar in exchange for zero dependencies and a code surface small enough to audit by hand.

## Edge cases

Partial versions like `^1.2` and `~2` are expanded to comparator pairs with an upper bound of `<next-0` (for example `^1.2` becomes `>=1.2.0 <1.3.0-0`), which excludes prereleases of the next minor or major. Build metadata is parsed but ignored for ordering, per the SemVer spec. Bare versions without an operator (`1.2.3`) are treated as exact pins: `>=1.2.3 <=1.2.3`.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

