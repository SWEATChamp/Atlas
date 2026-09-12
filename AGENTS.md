<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Workflow & Version-Control Discipline

1. **Dedicated Branch Isolation**:
   - Always work on a dedicated `codex/...` branch created directly from the latest verified `origin/main`.
   - Never work directly on `main` or accumulate unrelated commits on older feature branches.

2. **Starting State Reporting**:
   - At the beginning of each session or task, fetch `origin/main` and report the current branch, base commit hash, `origin/main` commit hash, and working-tree cleanliness.

3. **Workspace Integrity & Safety**:
   - Preserve all unrelated user changes and docstrings/comments unless explicitly asked to modify them.
   - Do not create or run unapproved database migrations. Hosted Supabase migrations must remain synchronized with approved migration files.

4. **Coherent Commit Hygiene**:
   - Create meaningful commits representing coherent units of work (typically 1–3 well-structured commits per release). Avoid excessive, fragmented, or noisy commits.

5. **Status Clarity**:
   - Clearly distinguish between locally prepared work, preview deployments, and verified production deployments in all summaries and documentation.

6. **Strict User Approval Boundaries**:
   - Do not commit, push, open pull requests, merge, deploy, or create Git tags unless the user has given explicit approval.

7. **Follow-Up Prompt Continuity**:
   - When the user shares a report or response from another agent (for example, Agent 6), review that result and include the complete, copy-paste-ready prompt for the next appropriate step in the same response unless the user explicitly asks not to proceed.
   - When the current stage of work is complete, proactively include the complete prompt for the next safe follow-up step instead of waiting for the user to ask for it separately.
   - Every follow-up prompt must preserve the current approval boundaries, exact branch and commit expectations, safety checks, prohibited actions, and stop condition. Never treat providing a prompt as authorization for a state-changing action the user has not explicitly approved; without that approval, make the prompt read-only or preparation-only.
