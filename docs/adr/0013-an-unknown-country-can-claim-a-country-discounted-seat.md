# An unknown country can claim a Seat on a Country-Discounted Team Licence

A Seat on a Team Licence bought with a Country Discount carries the same Country Lock as an Individual Purchase: it can only be claimed, and then taken, from the country the Team Licence was bought in. When the claiming Student's country is unknown (no `CF-IPCountry` header, see ADR-0012), we let the claim through, the same way an unknown country never makes a Student Country-Locked while taking a course. One rule for both keeps the Country Lock in one place and stops a Student without Cloudflare being shut out of a Seat their Team Admin paid for.

## Considered Options

- **Refuse the claim when the country is unknown.** What the code did before. Rejected: taking and claiming would follow different rules for the same Country Lock, and the Student has no way to fix a missing header themselves.

## Consequences

Anyone whose request doesn't come through Cloudflare can claim a Seat on a Country-Discounted Team Licence from anywhere. A claimed Seat can't be taken back, so tightening this later only protects Seats not yet claimed. A Team Licence bought at full price has no Country Lock, so its Seats can be claimed from any country.
