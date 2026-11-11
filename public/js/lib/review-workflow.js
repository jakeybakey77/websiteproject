// Demo-only reviewer workflow. Stages are operational states, NOT credit decisions.
import { ALLOWED_TRANSITIONS, STAGES } from '../config/pipeline.js';
import { REVIEW_REASONS, REASON_REQUIRED_STAGES } from '../config/review-reasons.js';
import { validationRules } from '../config/validation-rules.js';
import { evaluateLead, OUTCOMES } from './validation-engine.js';

const STAGE_VALUES = new Set(STAGES.map(({ value }) => value));
const REASON_VALUES = new Set(REVIEW_REASONS.map(({ value }) => value));
export const SCREENING_EXCEPTION_REASON = 'screening_exception_documented';
export const MAX_REVIEW_NOTE = 500;
export const MAX_REVIEW_HISTORY = 20;

const hasFlags = (lead) => evaluateLead(lead, validationRules).status !== OUTCOMES.READY_FOR_REVIEW;

export function allowedNextStages(stage) {
  if (!STAGE_VALUES.has(stage)) return [];
  return [stage, ...ALLOWED_TRANSITIONS[stage]];
}

export function requiresReviewReason(stage, lead) {
  return REASON_REQUIRED_STAGES.includes(stage) ||
    (stage === 'ready_for_handoff' && !!lead && hasFlags(lead));
}

export function validateReviewInput({ stage, note = '', reason = '' }, currentLead = null) {
  if (!STAGE_VALUES.has(stage)) throw new Error('Choose a valid inquiry stage.');
  if (typeof note !== 'string') throw new Error('Note must be text.');
  const cleanNote = note.trim();
  if (cleanNote.length > MAX_REVIEW_NOTE) throw new Error(`Notes must be ${MAX_REVIEW_NOTE} characters or fewer.`);
  if (typeof reason !== 'string' || (reason && !REASON_VALUES.has(reason))) {
    throw new Error('Choose a valid operational reason.');
  }

  const changed = !!currentLead && stage !== currentLead.stage;
  if (changed && !ALLOWED_TRANSITIONS[currentLead.stage]?.includes(stage)) {
    throw new Error(`Transition from ${currentLead.stage} to ${stage} is not permitted.`);
  }

  const needsReason = requiresReviewReason(stage, currentLead);
  const inheritedReason = !changed ? currentLead?.followUpReason || '' : '';
  let finalReason = needsReason ? (reason || inheritedReason) : '';

  // Only an explicitly documented operational exception can bypass a flag for
  // the *human review queue*. It never constitutes a financing approval.
  if (stage === 'ready_for_handoff' && currentLead && hasFlags(currentLead)) {
    if (finalReason !== SCREENING_EXCEPTION_REASON) {
      throw new Error('Flagged inquiries require the documented screening exception reason before handoff readiness.');
    }
    if (changed && !cleanNote) {
      throw new Error('Explain the screening exception in a reviewer note before marking ready for handoff.');
    }
    if (!changed && !currentLead.workflowMilestones?.screeningExceptionAt &&
        !(currentLead.reviewHistory || []).some((e) => e.stageAfter === 'ready_for_handoff' && e.reason === SCREENING_EXCEPTION_REASON)) {
      throw new Error('This flagged inquiry has no recorded screening exception. Return it to review first.');
    }
  }

  if (stage === 'handed_off' && currentLead && hasFlags(currentLead)) {
    const documented = currentLead.followUpReason === SCREENING_EXCEPTION_REASON &&
      (currentLead.workflowMilestones?.screeningExceptionAt ||
        (currentLead.reviewHistory || []).some((e) => e.stageAfter === 'ready_for_handoff' && e.reason === SCREENING_EXCEPTION_REASON && e.note));
    if (!documented) {
      throw new Error('Resolve review flags or document a screening exception before simulated handoff.');
    }
    finalReason = SCREENING_EXCEPTION_REASON; // preserve the override trail
  }

  // Existing malformed demo records can still receive note-only updates.
  if (needsReason && !finalReason && changed) {
    throw new Error('Choose an operational reason for this stage. This is not a financing decision.');
  }
  if (stage === 'handed_off' && currentLead?.followUpReason === SCREENING_EXCEPTION_REASON) {
    finalReason = SCREENING_EXCEPTION_REASON;
  }
  return { stage, note: cleanNote, reason: finalReason };
}

export function applyDemoReview(lead, update, at = new Date().toISOString()) {
  if (!lead || lead.demo !== true) throw new Error('Only fictional demo inquiries can be reviewed.');
  const { stage, note, reason } = validateReviewInput(update, lead);
  if (lead.stage === stage && !note && reason === (lead.followUpReason || '')) {
    throw new Error('Change the stage, reason, or add a note before saving.');
  }
  const changed = lead.stage !== stage;
  const milestones = { ...(lead.workflowMilestones || {}) };
  if (changed && stage === 'ready_for_handoff') {
    milestones.readyForHandoffAt ||= at;
    if (reason === SCREENING_EXCEPTION_REASON) milestones.screeningExceptionAt = at;
  }
  if (changed && stage === 'handed_off') milestones.handedOffAt ||= at;
  const entry = { stageBefore: lead.stage, stageAfter: stage, reason, note, at };
  return {
    ...lead,
    stage,
    followUpReason: reason,
    lastReviewNote: note || lead.lastReviewNote || '',
    reviewedAt: at,
    workflowMilestones: milestones,
    reviewHistory: [...(Array.isArray(lead.reviewHistory) ? lead.reviewHistory : []), entry].slice(-MAX_REVIEW_HISTORY),
  };
}
