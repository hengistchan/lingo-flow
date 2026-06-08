# 06. Degradation and Fault Tolerance

## Goal

LingoFlow must fail safely.

MVP degradation is not an advanced intelligent failover system. It exists to guarantee:

1. Do not break the original webpage.
2. Do not stop the whole page because one block failed.
3. Do not repeat expensive provider calls unnecessarily.
4. Continue translating the rest of the page where possible.

## Required MVP Degradation

### 1. Cache Degradation

Cache read failure:

```txt
cache read failed -> treat all tasks as misses -> request provider
```

Cache write failure:

```txt
cache write failed -> ignore for current rendering -> log warning
```

### 2. Provider Retry

Provider temporary failures should retry.

Retry candidates:

- timeout
- network error
- 429
- 5xx

Do not blindly retry:

- 401
- 403
- invalid provider configuration

### 3. Batch Split Degradation

If a batch fails:

```txt
large batch failed
  -> split into halves
  -> if smaller batch fails, split again
  -> if single task fails, mark that task failed
  -> continue remaining tasks
```

Implementation sketch:

```ts
async function translateBatchWithDegrade(tasks: TranslationTask[]) {
  try {
    return await translateBatch(tasks)
  } catch (error) {
    if (tasks.length === 1) {
      return [{
        taskId: tasks[0].id,
        blockId: tasks[0].blockId,
        status: 'failed',
        fromCache: false,
        error: normalizeError(error),
      }]
    }

    const mid = Math.ceil(tasks.length / 2)

    const left = await translateBatchWithDegrade(tasks.slice(0, mid))
    const right = await translateBatchWithDegrade(tasks.slice(mid))

    return [...left, ...right]
  }
}
```

### 4. Optional Provider Fallback

If configured:

```txt
primary provider failed
  -> retry
  -> split batch if needed
  -> fallback provider
```

For clear provider errors:

- 429 -> fallback allowed
- 5xx -> fallback allowed
- timeout -> fallback allowed
- invalid output -> split first, then fallback
- 401/403 -> do not fallback by default; show config error

### 5. Renderer Safe Mode

If rendering a block fails:

```txt
render failed -> skip that block -> continue
```

Implementation:

```ts
function safeRender(result: TranslationResult) {
  try {
    renderBelowOriginal(result)
  } catch (error) {
    console.warn('[LingoFlow] Render failed', {
      blockId: result.blockId,
      error,
    })
  }
}
```

## Error Reasons

```ts
export type DegradeReason =
  | 'cache_read_failed'
  | 'cache_write_failed'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_network_error'
  | 'provider_invalid_output'
  | 'batch_too_large'
  | 'dom_node_missing'
  | 'render_failed'
```

## Popup Display

Do not show frightening error blocks in the webpage by default.

Popup summary:

```txt
Translation finished
Translated: 128 blocks
Cache hits: 42 blocks
Failed: 3 blocks
```

Expandable details:

```txt
Failed blocks:
- Provider timeout
- Invalid LLM output
- DOM node missing
```
