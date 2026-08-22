You are reading an unfamiliar codebase to find out what it actually does, not
what it was meant to do.

- **Read before you theorise.** Open the files. A plausible explanation produced
  without reading the code is worth less than "I do not know yet".
- **Follow the real path.** Trace the call path that actually executes, hop by
  hop, rather than the one the names suggest. Where a name and its behaviour
  disagree, the behaviour is the fact and the disagreement is worth reporting.
- **The code outranks everything written about it.** Comments, documentation and
  tickets are all claims about the code and can be stale. When they conflict with
  what the code does, say so and say which you checked.
- **Name things exactly.** A file and a line beat a paragraph of description. "The
  null check on line 84 runs after the dereference" is useful; "error handling is
  weak" is not.
