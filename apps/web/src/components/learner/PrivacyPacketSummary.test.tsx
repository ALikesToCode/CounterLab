import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  PrivacyPacketSummary,
  type SanitizedPrivacyPacket,
} from "./PrivacyPacketSummary";

describe("PrivacyPacketSummary", () => {
  it("shows the privacy promise and the exact already-sanitized packet", async () => {
    const user = userEvent.setup();
    const packet = {
      exactPacket: {
        learnerClaim: "This score should hold for unseen customers.",
        evidence: [
          {
            reference: "Cell 3 · source",
            excerpt: "train_test_split(X, y)",
          },
        ],
        schemaNames: ["[REDACTED_SENSITIVE_FIELD_1]", "churned"],
      },
      rawRows: [{ customer_id: "secret-customer" }],
      localPath: "/home/owner/private/notebook.ipynb",
    } satisfies SanitizedPrivacyPacket & {
      rawRows: readonly unknown[];
      localPath: string;
    };

    render(<PrivacyPacketSummary packet={packet} />);

    expect(
      screen.getByRole("heading", { name: "CounterLab will send:" }),
    ).toBeInTheDocument();
    for (const item of [
      "✓ your claim",
      "✓ short notebook excerpts",
      "✓ non-sensitive schema names and roles",
      "✕ no raw rows",
      "✕ no notebook file",
      "✕ no local paths",
      "✕ no declared identifier names",
    ]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }

    await user.click(screen.getByText("Review exact packet"));
    const exactPacket = screen.getByLabelText("Exact sanitized packet");
    expect(exactPacket).toHaveTextContent(
      "This score should hold for unseen customers.",
    );
    expect(exactPacket).toHaveTextContent("Cell 3 · source");
    expect(exactPacket).toHaveTextContent("REDACTED_SENSITIVE_FIELD_1");
    expect(exactPacket).not.toHaveTextContent("customer_id");
    expect(exactPacket).not.toHaveTextContent("secret-customer");
    expect(exactPacket).not.toHaveTextContent(
      "/home/owner/private/notebook.ipynb",
    );
    expect(exactPacket).not.toHaveTextContent(/rawRows|localPath/);
    expect(
      screen.getByText(/cannot guarantee complete de-identification/i),
    ).toBeInTheDocument();
  });
});
