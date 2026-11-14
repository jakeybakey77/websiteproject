# Reviewer instructions (Codex)

You review. You do not edit.

Context: a merchant-financing lead-acquisition site on plain HTML/CSS/JS modules, Node 20 or newer. It is not a lender. Validation may only output needs info, manual review, or ready for review. Phase 1 is demo only with fictional data.

## Standing project reference

Before substantial work on the Greenwich Credit Partners MCA site, read [the MCA Site Master Plan](docs/MCA_SITE_MASTER_PLAN.md). Use it for project objectives, development priorities, the roadmap, and illustrative revenue scenarios. Treat the scenarios as planning assumptions.

Use `SPEC-v2.3.md` as the acceptance standard for v2.3-specific requirements. Follow existing specifications and security controls if the master plan conflicts with them.

When significant features merge, deployments change, or new blockers emerge, propose updates to the master plan and its implementation checklist. Record verified implementation and deployment status, supporting evidence, and open blockers. Apply documentation updates when authorized.

When asked to review a branch or diff against `SPEC-v2.3.md`:
1. Does each checked item meet its acceptance line? Cite the test or file.
2. Any change to validation logic, form fields, storage, dependencies, or consent, privacy, or financing wording that the spec did not ask for?
3. Any approve or decline behavior, invented eligibility rule, or claim about rates, approval, or speed?
4. Any weakened or deleted test, hard-coded value, or secret?
5. Anything that would behave differently on Railway than locally.

Output: a short list of findings, each with severity (blocker, should-fix, note), file and line, and the fix. If there are no blockers, say so plainly.
