# New Admin Status line
- add a new line at the top of the Status panel to display the recency buckets.
- base on sessions table last_seen_at timestamp

## Standard Recency Categories
Rather than mutually exclusive buckets (which miss broader trends), these standard analytics tiers are typically cumulative rolling windows:
•	90 Days (Quarterly Active / Retention Limit): Long-term retained users who haven't churned completely.
•	30 Days  (Monthly Active / MAU): Standard monthly active engagement baseline.
•	7 Days  (Weekly Active / WAU): Regular, weekly active users.
•	24 Hours or 1 Day (Daily Active / DAU): Immediate, high-velocity daily engagement.

## Cumulative Rolling Windows (Most Common)
Each bucket includes everyone who logged in at least once within that time window. A user seen 2 hours ago is counted in all four categories.
‭$$\text{Count}(W) = \text{Count of users where } \text{last\_seen\_at} \ge (\text{Now} - W)$$‬‭‬‭‬‭‬‭‬‭‬‭‬‭‬‭‬‭‬‭‬
•	90d: ‭$\ge$‬ 90 days ago (Total active user base)
•	30d / 45d: ‭$\ge$‬ 30 or 45 days ago
•	14d / 2w: ‭$\ge$‬ 14 days ago
•	24h: ‭$\ge$‬ 24 hours ago (Subset of all previous buckets)

## UI (example)
Standard Engagement Line:
DAU/WAU/MAU: 24h: 42 | 7d: 180 | 30d: 410 | 90d: 650