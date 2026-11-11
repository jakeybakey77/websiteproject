import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAttribution, normalizeSource, sourceBucket, sourceLabel} from '../public/js/lib/attribution.js';
import {filterLeads} from '../public/js/lib/lead-stats.js';
import {buildScreeningInsights} from '../public/js/lib/lead-insights.js';
import {validateRules,evaluateLead,OUTCOMES} from '../public/js/lib/validation-engine.js';
import {validationRules} from '../public/js/config/validation-rules.js';
import {demoLeadsToCSV} from '../public/js/lib/csv-export.js';

const clean = {demo:true,id:'DEMO-TRACK',industry:'retail',state:'CT',timeInBusiness:'over_5y',monthlyRevenue:50000,amountRequested:10000,useOfFunds:'inventory',hasExistingFinancing:'no'};

test('unknown utm_source is kept, goes to Other, and medium is captured', () => {
  const values=parseAttribution(new URLSearchParams('utm_source=Google&utm_medium=CPC&utm_campaign=spring'));
  assert.deepEqual(values, {source:'google',medium:'cpc',campaign:'spring'});
  assert.equal(sourceBucket(values.source), 'other');
  assert.match(sourceLabel(values.source), /Other \/ unrecognized/);
  const lead={...clean,...values,validation:evaluateLead(clean,validationRules)};
  assert.equal(filterLeads([lead],{source:'direct'}).length,0);
  assert.equal(filterLeads([lead],{source:'other'}).length,1);
  assert.equal(buildScreeningInsights([lead],validationRules).sources[0].source,'other');
  assert.match(demoLeadsToCSV([lead]),/"medium"/);
  assert.match(demoLeadsToCSV([lead]),/"cpc"/);
});

test('direct means missing parameter, not an unrecognized or explicit empty parameter', () => {
  assert.equal(parseAttribution(new URLSearchParams('')).source, 'direct');
  assert.equal(parseAttribution(new URLSearchParams('utm_source=')).source, 'unrecognized');
  assert.equal(parseAttribution(new URLSearchParams('utm_source=meta_ads')).source, 'meta_ads');
  assert.equal(normalizeSource('A VERY UNRECOGNIZED $$$ SOURCE'), 'a_very_unrecognized_source');
  assert.ok(normalizeSource('x'.repeat(100)).length <= 48);
});

test('enabled empty allowedValues and requiredFields rules fail closed', () => {
  for (const [type,params,message] of [
    ['allowedValues',{field:'state',values:[]},/non-empty values/],
    ['requiredFields',{fields:[]},/non-empty fields/],
  ]) {
    const config={version:'test',rules:[{id:type,type,enabled:true,outcome:OUTCOMES.NEEDS_INFO,message:'Flag',params}]};
    assert.throws(()=>validateRules(config),message);
    assert.throws(()=>evaluateLead(clean,config),message);
    config.rules[0].enabled=false;
    assert.doesNotThrow(()=>validateRules(config));
  }
});
