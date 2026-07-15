# Held-out review matrix

Generated from the real safe-parser and fixed-authority execution recorded in `docs/HELD_OUT_RESULTS.json`. Uploaded notebook cells were not executed. The completion Plan source is explicitly `deterministic_contract_probe`, not GPT or Codex. Human review remains pending and no learner outcome is implied.

| Case | Family | Variation | Expected support | Observed support | Expected concept | Observed concept | Fixed completion | Human review | Intake checks |
|---|---|---|---|---|---|---|---|---|---|
| leakage_rows_pipeline | entity_leakage | pipeline_with_identity | SUPPORTED | SUPPORTED | entity_leakage | entity_leakage | PASS | PENDING | PASS |
| leakage_shuffled_observations | entity_leakage | shuffled_repeated_entities | SUPPORTED | SUPPORTED | entity_leakage | entity_leakage | PASS | PENDING | PASS |
| leakage_column_transformer | entity_leakage | column_transformer_identity | SUPPORTED | SUPPORTED | entity_leakage | entity_leakage | PASS | PENDING | PASS |
| leakage_random_forest | entity_leakage | different_estimator_same_split | SUPPORTED | SUPPORTED | entity_leakage | entity_leakage | PATCH_ESTIMATOR_OUTSIDE_CONTRACT | PENDING | PASS |
| imbalance_accuracy_only | class_imbalance | majority_baseline | SUPPORTED | SUPPORTED | class_imbalance | class_imbalance | PASS | PENDING | PASS |
| imbalance_confusion_metrics | class_imbalance | minority_metrics | SUPPORTED | SUPPORTED | class_imbalance | class_imbalance | PASS | PENDING | PASS |
| imbalance_weighted_model | class_imbalance | class_weight_balanced | SUPPORTED | SUPPORTED | class_imbalance | class_imbalance | PASS | PENDING | PASS |
| imbalance_threshold_policy | class_imbalance | decision_threshold | SUPPORTED | SUPPORTED | class_imbalance | class_imbalance | PASS | PENDING | PASS |
| unsupported_network_dependency | unsupported | external_network | UNSUPPORTED | UNSUPPORTED | refuse | refuse | N/A | PENDING | PASS |
| unsupported_magic_package | unsupported | magic_and_unknown_package | UNSUPPORTED | UNSUPPORTED | refuse | refuse | N/A | PENDING | PASS |

## Summary

- Automated checks: 10/10 passed.
- Leakage variants: 4/4 passed.
- Imbalance variants: 4/4 passed.
- Unsupported/refusal cases: 2/2 passed.
- Fixed full-loop completion: 7/8 supported cases passed without source edits.
- Human review status: pending for all cases until reviewer labels and adjudication are recorded.
