# Mobile Judge first-fold release-candidate check

- Route: `http://127.0.0.1:4173/judge`
- Viewport: `390 × 844`
- Browser: repository-managed CloakBrowser through `playwright_safe`
- Source commit: `14d6fe9efa6c24ec25e0f2ed60007c1155feb7b0`
- Result: the `Boundary consequence` definition ended at `842.0625px`,
  within the `844px` viewport.
- Console: zero errors and zero warnings after the local route navigation.
- Network: the route health and checked-in sample Proof Capsule requests
  returned HTTP 200.

This is local release-candidate layout evidence. It is not production
deployment evidence and does not claim a live GPT-5.6, Codex, or runner call.
