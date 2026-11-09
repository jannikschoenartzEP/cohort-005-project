# Course Platform

A platform where learners buy and watch video courses.

## Language

### Buying and refunding

**Purchase**:
A learner buying a single course, recording the amount they actually paid.
_Avoid_: Order, transaction

**Refund**:
A learner's ask to get their money back for a Purchase, which is Requested until a person Approves or Declines it. Money is only returned, and access only removed, once it is Approved.
_Avoid_: Chargeback, Reversal, Cancellation, Refund Request (as a separate thing)

**Requested** / **Approved** / **Declined**:
The states of a Refund. A Purchase has at most one Requested Refund at a time and at most one Approved Refund ever.
_Avoid_: Pending, Denied

**Refund Window**:
The number of days after a Purchase during which the learner may request a Refund.
