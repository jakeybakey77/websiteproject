import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScreeningInsights, buildWorkflowInsights } from '../public/js/lib/lead-insights.js';
import { evaluateLead } from '../public/js/lib/validation-engine.js';
import { validationRules } from '../public/js/config/validation-rules.js';
import { sampleLeads } from '../public/js/data/sample-leads.js';
import { filterLeads } from '../public/js/lib/lead-stats.js';
import { demoLeadsToCSV } from '../public/js/lib/csv-export.js';

const inspected = sampleLeads().map((lead) => ({...lead, validation: evaluateLead(lead, validationRules)}));

test('screening insight counts reconcile to synthetic inquiries and reason flags', () => {
 const summary = buildScreeningInsights(inspected, validationRules);
 assert.equal(summary.total, inspected.length);
 assert.equal(Object.values(summary.byStatus).reduce((a, b) => a+b, 0), inspected.length);
 assert.equal(summary.sources.reduce((a, b) => a+b.inquiries, 0), inspected.length);
 assert.ok(summary.reasons.some((r) => r.code === 'existing-financing-types-missing'));
 for (const source of summary.sources) {
  assert.equal(source.readyForReview + source.needsInfo + source.manualReview, source.inquiries);
 }
});

test('screening filter and reason-code filter can be combined with existing filters', () => {
 const reason = 'existing-financing-types-missing';
 const filtered = filterLeads(inspected, {screening:'needs_info', reason});
 assert.ok(filtered.length > 0);
 assert.ok(filtered.every((lead) => lead.validation.status === 'needs_info' && lead.validation.flags.some((f) => f.ruleId === reason)));
 assert.deepEqual(filterLeads(inspected, {screening:'never'}), []);
});

test('workflow reporting excludes seeded stages from event-based conversion counts', () => {
 const starting = buildWorkflowInsights(inspected);
 assert.equal(starting.reviewed, 0);
 assert.equal(starting.stageChanges, 0);
 assert.equal(starting.simulatedHandoffs, 0);
 assert.equal(starting.funded, null);
 const changed = {...inspected[0], stage:'handed_off', reviewHistory:[
  {stageBefore:'new',stageAfter:'ready_for_handoff',reason:'', note:'',at:'2026-11-11T00:00:00Z'},
  {stageBefore:'ready_for_handoff',stageAfter:'handed_off',reason:'',note:'',at:'2026-11-11T00:01:00Z'},
 ]};
 const after = buildWorkflowInsights([changed,...inspected.slice(1)]);
 assert.equal(after.reviewed,1);
 assert.equal(after.stageChanges,2);
 assert.equal(after.markedForHandoff,1);
 assert.equal(after.simulatedHandoffs,1);
});

test('CSV export contains structured reasons, preliminary screening and no executable formulas',()=>{
 const lead={...inspected[0],followUpReason:'missing_business_details'};
 const csv=demoLeadsToCSV([lead]);
 assert.match(csv,/"screeningStatus"/);
 assert.match(csv,/"screeningReasonCodes"/);
 assert.match(csv,/"missing_business_details"/);
 assert.match(csv,/"ready_for_review"/);
});

test('reporting ignores any non-demo input',()=>{
 const bad={...inspected[0], demo:false};
 assert.equal(buildScreeningInsights([bad],validationRules).total,0);
 assert.equal(buildWorkflowInsights([bad]).inquiries,0);
});
