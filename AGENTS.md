# Greenwich Credit Partners project instructions (Codex)

Review assignments are read-only. Make repository changes only for explicitly authorized implementation or documentation tasks. Work on a separate branch, run applicable tests and checks, and submit the changes for pull request review. Deploy only with explicit authorization.

Context: a merchant-financing lead-acquisition site on plain HTML/CSS/JS modules, Node.js >=22.13 (see `package.json`). It is not a lender. Validation may only output needs info, manual review, or ready for review. Phase 1 is a demo and must use synthetic data only. Preserve existing security controls.

## Standing project reference

At the start of any substantial Greenwich Credit Partners MCA site task, read [the MCA Site Master Plan](docs/MCA_SITE_MASTER_PLAN.md). Use it for project objectives, development priorities, the roadmap, and illustrative revenue scenarios. Treat the scenarios as planning assumptions.

When supplied, the external or project-level `SPEC-v2.3.md` is the acceptance standard for v2.3-specific requirements. It is currently absent from this repository. Consult the [v2.3 release checkpoint](docs/V2_3_RELEASE.md), [v2.3 implementation notes](VERSION_2_3_NOTES.md), and [Gate B Codex contract](docs/V2_3_GATE_B_CODEX_CONTRACT.md) for repository evidence. Existing specifications and security controls take precedence over the master plan.

Significant feature merges, deployment changes, and new blockers are triggers to revisit the master plan and its implementation checklist. Propose or implement updates only when explicitly authorized for the corresponding action. Record verified implementation and deployment status, supporting evidence, and open blockers.

When asked to review a branch or diff against `SPEC-v2.3.md`:
1. Does each checked item meet its acceptance line? Cite the test or file.
2. Any change to validation logic, form fields, storage, dependencies, or consent, privacy, or financing wording that the spec did not ask for?
3. Any approve or decline behavior, invented eligibility rule, or claim about rates, approval, or speed?
4. Any weakened or deleted test, hard-coded value, or secret?
5. Anything that would behave differently on Railway than locally.

Output: a short list of findings, each with severity (blocker, should-fix, note), file and line, and the fix. If there are no blockers, say so plainly.
