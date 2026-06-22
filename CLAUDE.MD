## Rule: always use qmd before reading files
Before reading files, always use qmd to search.
- `qmd search`: quick keyword search
- `qmd query`: hybrid search
- `qmd vsearch`: 의미 기반 벡터 검색

## Rules: Conversation Language Rule
한국어

## Rules: Commit User
CHOI IKYONG<ikyong.choi@gmail.com>

## Rules: Issue Workflow
GitHub 이슈 작업 시에는 반드시 새 브랜치를 먼저 생성한 뒤 작업한다.
- 브랜치 이름: `feat/issue-<번호>-<짧은설명>` (예: `feat/issue-17-kubeconfig-clipboard`)
- 현재 프로젝트 디렉터리에서 작업한다 (worktree 격리 사용 안 함).
- 커밋 메시지에 `Closes #<번호>`를 포함한다.
- 작업 완료 후 PR 생성 흐름으로 머지한다 (main 직접 푸시 금지).

## Rules: Token Optimization
1. Trust skills/memory - skip re-reading files
2. No speculative tool calls
3. Parallelize independent tool calls
4. Route output > 20 lines to subagents
5. Never restate what the user already said

Use Read/Glob only if qmd doesn't return enough.

## Rules: Directory Aliases
- `ui` = `order-ui`
- `producer` = `kafka-producer`
- `consumer` = `kafka-consumer`
- `core` = `kafka-core`
- `restclient` = `restclient-helper`
- `test` = `project-test-app`


## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.