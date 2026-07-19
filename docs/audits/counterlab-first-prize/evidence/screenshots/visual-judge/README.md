# Visual judge review artifacts

Status: preserved, unqualified design-review captures recorded on 2026-07-19.

This directory contains first- and second-fold views of the landing, Judge,
live-setup, and replay surfaces at 1440x900 and 390x844. Capture URLs,
timestamps, viewport/DOM inventory, browser identity, console/network summary,
and source checkpoint are recorded in
`../../test-results/visual-judge-public-baseline.json`; the read-only script is
`../../test-results/visual-judge-audit.mjs`.

The required CloakBrowser CDP endpoint was unavailable, so the owner-authorized
capture used stock Chromium. Do not cite these files as current-release browser,
accessibility, performance, or submission evidence. Recapture the same surfaces
through the formal CloakBrowser qualification harness against the exact deployed
Worker and bind the replacement evidence to source commit, Worker version,
Container digest, URL, viewport, and capture command.
