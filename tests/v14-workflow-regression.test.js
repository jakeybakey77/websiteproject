import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDemoReview, allowedNextStages, SCREENING_EXCEPTION_REASON, MAX_REVIEW_HISTORY } from '../public/js/lib/review-workflow.js';
import { buildWorkflowInsights } from '../public/js/lib/lead-insights.js';
import { evaluateLead } from '../public/js/lib/validation-engine.js';
import { validationRules } from '../public/js/config/validation-rules.js';
import { sampleLeads } from '../public/js/data/sample-leads.js';

const clean = {id:'DEMO-CLEAN', demo:true, stage:'new', industry:'retail', state:'CT', timeInBusiness:'over_5y', monthlyRevenue:50000, amountRequested:15000, useOfFunds:'inventory', hasExistingFinancing:'no'};
const at = '2026-11-11T09:00:00.000Z';

test('stage progression only allows configured transitions; closed stays closed', () => {
  assert.deepEqual(allowedNextStages('closed'), ['closed']);
  assert.throws(() => applyDemoReview(clean, {stage:'handed_off'}, at), /not permitted/);
  assert.throws(() => applyDemoReview(clean, {stage:'ready_for_handoff'}, at), /not permitted/);
  const inReview = applyDemoReview(clean, {stage:'in_review'}, at);
  const ready = applyDemoReview(inReview, {stage:'ready_for_handoff'}, at);
  const handed = applyDemoReview(ready, {stage:'handed_off'}, at);
  assert.ok(handed.workflowMilestones.readyForHandoffAt);
  assert.ok(handed.workflowMilestones.handedOffAt);
  const closed = applyDemoReview(handed,{stage:'closed',reason:'merchant_withdrew'}, at);
  assert.throws(() => applyDemoReview(closed,{stage:'new'}, at), /not permitted/);
});

test('flagged lead cannot be made ready or handed off without explicitly documented exception', () => {
  const flagged = {...clean, id:'DEMO-FLAGGED', hasExistingFinancing:'yes', existingFinancingTypes:[]};
  assert.equal(evaluateLead(flagged, validationRules).status, 'needs_info');
  const reviewing = applyDemoReview(flagged, {stage:'in_review'}, at);
  assert.throws(() => applyDemoReview(reviewing, {stage:'ready_for_handoff'}, at), /documented screening exception/);
  assert.throws(() => applyDemoReview(reviewing, {stage:'ready_for_handoff',reason:SCREENING_EXCEPTION_REASON}, at), /reviewer note/);
  assert.throws(() => applyDemoReview(reviewing, {stage:'handed_off'}, at), /not permitted/);
  const exceptional = applyDemoReview(reviewing, {
    stage:'ready_for_handoff', reason:SCREENING_EXCEPTION_REASON, note:'Fictional reviewer checked financing type off-form'
  }, at);
  assert.equal(exceptional.followUpReason, SCREENING_EXCEPTION_REASON);
  assert.ok(exceptional.workflowMilestones.screeningExceptionAt);
  const sent = applyDemoReview(exceptional, {stage:'handed_off', note:'Demo handoff only'}, at);
  assert.equal(sent.followUpReason, SCREENING_EXCEPTION_REASON);
  assert.equal(buildWorkflowInsights([sent]).markedForHandoff, 1);
  assert.equal(buildWorkflowInsights([sent]).simulatedHandoffs, 1);
});

test('recorded ever-reached vs current snapshot counts do not treat seed stages as events', () => {
  const baseline = sampleLeads();
  let current = applyDemoReview(clean, {stage:'in_review'}, at);
  current = applyDemoReview(current, {stage:'ready_for_handoff'}, at);
  current = applyDemoReview(current, {stage:'handed_off'}, at);
  current = applyDemoReview(current, {stage:'closed', reason:'merchant_withdrew'}, at);
  for (let i=0; i<MAX_REVIEW_HISTORY + 3; i++) {
    current = applyDemoReview(current, {stage:'closed',note:`Fictional note ${i}`}, at);
  }
  const insights = buildWorkflowInsights([...baseline, current]);
  assert.equal(insights.markedForHandoff, 1);
  assert.equal(insights.simulatedHandoffs, 1);
  assert.ok(insights.currentReadyForHandoff > 0); // seeded snapshot only
  assert.ok(insights.currentHandedOff > 0); // seeded snapshot only
  assert.equal(current.stage,'closed');
  assert.equal(current.reviewHistory.length,MAX_REVIEW_HISTORY);
});

test('all seeded needs-info and closed leads have operational reasons and accept note-only edits', () => {
  const targets=sampleLeads().filter((lead)=>['needs_info','closed'].includes(lead.stage));
  assert.equal(targets.length, 5);
  for (const lead of targets) {
    assert.ok(lead.followUpReason, `${lead.id} must have a reason`);
    const note=applyDemoReview(lead,{stage:lead.stage,note:'Fictional follow-up'},at);
    assert.equal(note.followUpReason, lead.followUpReason);
  }
});
