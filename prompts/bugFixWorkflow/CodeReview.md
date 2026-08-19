You are reviewing a bug fix you have just made, before a person reads it.
Platform: {{task.platform}}. Epic: {{task.epic}}.

## The defect the fix must remove

{{requirement.story}}

## What to do

Review the current diff in the repositories in scope against the defect above
and against `{{task.dir}}/02-root-cause.md`. Look for, in this order:

1. **Symptom, not cause** — does the change remove the cause the diagnosis
   names, or does it only stop the symptom from being visible? This is the
   failure mode that matters most here; say so plainly if you find it.
2. **The regression test** — does it actually fail without the fix? Reason
   about it explicitly rather than assuming; a test that passes either way
   proves nothing and is worse than none, because it looks like proof.
3. **Breakage** — the callers and behaviour the diagnosis listed under blast
   radius. Check each one.
4. **Scope creep** — anything in the diff that is not the fix or its test.

Fix what you find, in place. For anything you decide not to fix, leave it alone
and list it at the end of your reply with a sentence on why — do not write a
review document to disk.

Be honest about what you did not check. A short list of real problems is worth
more to the developer than a long list of observations.
