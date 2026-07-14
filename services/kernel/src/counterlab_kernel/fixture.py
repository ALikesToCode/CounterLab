"""Deterministic public fixtures for the entity-leakage concept pack."""

from __future__ import annotations

import numpy as np
import pandas as pd


DEFAULT_CUSTOMERS = 480
OBSERVATIONS_PER_CUSTOMER = 6


def generate_leakage_fixture(
    seed: int = 1729,
    *,
    customers: int = DEFAULT_CUSTOMERS,
    observations_per_customer: int = OBSERVATIONS_PER_CUSTOMER,
) -> pd.DataFrame:
    """Create repeated-customer churn observations with an identity shortcut.

    Churn is mostly stable within each customer. The ordinary feature columns retain
    a weak, genuine relationship to churn, while ``customer_id`` lets a row-wise
    split memorize entities seen in both train and test.
    """

    if customers < 2:
        raise ValueError("customers must be at least 2")
    if observations_per_customer < 2:
        raise ValueError("observations_per_customer must be at least 2")

    rng = np.random.default_rng(seed)
    customer_ids = np.array(
        [f"customer_{index:04d}" for index in range(customers)], dtype=object
    )

    base_tenure = rng.uniform(2.0, 72.0, size=customers)
    base_charges = np.clip(rng.normal(76.0, 17.0, size=customers), 24.0, 145.0)
    base_tickets = rng.poisson(2.1, size=customers)
    base_activity = np.clip(rng.normal(17.0, 5.0, size=customers), 1.0, 30.0)
    contract_types = rng.choice(
        np.array(["monthly", "annual", "two_year"], dtype=object),
        size=customers,
        p=[0.58, 0.29, 0.13],
    )

    contract_risk = np.select(
        [contract_types == "monthly", contract_types == "two_year"],
        [0.38, -0.42],
        default=-0.08,
    )
    generalizable_signal = 2.0 * (
        -0.34 * ((base_tenure - 37.0) / 20.0)
        + 0.34 * ((base_charges - 76.0) / 17.0)
        + 0.30 * ((base_tickets - 2.1) / 1.6)
        - 0.28 * ((base_activity - 17.0) / 5.0)
        + contract_risk
    )
    # The independent customer effect dominates, creating a shortcut, while the
    # smaller observable signal remains genuinely predictive for unseen customers.
    entity_effect = rng.normal(0.0, 2.4, size=customers)
    customer_score = generalizable_signal + entity_effect
    threshold = float(np.median(customer_score))
    customer_target = (customer_score > threshold).astype(np.int8)

    records: list[dict[str, object]] = []
    for customer_index, customer_id in enumerate(customer_ids):
        for observation_index in range(observations_per_customer):
            target = int(customer_target[customer_index])
            # Rare label noise keeps the failure mode credible without erasing the
            # mostly customer-stable shortcut.
            if rng.random() < 0.012:
                target = 1 - target
            records.append(
                {
                    "observation_id": (
                        f"{customer_id}_observation_{observation_index:02d}"
                    ),
                    "customer_id": str(customer_id),
                    "tenure_months": round(
                        float(
                            np.clip(
                                base_tenure[customer_index]
                                + observation_index * 0.45
                                + rng.normal(0.0, 0.65),
                                1.0,
                                84.0,
                            )
                        ),
                        6,
                    ),
                    "monthly_charges": round(
                        float(
                            np.clip(
                                base_charges[customer_index] + rng.normal(0.0, 2.1),
                                20.0,
                                160.0,
                            )
                        ),
                        6,
                    ),
                    "support_tickets": int(
                        max(
                            0,
                            base_tickets[customer_index]
                            + rng.choice([-1, 0, 0, 0, 1]),
                        )
                    ),
                    "activity_days_30d": round(
                        float(
                            np.clip(
                                base_activity[customer_index] + rng.normal(0.0, 1.2),
                                0.0,
                                30.0,
                            )
                        ),
                        6,
                    ),
                    "contract_type": str(contract_types[customer_index]),
                    "churned": target,
                }
            )

    return pd.DataFrame.from_records(records)
