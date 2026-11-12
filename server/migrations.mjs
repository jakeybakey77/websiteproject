// Ordered, forward-only SQLite schema migrations. Each migration runs once inside
// a transaction and is recorded in schema_migrations. Never edit a shipped
// migration; add a new one.
//
// Migration 1 is the v2.0 baseline written with IF NOT EXISTS, so a database
// created by v2.0 (which had no schema_migrations table) upgrades in place
// without touching existing merchant leads, sessions or audit rows.
const BASELINE = `
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    demo INTEGER NOT NULL CHECK (demo IN (0,1)),
    contact_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    industry TEXT NOT NULL,
    state TEXT NOT NULL,
    time_in_business TEXT NOT NULL,
    monthly_revenue REAL,
    amount_requested REAL,
    use_of_funds TEXT NOT NULL,
    use_of_funds_detail TEXT NOT NULL DEFAULT '',
    has_existing_financing TEXT NOT NULL,
    existing_financing_types_json TEXT NOT NULL DEFAULT '[]',
    existing_financing_balance REAL,
    demo_acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (demo_acknowledged IN (0,1)),
    stage TEXT NOT NULL,
    follow_up_reason TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'direct',
    medium TEXT NOT NULL DEFAULT '',
    campaign TEXT NOT NULL DEFAULT '',
    received_at TEXT NOT NULL,
    last_review_note TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    review_history_json TEXT NOT NULL DEFAULT '[]',
    workflow_milestones_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_leads_received_at ON leads(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
  CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    csrf_token TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    lead_id TEXT,
    detail_json TEXT NOT NULL DEFAULT '{}',
    at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
`;

const STAGES = "'applied','imported','research_needed','under_review','verified','outreach_ready','contacted','engaged','active_partner','disqualified','archived'";
const TIERS = "'A','B','C','D'";

// ISO partner records live in their own tables. There is deliberately no foreign
// key, shared column or view joining them to merchant leads: a partner-priority
// score can never reach the merchant inquiry workflow through the schema.
// demo is CHECK (demo = 1): a non-synthetic row cannot be stored by flipping a flag.
const ISO_PARTNER_INTELLIGENCE = `
  CREATE TABLE iso_import_batches (
    id TEXT PRIMARY KEY,
    file_hash TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    mapping_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed')),
    total_rows INTEGER NOT NULL,
    accepted_rows INTEGER NOT NULL,
    rejected_rows INTEGER NOT NULL,
    duplicate_rows INTEGER NOT NULL,
    replayed_rows INTEGER NOT NULL,
    replay_count INTEGER NOT NULL DEFAULT 0,
    last_replayed_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE iso_organizations (
    id TEXT PRIMARY KEY,
    demo INTEGER NOT NULL DEFAULT 1 CHECK (demo = 1),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
    legal_name TEXT NOT NULL DEFAULT '',
    name_key TEXT NOT NULL CHECK (length(name_key) > 0),
    website TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    specializations_json TEXT NOT NULL DEFAULT '[]',
    relationship_type TEXT NOT NULL DEFAULT 'unknown' CHECK (relationship_type IN ('iso','broker','referral_partner','unknown')),
    acquisition_source TEXT NOT NULL CHECK (acquisition_source IN ('public_application','csv_import')),
    attribution_json TEXT NOT NULL DEFAULT '{}',
    application_json TEXT NOT NULL DEFAULT '{}',
    import_batch_id TEXT REFERENCES iso_import_batches(id),
    stage TEXT NOT NULL CHECK (stage IN (${STAGES})),
    verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','in_review','verified','failed')),
    disqualify_reason TEXT NOT NULL DEFAULT '',
    assigned_reviewer TEXT NOT NULL DEFAULT '',
    score INTEGER CHECK (score BETWEEN 0 AND 100),
    tier TEXT CHECK (tier IN (${TIERS})),
    score_rules_version TEXT,
    override_tier TEXT CHECK (override_tier IN (${TIERS})),
    override_justification TEXT NOT NULL DEFAULT '',
    override_by TEXT,
    override_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- A stage that implies verification can only be stored alongside verified status.
    CHECK (stage NOT IN ('verified','outreach_ready','contacted','engaged','active_partner') OR verification_status = 'verified')
  );
  CREATE INDEX idx_iso_org_domain ON iso_organizations(domain);
  CREATE INDEX idx_iso_org_name_key ON iso_organizations(name_key);
  CREATE INDEX idx_iso_org_stage ON iso_organizations(stage);
  CREATE INDEX idx_iso_org_tier ON iso_organizations(tier);
  CREATE INDEX idx_iso_org_created ON iso_organizations(created_at DESC);

  CREATE TABLE iso_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES iso_organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invalid','do_not_contact')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (name <> '' OR email <> '' OR phone <> '')
  );
  CREATE INDEX idx_iso_contacts_org ON iso_contacts(organization_id);

  CREATE TABLE iso_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES iso_organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('official_domain','business_identity','commercial_relevance','iso_positioning','contact_validity','region_product_fit','recent_activity','red_flag','court_record_context')),
    source_type TEXT NOT NULL CHECK (source_type IN ('website','registry','directory','court_record','self_reported','csv_import','analyst_note','other')),
    url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    claim TEXT NOT NULL CHECK (length(claim) BETWEEN 1 AND 500),
    observed_on TEXT CHECK (observed_on IS NULL OR observed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    status TEXT NOT NULL DEFAULT 'asserted' CHECK (status IN ('asserted','confirmed','refuted')),
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT,
    -- "confirmed" and "refuted" are reviewer conclusions and must name the reviewer.
    CHECK (status = 'asserted' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
  );
  CREATE INDEX idx_iso_evidence_org ON iso_evidence(organization_id);

  CREATE TABLE iso_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES iso_organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}',
    due_on TEXT,
    completed_at TEXT,
    completed_by TEXT,
    actor TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX idx_iso_activity_org ON iso_activity(organization_id, id DESC);
  CREATE INDEX idx_iso_activity_open ON iso_activity(type, completed_at);

  CREATE TABLE iso_score_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES iso_organizations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('computed','override','override_cleared')),
    rules_version TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    tier TEXT NOT NULL CHECK (tier IN (${TIERS})),
    effective_tier TEXT NOT NULL CHECK (effective_tier IN (${TIERS})),
    factors_json TEXT NOT NULL,
    notes_json TEXT NOT NULL DEFAULT '[]',
    inputs_digest TEXT NOT NULL,
    as_of TEXT NOT NULL,
    justification TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL,
    assessed_at TEXT NOT NULL,
    CHECK (kind = 'computed' OR length(justification) >= 10)
  );
  CREATE INDEX idx_iso_scores_org ON iso_score_snapshots(organization_id, id DESC);
  -- Score history is append-only.
  CREATE TRIGGER iso_score_snapshots_no_update BEFORE UPDATE ON iso_score_snapshots
    BEGIN SELECT RAISE(ABORT, 'iso_score_snapshots is append-only'); END;
  CREATE TRIGGER iso_score_snapshots_no_delete BEFORE DELETE ON iso_score_snapshots
    BEGIN SELECT RAISE(ABORT, 'iso_score_snapshots is append-only'); END;

  CREATE TABLE iso_import_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL REFERENCES iso_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    row_hash TEXT,
    status TEXT NOT NULL CHECK (status IN ('accepted','rejected','duplicate_review','replayed','resolved_created','resolved_contact_attached','resolved_skipped')),
    data_json TEXT NOT NULL DEFAULT '{}',
    errors_json TEXT NOT NULL DEFAULT '[]',
    match_type TEXT CHECK (match_type IN ('exact_domain','exact_name','near_name')),
    matched_organization_id TEXT REFERENCES iso_organizations(id),
    organization_id TEXT REFERENCES iso_organizations(id),
    resolved_by TEXT,
    resolved_at TEXT,
    resolution_note TEXT NOT NULL DEFAULT '',
    UNIQUE (batch_id, row_number)
  );
  CREATE INDEX idx_iso_import_rows_status ON iso_import_rows(status);
  CREATE INDEX idx_iso_import_rows_hash ON iso_import_rows(row_hash);

  ALTER TABLE audit_log ADD COLUMN iso_organization_id TEXT;
`;

// v2.3 ISO referral tracking. Forward-only; migrations 1 and 2 are untouched.
//
// The link between a merchant inquiry and a partner lives only in lead_referrals
// (current effective credit) and lead_referral_events (append-only history).
// Nothing here adds a column to leads or copies a partner score, tier or evidence
// item anywhere near a merchant record.
//
// The triggers are a second line of defence behind the application rules: even a
// caller that bypasses the service layer cannot credit an ineligible partner,
// reuse a revoked code, or leave a code active after the partner stops being active.
const ELIGIBLE_ORG = (ref) => `EXISTS (SELECT 1 FROM iso_organizations o WHERE o.id = ${ref} AND o.stage = 'active_partner' AND o.verification_status = 'verified')`;
const ISO_REFERRAL_TRACKING = `
  CREATE TABLE iso_referral_codes (
    id TEXT PRIMARY KEY,
    iso_organization_id TEXT NOT NULL REFERENCES iso_organizations(id),
    -- Opaque random public identifier. Compared byte-for-byte (case-sensitive).
    code TEXT NOT NULL UNIQUE CHECK (length(code) = 28 AND code GLOB 'gcp_*'),
    status TEXT NOT NULL CHECK (status IN ('active','revoked')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_by TEXT,
    revoked_at TEXT,
    revoke_reason TEXT,
    CHECK ((status = 'active' AND revoked_by IS NULL AND revoked_at IS NULL AND revoke_reason IS NULL)
        OR (status = 'revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND length(revoke_reason) > 0))
  );
  CREATE INDEX idx_referral_codes_org_status ON iso_referral_codes(iso_organization_id, status);
  -- At most one active code per organization, enforced by the database.
  CREATE UNIQUE INDEX idx_referral_codes_one_active ON iso_referral_codes(iso_organization_id) WHERE status = 'active';

  CREATE TRIGGER iso_referral_codes_issue_requires_eligibility BEFORE INSERT ON iso_referral_codes
    WHEN NEW.status = 'active' AND NOT ${ELIGIBLE_ORG('NEW.iso_organization_id')}
    BEGIN SELECT RAISE(ABORT, 'referral code requires an active, verified partner'); END;
  -- The only permitted change is active -> revoked. A revoked code is final.
  CREATE TRIGGER iso_referral_codes_revoke_only BEFORE UPDATE ON iso_referral_codes
    WHEN OLD.status = 'revoked' OR NEW.status <> 'revoked' OR NEW.id <> OLD.id OR NEW.code <> OLD.code
      OR NEW.iso_organization_id <> OLD.iso_organization_id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
    BEGIN SELECT RAISE(ABORT, 'referral codes can only be revoked, never edited or reactivated'); END;
  CREATE TRIGGER iso_referral_codes_no_delete BEFORE DELETE ON iso_referral_codes
    BEGIN SELECT RAISE(ABORT, 'referral codes are never deleted'); END;
  -- Backstop: leaving active_partner revokes any still-active code in the same statement.
  -- The application revokes first (with the acting reviewer); this only catches a bypass.
  CREATE TRIGGER iso_organizations_leaving_active_revokes_codes AFTER UPDATE OF stage ON iso_organizations
    WHEN OLD.stage = 'active_partner' AND NEW.stage <> 'active_partner'
    BEGIN
      UPDATE iso_referral_codes SET status = 'revoked', revoked_by = 'system:schema-guard',
        revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revoke_reason = 'partner_stage_changed'
      WHERE iso_organization_id = NEW.id AND status = 'active';
    END;

  -- Current effective credit: at most one partner per inquiry. No row = direct / unattributed.
  CREATE TABLE lead_referrals (
    lead_id TEXT PRIMARY KEY REFERENCES leads(id),
    iso_organization_id TEXT NOT NULL REFERENCES iso_organizations(id),
    referral_code_id TEXT REFERENCES iso_referral_codes(id),
    method TEXT NOT NULL CHECK (method IN ('public_code','manual')),
    first_attributed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    CHECK (method = 'manual' OR referral_code_id IS NOT NULL)
  );
  CREATE INDEX idx_lead_referrals_org ON lead_referrals(iso_organization_id, lead_id);

  CREATE TRIGGER lead_referrals_credit_requires_eligibility BEFORE INSERT ON lead_referrals
    WHEN NOT ${ELIGIBLE_ORG('NEW.iso_organization_id')}
    BEGIN SELECT RAISE(ABORT, 'referral credit requires an active, verified partner'); END;
  CREATE TRIGGER lead_referrals_code_must_be_live BEFORE INSERT ON lead_referrals
    WHEN NEW.referral_code_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM iso_referral_codes c
      WHERE c.id = NEW.referral_code_id AND c.iso_organization_id = NEW.iso_organization_id AND c.status = 'active')
    BEGIN SELECT RAISE(ABORT, 'referral credit requires an active code owned by the credited partner'); END;
  CREATE TRIGGER lead_referrals_reassign_requires_eligibility BEFORE UPDATE OF iso_organization_id ON lead_referrals
    WHEN NEW.iso_organization_id <> OLD.iso_organization_id AND NOT ${ELIGIBLE_ORG('NEW.iso_organization_id')}
    BEGIN SELECT RAISE(ABORT, 'referral credit requires an active, verified partner'); END;

  -- Append-only history of every credit, correction and removal.
  CREATE TABLE lead_referral_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL REFERENCES leads(id),
    old_iso_id TEXT REFERENCES iso_organizations(id),
    new_iso_id TEXT REFERENCES iso_organizations(id),
    referral_code_id TEXT REFERENCES iso_referral_codes(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('created','corrected','removed')),
    actor TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) > 0),
    request_id TEXT,
    at TEXT NOT NULL,
    CHECK (event_type <> 'created' OR (old_iso_id IS NULL AND new_iso_id IS NOT NULL AND referral_code_id IS NOT NULL)),
    CHECK (event_type <> 'removed' OR (old_iso_id IS NOT NULL AND new_iso_id IS NULL)),
    CHECK (event_type <> 'corrected' OR (new_iso_id IS NOT NULL AND new_iso_id IS NOT old_iso_id)),
    -- A human correction or removal must carry a written reason.
    CHECK (event_type = 'created' OR length(trim(reason)) >= 10)
  );
  CREATE INDEX idx_lead_referral_events_lead ON lead_referral_events(lead_id, id);
  CREATE UNIQUE INDEX idx_lead_referral_events_one_created ON lead_referral_events(lead_id) WHERE event_type = 'created';
  CREATE UNIQUE INDEX idx_lead_referral_events_request ON lead_referral_events(lead_id, request_id) WHERE request_id IS NOT NULL;
  CREATE TRIGGER lead_referral_events_no_update BEFORE UPDATE ON lead_referral_events
    BEGIN SELECT RAISE(ABORT, 'lead_referral_events is append-only'); END;
  CREATE TRIGGER lead_referral_events_no_delete BEFORE DELETE ON lead_referral_events
    BEGIN SELECT RAISE(ABORT, 'lead_referral_events is append-only'); END;

  -- Idempotent public submission: one key maps to exactly one stored inquiry.
  CREATE TABLE lead_submission_keys (
    submission_key TEXT PRIMARY KEY CHECK (length(submission_key) BETWEEN 16 AND 64),
    payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
    lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id),
    created_at TEXT NOT NULL
  );
`;

export const MIGRATIONS = Object.freeze([
  { version: 1, name: 'baseline_merchant_leads_sessions_audit', sql: BASELINE },
  { version: 2, name: 'iso_partner_intelligence', sql: ISO_PARTNER_INTELLIGENCE },
  { version: 3, name: 'iso_referral_tracking', sql: ISO_REFERRAL_TRACKING },
]);

export function runMigrations(db, migrations = MIGRATIONS) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  );`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version)));
  const latest = Math.max(0, ...migrations.map((m) => m.version));
  const unknown = [...applied].filter((version) => version > latest);
  if (unknown.length) throw new Error(`Database schema (v${Math.max(...unknown)}) is newer than this application (v${latest}). Refusing to start.`);
  const ran = [];
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)').run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed and was rolled back: ${error.message}`);
    }
    ran.push(migration.version);
  }
  return ran;
}

export function schemaVersion(db) {
  return Number(db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM schema_migrations').get().v);
}
