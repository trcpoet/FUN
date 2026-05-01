# Everything Claude Code (ECC) — Agent Instructions

This is a **production-ready AI coding plugin** providing 27 specialized agents, 114 skills, 59 commands, and automated hook workflows for software development.

**Version:** 1.9.0

## Core Principles

1. **Agent-First** — Delegate to specialized agents for domain tasks
2. **Test-Driven** — Write tests before implementation, 80%+ coverage required
3. **Security-First** — Never compromise on security; validate all inputs
4. **Immutability** — Always create new objects, never mutate existing ones
5. **Plan Before Execute** — Plan complex features before writing code

## Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design and scalability | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code quality and maintainability | After writing/modifying code |
| security-reviewer | Vulnerability detection | Before commits, sensitive code |
| build-error-resolver | Fix build/type errors | When build fails |
| e2e-runner | End-to-end Playwright testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation and codemaps | Updating docs |
| docs-lookup | Documentation and API reference research | Library/API documentation questions |
| cpp-reviewer | C++ code review | C++ projects |
| cpp-build-resolver | C++ build errors | C++ build failures |
| go-reviewer | Go code review | Go projects |
| go-build-resolver | Go build errors | Go build failures |
| kotlin-reviewer | Kotlin code review | Kotlin/Android/KMP projects |
| kotlin-build-resolver | Kotlin/Gradle build errors | Kotlin build failures |
| database-reviewer | PostgreSQL/Supabase specialist | Schema design, query optimization |
| python-reviewer | Python code review | Python projects |
| java-reviewer | Java and Spring Boot code review | Java/Spring Boot projects |
| java-build-resolver | Java/Maven/Gradle build errors | Java build failures |
| chief-of-staff | Communication triage and drafts | Multi-channel email, Slack, LINE, Messenger |
| loop-operator | Autonomous loop execution | Run loops safely, monitor stalls, intervene |
| harness-optimizer | Harness config tuning | Reliability, cost, throughput |
| rust-reviewer | Rust code review | Rust projects |
| rust-build-resolver | Rust build errors | Rust build failures |
| pytorch-build-resolver | PyTorch runtime/CUDA/training errors | PyTorch build/training failures |
| typescript-reviewer | TypeScript/JavaScript code review | TypeScript/JavaScript projects |

## Agent Orchestration

Use agents proactively without user prompt:
- Complex feature requests → **planner**
- Code just written/modified → **code-reviewer**
- Bug fix or new feature → **tdd-guide**
- Architectural decision → **architect**
- Security-sensitive code → **security-reviewer**
- Multi-channel communication triage → **chief-of-staff**
- Autonomous loops / loop monitoring → **loop-operator**
- Harness config reliability and cost → **harness-optimizer**

Use parallel execution for independent operations — launch multiple agents simultaneously.

## Security Guidelines

**Before ANY commit:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- CSRF protection enabled
- Authentication/authorization verified
- Rate limiting on all endpoints
- Error messages don't leak sensitive data

**Secret management:** NEVER hardcode secrets. Use environment variables or a secret manager. Validate required secrets at startup. Rotate any exposed secrets immediately.

**If security issue found:** STOP → use security-reviewer agent → fix CRITICAL issues → rotate exposed secrets → review codebase for similar issues.

## Coding Style

**Immutability (CRITICAL):** Always create new objects, never mutate. Return new copies with changes applied.

**File organization:** Many small files over few large ones. 200-400 lines typical, 800 max. Organize by feature/domain, not by type. High cohesion, low coupling.

**Error handling:** Handle errors at every level. Provide user-friendly messages in UI code. Log detailed context server-side. Never silently swallow errors.

**Input validation:** Validate all user input at system boundaries. Use schema-based validation. Fail fast with clear messages. Never trust external data.

**Code quality checklist:**
- Functions small (<50 lines), files focused (<800 lines)
- No deep nesting (>4 levels)
- Proper error handling, no hardcoded values
- Readable, well-named identifiers

## Testing Requirements

**Minimum coverage: 80%**

Test types (all required):
1. **Unit tests** — Individual functions, utilities, components
2. **Integration tests** — API endpoints, database operations
3. **E2E tests** — Critical user flows

**TDD workflow (mandatory):**
1. Write test first (RED) — test should FAIL
2. Write minimal implementation (GREEN) — test should PASS
3. Refactor (IMPROVE) — verify coverage 80%+

Troubleshoot failures: check test isolation → verify mocks → fix implementation (not tests, unless tests are wrong).

## Development Workflow

1. **Plan** — Use planner agent, identify dependencies and risks, break into phases
2. **TDD** — Use tdd-guide agent, write tests first, implement, refactor
3. **Review** — Use code-reviewer agent immediately, address CRITICAL/HIGH issues
4. **Capture knowledge in the right place**
   - Personal debugging notes, preferences, and temporary context → auto memory
   - Team/project knowledge (architecture decisions, API changes, runbooks) → the project's existing docs structure
   - If the current task already produces the relevant docs or code comments, do not duplicate the same information elsewhere
   - If there is no obvious project doc location, ask before creating a new top-level file
5. **Commit** — Conventional commits format, comprehensive PR summaries

## Git Workflow

**Commit format:** `<type>: <description>` — Types: feat, fix, refactor, docs, test, chore, perf, ci

**PR workflow:** Analyze full commit history → draft comprehensive summary → include test plan → push with `-u` flag.

## Architecture Patterns

**API response format:** Consistent envelope with success indicator, data payload, error message, and pagination metadata.

**Repository pattern:** Encapsulate data access behind standard interface (findAll, findById, create, update, delete). Business logic depends on abstract interface, not storage mechanism.

**Skeleton projects:** Search for battle-tested templates, evaluate with parallel agents (security, extensibility, relevance), clone best match, iterate within proven structure.

## Performance

**Context management:** Avoid last 20% of context window for large refactoring and multi-file features. Lower-sensitivity tasks (single edits, docs, simple fixes) tolerate higher utilization.

**Build troubleshooting:** Use build-error-resolver agent → analyze errors → fix incrementally → verify after each fix.

## Project Structure

```
agents/          — 27 specialized subagents
skills/          — 114 workflow skills and domain knowledge
commands/        — 59 slash commands
hooks/           — Trigger-based automations
rules/           — Always-follow guidelines (common + per-language)
scripts/         — Cross-platform Node.js utilities
mcp-configs/     — 14 MCP server configurations
tests/           — Test suite
```

## Success Metrics

- All tests pass with 80%+ coverage
- No security vulnerabilities
- Code is readable and maintainable
- Performance is acceptable
- User requirements are met


<claude-mem-context>
# Memory Context

# [FUN] recent context, 2026-05-01 5:55am CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 35 obs (12,164t read) | 411,952t work | 97% savings

### Apr 19, 2026
57 8:04a 🔵 git add . Hanging in Shell Background Process
58 " ✅ FUN Parent Directory Cleaned Up — Files Moved to Timestamped Backup
60 8:05a 🔵 FUN Repo on codex/deploy-fix Branch — Vercel Deployment Files Being Restored
62 " 🔵 Remote GitHub Tree SHA Not Available Locally in FUN Repo
64 " 🔵 Working Directory Files Match Local Commit 0bda4d5 Exactly
66 " 🔵 package-lock.json Differs Between Local and GitHub main Branch
68 8:06a 🔵 Remote package-lock.json Blob Not in Local Git Object Store
70 " 🔴 Remote Git Tree Successfully Reconstructed Locally by Fetching Blobs via curl
72 " 🔴 Synthetic Local Commit Created Matching Remote GitHub Commit Metadata
74 8:07a 🔵 Commit Message Newline Affects git commit-tree SHA
77 6:56p 🔵 claudevm.bundle and OptGuideOnDeviceModel Identified as macOS AI/VM System Files
78 " 🔵 claudevm.bundle Contains Linux VM Rootfs and Persistent Session Data
79 6:58p ✅ Conservative Disk Cleanup Executed — ~2.8GB Caches Deleted, VS Code Installer Trashed
81 7:01p 🔵 Visual Studio Code Not Installed — Only Installer Was Present, Now Trashed
### Apr 20, 2026
99 10:50p ⚖️ WordPress Coalition Test — Local Dev Plan Established
100 " 🔵 Local Dev Stack Audit — PHP/MySQL/WP-CLI Missing, Apache and Homebrew Present
102 " 🔵 macOS System Apache Config State — VHosts Disabled, No PHP Module, No Local Dev Tools
105 10:51p 🔵 Coalition Test Assets Located at /Users/tahsinchowdhury/Desktop/Interview Tests/Coalition-test
107 10:53p 🔵 WordPress Setup Blockers Confirmed — No Assets, No sudo, No hosts Entry
108 " ✅ Homebrew Install Started — PHP 8.5.5, MariaDB 12.2.2, WP-CLI 2.12.0
109 10:55p ✅ PHP 8.5.5, MariaDB 12.2.2, and WP-CLI 2.12.0 Successfully Installed via Homebrew
110 " 🔵 Task Asset Download Link Expired — Reference Implementation Cloned from GitHub Instead
114 10:56p 🔵 MariaDB Running — OS Username Works Passwordless, root Access Denied
116 10:58p 🔴 WP-CLI `wp core download` OOM — Workaround via curl+tar, WordPress 6.9.4 Extracted
117 " 🔴 wp-config.php Python Generation Failed — PHP Parse Error from Python `not in` Operator
118 11:00p ✅ wp-config.php Parse Error Fixed — Dynamic WP_HOME/WP_SITEURL Now Uses preg_replace Port Logic
119 " 🟣 WordPress 6.9.4 Installed, Underscores Theme Scaffolded, Contact Form 7 Activated
120 11:02p 🔵 Underscores Theme page.php and content-page.php Template Structure Confirmed
121 11:04p ⚖️ WordPress Coalition Test — Full Challenge Requirements Defined
124 " 🟣 Coalition Test WordPress Theme — Core Files Created and Validated
127 11:07p 🟣 WordPress Site Seeded and Serving Homepage Template via PHP Dev Server
128 " 🔵 WordPress Theme File Structure — Underscores Base with Custom Overrides Confirmed
129 11:09p 🔵 wp-config.php Uses Dynamic Host Detection for coalitiontest.local Compatibility
130 " ✅ Coalition Test WordPress Implementation Plan Marked Complete
### May 1, 2026
203 5:46a ⚖️ Clothing Line Name Brainstorm — Futuristic Athleisure Brand Connected to FUN Sports App

Access 412k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>