import { test } from 'node:test';
import assert from 'node:assert/strict';
import {applyDemoReview, validateReviewInput, MAX_REVIEW_HISTORY} from '../public/js/lib/review-workflow.js';
const lead={id:'DEMO-1001',demo:true,stage:'new',businessName:'Fictional Co'};
test('accepted review stage saves note and a stage transition',()=>{
 const r=applyDemoReview(lead,{stage:'needs_info',reason:'missing_business_details',note:'  Missing fictional details  '},'2026-11-11T06:00:00.000Z');
 assert.equal(r.stage,'needs_info');
 assert.equal(r.lastReviewNote,'Missing fictional details');
 assert.equal(r.followUpReason,'missing_business_details');
 assert.deepEqual(r.reviewHistory,[{stageBefore:'new',stageAfter:'needs_info',reason:'missing_business_details',note:'Missing fictional details',at:'2026-11-11T06:00:00.000Z'}]);
 assert.equal(lead.stage,'new');
});
test('rejects unapproved funding or decline statuses',()=>{
 for(const stage of ['approved','declined','funded','',null]) assert.throws(()=>validateReviewInput({stage}),/valid inquiry stage/);
});
test('rejects real records and too-long notes',()=>{
 assert.throws(()=>applyDemoReview({...lead,demo:false},{stage:'in_review',note:'ok'}),/fictional/);
 assert.throws(()=>applyDemoReview(lead,{stage:'in_review',note:'X'.repeat(501)}),/500/);
});
test('requires a stage change or a note and retains max history length',()=>{
 assert.throws(()=>applyDemoReview(lead,{stage:'new',note:''}),/Change/);
 let current=lead;
 for(let i=0;i<MAX_REVIEW_HISTORY+2;i++) current=applyDemoReview(current,{stage:'new',note:'Demo note ' + i},new Date(i*1000).toISOString());
 assert.equal(current.reviewHistory.length,MAX_REVIEW_HISTORY);
 assert.equal(current.reviewHistory[0].note,'Demo note 2');
});

test('needs-info and closed workflow stages require a structured operational reason',()=>{
 for(const stage of ['needs_info','closed']) {
  assert.throws(()=>applyDemoReview(lead,{stage,note:'Synthetic'}),/operational reason/);
  assert.equal(applyDemoReview(lead,{stage,reason:'other_operational'}).followUpReason,'other_operational');
 }
 assert.throws(()=>applyDemoReview(lead,{stage:'needs_info',reason:'declined'}),/valid operational reason/);
});
test('existing reason persists for note-only updates and is cleared on a different stage',()=>{
 const first=applyDemoReview(lead,{stage:'needs_info',reason:'missing_business_details'});
 const second=applyDemoReview(first,{stage:'needs_info',note:'Still waiting'});
 assert.equal(second.followUpReason,'missing_business_details');
 const third=applyDemoReview(second,{stage:'in_review',note:'Received fictional detail'});
 assert.equal(third.followUpReason,'');
 assert.equal(third.reviewHistory.at(-1).reason,'');
});
