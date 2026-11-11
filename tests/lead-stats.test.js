import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countBy, filterLeads } from '../public/js/lib/lead-stats.js';
import { sampleLeads } from '../public/js/data/sample-leads.js';
import { STAGES, SOURCES } from '../public/js/config/pipeline.js';

const leads = [
  { id: 'DEMO-1', businessName: 'Example Bakery', stage: 'new', source: 'organic' },
  { id: 'DEMO-2', businessName: 'Sample Garage', stage: 'new', source: 'referral' },
  { id: 'DEMO-3', businessName: 'Demo Bakery Two', stage: 'in_review', source: 'organic' },
];

test('countBy tallies leads by any key', () => {
  assert.deepEqual(countBy(leads, 'stage'), { new: 2, in_review: 1 });
  assert.deepEqual(countBy(leads, 'source'), { organic: 2, referral: 1 });
});

test('filterLeads with no filters returns everything', () => {
  assert.equal(filterLeads(leads).length, 3);
});

test('filterLeads combines stage, source and search', () => {
  assert.deepEqual(filterLeads(leads, { stage: 'new', source: 'organic' }).map((l) => l.id), ['DEMO-1']);
  assert.deepEqual(filterLeads(leads, { query: ' bakery ' }).map((l) => l.id), ['DEMO-1', 'DEMO-3']);
  assert.deepEqual(filterLeads(leads, { query: 'demo-2' }).map((l) => l.id), ['DEMO-2']);
});

test('sample leads only use configured stages and sources, and fictional contact details', () => {
  const stages = STAGES.map((s) => s.value);
  const sources = SOURCES.map((s) => s.value);
  for (const lead of sampleLeads()) {
    assert.ok(stages.includes(lead.stage), `${lead.id} stage`);
    assert.ok(sources.includes(lead.source), `${lead.id} source`);
    assert.match(lead.email, /@example\.com$/);
    assert.match(lead.phone, /555-01\d\d$/);
  }
});
