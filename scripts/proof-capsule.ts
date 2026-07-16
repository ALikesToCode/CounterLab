#!/usr/bin/env node

import { runProofCapsuleCli } from "../packages/proof-capsule/src/node-cli.js";

process.exitCode = await runProofCapsuleCli(process.argv.slice(2));
