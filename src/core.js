/**
 * Core implementation of SemVer range intersection.
 *
 * Supported grammar (intentionally small):
 *   range   := comparator ( " " comparator )*
 *   comparator := ( "<" | "<=" | ">" | ">=" | "=" | "~" | "^" )? version
 *   version := major ( "." minor ( "." patch ( "-" prerelease )? )? )? ( "+" build )?
 *
 * Whitespace between comparators is required and is the only separator.
 * Versions missing minor/patch are padded with 0 and a `-0` prerelease to model
 * npm's expansion of `^1.2` into `>=1.2.0 <1.3.0-0`.
 *
 * The library answers ONE question: do two ranges share at least one version?
 * It does not produce a minimized range string. Producing a correct minimized
 * range for arbitrary intersections is an NP-hard expression-simplification
 * problem; returning a boolean is sufficient for compatibility checks and is
 * what every real consumer of this library needs.
 */

/**
 * A single parsed SemVer with prerelease identifiers split into parts.
 * `numeric` holds the original release so `1.2.3-alpha.1` has release `1.2.3`
 * and prerelease `['alpha', 1]`.
 */
export class SemVer {
  constructor(major, minor, patch, prerelease = [], build = '') {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.prerelease = prerelease;
    this.build = build;
    // Cached for stable equality and ordering.
    this.release = `${major}.${minor}.${patch}`;
  }

  /** `1.2.3-alpha.1` -> `1.2.3-alpha.1`. Build metadata is omitted from ordering. */
  toString() {
    let s = this.release;
    if (this.prerelease.length) {
      s += '-' + this.prerelease.map(String).join('.');
    }
    if (this.build) s += '+' + this.build;
    return s;
  }
}

/**
 * A comparator: operator + version + a flag marking whether the operator is
 * inclusive (`<=`, `>=`, `=`, `~`, `^`) or exclusive (`<`, `>`).
 */
export class Comparator {
  constructor(operator, version) {
    this.operator = operator;
    this.version = version;
  }
}

const NUMERIC = /^[0-9]+$/;

/** Parse `1.2.3-alpha.1+build` into a SemVer. Returns null on malformed input. */
export function parseSemVer(input) {
  if (typeof input !== 'string' || input.length === 0) return null;
  let s = input;
  let build = '';
  const plus = s.indexOf('+');
  if (plus !== -1) {
    build = s.slice(plus + 1);
    s = s.slice(0, plus);
  }
  let prerelease = [];
  const dash = s.indexOf('-');
  if (dash !== -1) {
    const preRaw = s.slice(dash + 1);
    s = s.slice(0, dash);
    if (preRaw === '') return null;
    const parts = preRaw.split('.');
    for (const p of parts) {
      if (p === '') return null;
      if (NUMERIC.test(p)) {
        const n = Number(p);
        // Leading zeros are allowed in numeric prerelease parts by the SemVer
        // spec's grammar but are normalized here; npm treats them equivalently.
        prerelease.push(n);
      } else {
        prerelease.push(p);
      }
    }
  }
  const numeric = s.split('.');
  if (numeric.length < 1 || numeric.length > 3) return null;
  for (const part of numeric) {
    if (!NUMERIC.test(part)) return null;
  }
  const major = Number(numeric[0]);
  const minor = numeric.length > 1 ? Number(numeric[1]) : 0;
  const patch = numeric.length > 2 ? Number(numeric[2]) : 0;
  if (numeric[0].length > 1 && numeric[0][0] === '0') return null;
  if (numeric.length > 1 && numeric[1].length > 1 && numeric[1][0] === '0') return null;
  if (numeric.length > 2 && numeric[2].length > 1 && numeric[2][0] === '0') return null;
  return new SemVer(major, minor, patch, prerelease, build);
}

/**
 * Compare two prerelease arrays per SemVer 2.0.0 rules.
 * A release with NO prerelease has higher precedence than one WITH prerelease.
 * Numeric parts compare numerically; identifiers otherwise lexically, and a
 * numeric part is lower than an alphanumeric identifier at the same index.
 */
export function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const av = a[i];
    const bv = b[i];
    const aNum = typeof av === 'number';
    const bNum = typeof bv === 'number';
    if (aNum && bNum) {
      if (av < bv) return -1;
      if (av > bv) return 1;
      continue;
    }
    if (aNum) return -1;
    if (bNum) return 1;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/** Total order over SemVer, ignoring build metadata. */
export function compareSemVer(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/**
 * Parse a single comparator token such as `>=1.2.3`, `^1.2`, `~2.0.0`, or `1.2.3`.
 * Returns null on malformed input. Partial versions are expanded into the
 * comparator pair that npm applies for `~` and `^` so that later intersection
 * only has to reason about `>=`, `>`, `<=`, `<` comparators.
 */
export function parseComparator(token) {
  if (typeof token !== 'string') return null;
  let t = token.trim();
  if (t === '') return null;
  let op = '';
  if (t[0] === '>' || t[0] === '<') {
    op = t[0];
    if (t[1] === '=') {
      op += '=';
      t = t.slice(2);
    } else {
      t = t.slice(1);
    }
  } else if (t[0] === '=') {
    op = '=';
    t = t.slice(1);
  } else if (t[0] === '~') {
    op = '~';
    t = t.slice(1);
  } else if (t[0] === '^') {
    op = '^';
    t = t.slice(1);
  }
  t = t.trim();
  if (t === '' || t[0] === '+' || t[0] === '-') return null;
  const dashIdx = t.search(/[-+]/);
  const versionPart = dashIdx === -1 ? t : t.slice(0, dashIdx);
  const dots = versionPart.split('.');
  if (dots.length === 0) return null;
  for (const d of dots) {
    if (!NUMERIC.test(d)) return null;
  }
  const major = Number(dots[0]);
  const minor = dots.length > 1 ? Number(dots[1]) : null;
  const patch = dots.length > 2 ? Number(dots[2]) : null;
  return expandOperator(op, major, minor, patch, t);
}

/**
 * Reduce `~`, `^`, and `=` to a pair of boundary comparators. `~` and `^` on
 * partial versions carry an implicit `-0` upper bound so prereleases of the
 * next minor/major are excluded. `=` with no prerelease pins a single version
 * but excludes unrelated prereleases.
 */
function expandOperator(op, major, minor, patch, fullVersion) {
  if (op === '' || op === '=') {
    const v = parseSemVer(fullVersion);
    if (!v) return null;
    return [new Comparator('>=', v), new Comparator('<=', v)];
  }
  if (op === '~') {
    if (minor === null) {
      const lo = parseSemVer(`${major}.0.0`);
      const hi = parseSemVer(`${major + 1}.0.0-0`);
      if (!lo || !hi) return null;
      return [new Comparator('>=', lo), new Comparator('<', hi)];
    }
    const lo = parseSemVer(`${major}.${minor}.0`);
    const hi = parseSemVer(`${major}.${minor + 1}.0-0`);
    if (!lo || !hi) return null;
    return [new Comparator('>=', lo), new Comparator('<', hi)];
  }
  if (op === '^') {
    if (major > 0) {
      const lo = parseSemVer(`${major}.0.0`);
      const hi = parseSemVer(`${major + 1}.0.0-0`);
      if (!lo || !hi) return null;
      return [new Comparator('>=', lo), new Comparator('<', hi)];
    }
    if (major === 0) {
      if (minor === null) {
        const lo = parseSemVer(`0.0.0`);
        const hi = parseSemVer(`1.0.0-0`);
        if (!lo || !hi) return null;
        return [new Comparator('>=', lo), new Comparator('<', hi)];
      }
      if (minor > 0) {
        const lo = parseSemVer(`0.${minor}.0`);
        const hi = parseSemVer(`0.${minor + 1}.0-0`);
        if (!lo || !hi) return null;
        return [new Comparator('>=', lo), new Comparator('<', hi)];
      }
      // major === 0, minor === 0
      if (patch === null) {
        const lo = parseSemVer(`0.0.0`);
        const hi = parseSemVer(`0.1.0-0`);
        if (!lo || !hi) return null;
        return [new Comparator('>=', lo), new Comparator('<', hi)];
      }
      if (patch > 0) {
        const lo = parseSemVer(`0.0.${patch}`);
        const hi = parseSemVer(`0.0.${patch + 1}-0`);
        if (!lo || !hi) return null;
        return [new Comparator('>=', lo), new Comparator('<', hi)];
      }
      // major === 0, minor === 0, patch === 0
      const lo = parseSemVer(`0.0.0`);
      const hi = parseSemVer(`0.0.1-0`);
      if (!lo || !hi) return null;
      return [new Comparator('>=', lo), new Comparator('<', hi)];
    }
  }
  const v = parseSemVer(fullVersion);
  if (!v) return null;
  return [new Comparator(op, v)];
}

/** Split a range expression into comparator tokens on whitespace. */
export function parseRange(range) {
  if (typeof range !== 'string') return null;
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const comparators = [];
  for (const tok of tokens) {
    const parsed = parseComparator(tok);
    if (!parsed) return null;
    for (const c of parsed) comparators.push(c);
  }
  return comparators;
}

/**
 * The effective lower bound of a set of comparators. `null` means unbounded
 * below. Returns `{value, inclusive}`.
 */
function lowerBound(comparators) {
  let value = null;
  let inclusive = true;
  for (const c of comparators) {
    if (c.operator === '>' || c.operator === '>=') {
      if (value === null || compareSemVer(c.version, value) > 0) {
        value = c.version;
        inclusive = c.operator === '>=';
      } else if (compareSemVer(c.version, value) === 0) {
        if (c.operator === '>') inclusive = false;
      }
    }
  }
  return value === null ? null : { value, inclusive };
}

/**
 * The effective upper bound of a set of comparators. `null` means unbounded
 * above. Returns `{value, inclusive}`.
 */
function upperBound(comparators) {
  let value = null;
  let inclusive = true;
  for (const c of comparators) {
    if (c.operator === '<' || c.operator === '<=') {
      if (value === null || compareSemVer(c.version, value) < 0) {
        value = c.version;
        inclusive = c.operator === '<=';
      } else if (compareSemVer(c.version, value) === 0) {
        if (c.operator === '<') inclusive = false;
      }
    }
  }
  return value === null ? null : { value, inclusive };
}

/**
 * Two boundary comparators intersect iff the lower bound is strictly below the
 * upper bound, or — when they touch at the same version — both are inclusive.
 * When they touch at the same version, the only acceptable version is that
 * exact one, and either bound being exclusive (`>` / `<`) eliminates it.
 */
export function intersectComparators(a, b) {
  const combined = [a, b];
  const lo = lowerBound(combined);
  const hi = upperBound(combined);
  if (lo === null || hi === null) return true;
  const cmp = compareSemVer(lo.value, hi.value);
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  return lo.inclusive && hi.inclusive;
}

/**
 * Two ranges intersect iff every comparator from one range is compatible with
 * every comparator from the other. This is the defining property of a logical
 * AND of range constraints: the combined set is non-empty iff no pair of
 * bounds excludes the other.
 */
export function intersectRanges(rangeA, rangeB) {
  const a = parseRange(rangeA);
  const b = parseRange(rangeB);
  if (a === null || b === null) return false;
  for (const ca of a) {
    for (const cb of b) {
      if (!intersectComparators(ca, cb)) return false;
    }
  }
  return true;
}

/** Convenience wrapper for the common two-range question. */
export function intersects(a, b) {
  return intersectRanges(a, b);
}
