import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  intersects,
  intersectRanges,
  parseComparator,
  intersectComparators,
  parseSemVer,
  compareSemVer,
  comparePrerelease,
} from '../src/index.js';

test('exact version ranges intersect with themselves', () => {
  assert.equal(intersects('1.2.3', '1.2.3'), true);
});

test('exact version ranges do not intersect with different versions', () => {
  assert.equal(intersects('1.2.3', '1.2.4'), false);
});

test('caret ranges overlap when they share releases', () => {
  assert.equal(intersects('^1.2.0', '^1.3.0'), true);
});

test('caret ranges on different majors do not intersect', () => {
  assert.equal(intersects('^1.2.0', '^2.0.0'), false);
});

test('tilde range is bounded by the next minor', () => {
  assert.equal(intersects('~1.2.0', '~1.2.5'), true);
  assert.equal(intersects('~1.2.0', '~1.3.0'), false);
});

test('greater-than and less-than overlap', () => {
  assert.equal(intersects('>1.0.0', '<2.0.0'), true);
});

test('greater-than and less-than do not overlap when reversed', () => {
  assert.equal(intersects('>2.0.0', '<1.0.0'), false);
});

test('inclusive bounds that meet at the same version intersect', () => {
  assert.equal(intersects('>=1.0.0', '<=1.0.0'), true);
});

test('exclusive lower bound meeting inclusive upper bound does not intersect', () => {
  assert.equal(intersects('>1.0.0', '<=1.0.0'), false);
});

test('caret with an explicit upper bound is still checked pairwise', () => {
  assert.equal(intersects('^1.0.0 <1.5.0', '>=1.4.0'), true);
  assert.equal(intersects('^1.0.0 <1.5.0', '>=1.5.0'), false);
});

test('overlapping caret and tilde within the same minor', () => {
  assert.equal(intersects('^1.2.0', '~1.2.5'), true);
});

test('caret on 0.0.x pins the patch', () => {
  // ^0.0.3 is effectively >=0.0.3 <0.0.4, so it does not include 0.0.2.
  assert.equal(intersects('^0.0.3', '0.0.2'), false);
  assert.equal(intersects('^0.0.3', '0.0.3'), true);
});

test('caret on 0.x pins the minor', () => {
  // ^0.2.0 is >=0.2.0 <0.3.0.
  assert.equal(intersects('^0.2.0', '0.3.0'), false);
  assert.equal(intersects('^0.2.0', '0.2.5'), true);
});

test('prerelease ordering: numeric before alphanumeric at same index', () => {
  const a = parseSemVer('1.0.0-1');
  const b = parseSemVer('1.0.0-alpha');
  assert.equal(compareSemVer(a, b), -1);
});

test('prerelease ordering: release outranks prerelease', () => {
  const a = parseSemVer('1.0.0');
  const b = parseSemVer('1.0.0-alpha');
  assert.equal(compareSemVer(a, b), 1);
});

test('comparePrerelease: identical prereleases are equal', () => {
  assert.equal(comparePrerelease(['alpha', 1], ['alpha', 1]), 0);
});

test('comparePrerelease: shorter prerelease is lower when it is a prefix', () => {
  assert.equal(comparePrerelease(['alpha'], ['alpha', 1]), -1);
});

test('caret upper bound excludes prereleases of the next major', () => {
  // ^1.0.0 is >=1.0.0 <2.0.0-0, so 2.0.0-alpha is excluded.
  assert.equal(intersects('^1.0.0', '>=2.0.0-alpha'), false);
});

test('tilde upper bound excludes prereleases of the next minor', () => {
  // ~1.2.0 is >=1.2.0 <1.3.0-0, so 1.3.0-beta is excluded.
  assert.equal(intersects('~1.2.0', '>=1.3.0-beta'), false);
});

test('parseComparator rejects malformed input', () => {
  assert.equal(parseComparator('>=abc'), null);
  assert.equal(parseComparator(''), null);
  assert.equal(parseComparator('1.2.3.4'), null);
});

test('parseComparator handles bare version as equality pair', () => {
  const pair = parseComparator('1.2.3');
  assert.equal(pair.length, 2);
  assert.equal(pair[0].operator, '>=');
  assert.equal(pair[1].operator, '<=');
});

test('intersectComparators handles two lower bounds', () => {
  const a = parseComparator('>=1.0.0')[0];
  const b = parseComparator('>=2.0.0')[0];
  assert.equal(intersectComparators(a, b), true);
});

test('intersectComparators handles two upper bounds', () => {
  const a = parseComparator('<=1.0.0')[0];
  const b = parseComparator('<=2.0.0')[0];
  assert.equal(intersectComparators(a, b), true);
});

test('intersectRanges returns false on unparseable input', () => {
  assert.equal(intersectRanges('garbage', '1.0.0'), false);
  assert.equal(intersectRanges('1.0.0', ''), false);
});

test('parseSemVer rejects leading zeros in numeric release parts', () => {
  assert.equal(parseSemVer('01.2.3'), null);
  assert.equal(parseSemVer('1.02.3'), null);
});

test('parseSemVer parses build metadata', () => {
  const v = parseSemVer('1.2.3+build.42');
  assert.equal(v.build, 'build.42');
  assert.equal(v.major, 1);
});

test('caret on major 0 with no minor expands to 0.x', () => {
  // ^0 expands to >=0.0.0 <1.0.0-0.
  assert.equal(intersects('^0', '0.5.0'), true);
  assert.equal(intersects('^0', '1.0.0'), false);
});
