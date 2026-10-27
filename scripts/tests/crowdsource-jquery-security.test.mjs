import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { jqueryExpression, patchCrowdsourceJQuery, secureCrowdsourceJQuery } from '../../runtimes/crowdsource/patches/jquery-security.mjs';

const vendorUrl = new URL('../../runtimes/crowdsource/patches/vendor/jquery-3.7.1/', import.meta.url);
const vendor = readFileSync(new URL('jquery.min.js', vendorUrl), 'utf8');
const fixture = '(function(){var version="3.3.1";define("jquery",[],function(){return version;});}())';

test('finds the named jQuery expression without confusing other version strings', () => {
  const source = '(function(){return "3.3.1";}()),' + fixture + ';';
  const expression = jqueryExpression(source, '3.3.1');
  assert.ok(expression.source.includes('define("jquery"'));
  assert.equal(source.slice(expression.start, expression.end), expression.source);
  assert.ok(!expression.source.includes('return "3.3.1"'));
});

test('fails closed for missing or duplicate jQuery module definitions', () => {
  assert.throws(() => jqueryExpression('var version="3.3.1";', '3.3.1'), /Expected one/);
  assert.throws(() => jqueryExpression(fixture + ',' + fixture, '3.3.1'), /Expected one/);
});

test('retains the exact official jQuery distribution and license', () => {
  assert.equal(createHash('sha256').update(vendor).digest('hex'), 'fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a');
  assert.equal(createHash('sha256').update(readFileSync(new URL('LICENSE.txt', vendorUrl))).digest('hex'), 'd4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d');
  assert.ok(jqueryExpression(vendor, '3.7.1').source.includes('define("jquery"'));
});

test('refuses changed vendor bytes and unrecognized release expressions', () => {
  assert.throws(() => patchCrowdsourceJQuery(fixture, vendor + ' '), /vendor checksum/);
  assert.throws(() => patchCrowdsourceJQuery(fixture, vendor), /Unrecognized Crowdsource/);
});

test('cannot apply release security changes directly to upstream source', () => {
  assert.throws(() => secureCrowdsourceJQuery(new URL('../../runtimes/crowdsource/upstream/', import.meta.url)), /Cannot patch upstream source/);
});
