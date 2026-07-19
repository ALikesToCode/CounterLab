# GitHub access baseline

- Local `origin`: `https://github.com/ALikesToCode/CounterLab`
- Unauthenticated GitHub REST request to `/repos/ALikesToCode/CounterLab`: HTTP `404`
- Local repository license file: `LICENSE` with MIT terms
- Devpost Build Week project repository field: not visible in the pre-draft project record

The unauthenticated 404 means judges cannot currently be assumed to have public repository access. It does not distinguish a private repository from a missing/renamed remote. If the repository is private, the owner must verify that both official judging addresses have access before submission. This audit did not read local GitHub credentials or account configuration because those paths are outside the repository safety boundary.
