## Rule: always use qmd before reading files
Before reading files, always use qmd to search.
- qmd search "query" 
- qmd vsearch "query"
- qmd query "query"

Use Read/Glob only if qmd doesn't return enough.

## Token Optimization Rules
1. Trust skills/memory - skip re-reading files
2. No speculative tool calls
3. Parallelize independent tool calls
4. Route output > 20 lines to subagents
5. Never restate what the user already said