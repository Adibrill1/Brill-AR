# Round AT: import/selection ordering in both directions

AS covered selection then file import. Reverse direction still corrupted destination: start a delayed model import on first experience, switch to second during validation, model was saved to second. Regression against AS head deterministically yields counts[0,1] instead of[1,0].

Imports now join the same queue as experience selection, so in-flight conversion/import completes on its originating selected experience before the later selection runs. Actual file-input delayed-validation fixture asserts only first contains model and second renders empty. Three isolated runs and all30browser fixtures pass. An async polling pitfall in initial test was corrected: readiness now uses import completion message, not an async Playwright predicate that returns a promise.

Scope remains existing-record selection and file/library imports. New/delete/export/arbitrary concurrent editing workflows not broadly audited. No new visual or device claim. AS+AT local/protected, staging rc52 remains through AR; PR6 unchanged pending user merge. No new access request.
