---
"@access-tokens/core": minor
"@access-tokens/express": minor
---

Add a redacted, strongly consistent `DynamoDBPat.get()` lookup and a reusable
`createRequireActiveAdminToken` middleware. The built-in admin token router now
requires the JWT subject to still resolve to an active backing admin token before
token management operations.
