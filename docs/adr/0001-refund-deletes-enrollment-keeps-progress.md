# An approved Refund deletes the enrollment but keeps all progress

When a Refund Request is approved, we hard-delete the learner's `enrollments` row for that course and leave `lesson_progress`, `video_watch_events` and `quiz_attempts` untouched. So you will find progress rows for learners who are no longer enrolled. That is deliberate. Do not "clean them up", and do not add cascading deletes from enrollments to progress.

Every access check reads `enrollments`, so deleting the row ends access everywhere at once. Refund eligibility needs the learner's full watch history across purchases, so a learner can't get repeated Refunds by buying again and Starting Over. Kept progress also lets a learner who buys again choose Continuing for free. Starting Over hides progress recorded before the current enrollment's `enrolledAt` and never deletes it.

## Considered Options

- **Soft-delete the enrollment (`revokedAt`)**: rejected. Every query on `enrollments` (13 files, several with their own copy of `isUserEnrolled`) would have to filter revoked rows, and one missed check means a refunded learner keeps access. Being able to restore the row is useless anyway, because approval is final.
- **Keep progress for N days, then delete it**: rejected. It breaks the watch-time cap across purchases and makes Continuing impossible after N days. It also needs scheduled cleanup, which the app doesn't have.

## Consequences

- The refunded enrollment's `enrolledAt` and `completedAt` are lost. The `purchases` and `refunds` rows are the record of what happened.
- Instructor enrollment counts drop when a Refund Request is approved.
