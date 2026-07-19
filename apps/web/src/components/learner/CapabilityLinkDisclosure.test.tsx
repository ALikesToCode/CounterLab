import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CapabilityLinkDisclosure } from "./CapabilityLinkDisclosure";

describe("CapabilityLinkDisclosure", () => {
  it("explains private-session URL and owner-key authority", async () => {
    const user = userEvent.setup();
    const revoke = vi.fn();
    render(
      <CapabilityLinkDisclosure variant="private-session" onRevoke={revoke} />,
    );

    const disclosure = screen
      .getByRole("heading", {
        name: "This address does not carry your access key.",
      })
      .closest("section");
    expect(disclosure).not.toBeNull();
    expect(disclosure).toHaveTextContent("Private session");
    expect(disclosure).toHaveTextContent("The URL is only a locator.");
    expect(disclosure).toHaveTextContent(
      "A separate owner key held by this browser controls access",
    );
    expect(disclosure).toHaveTextContent(
      "The owner key is kept out of the address, public replays, and exported evidence.",
    );
    expect(disclosure).toHaveTextContent(/no automatic expiry/i);
    expect(disclosure).toHaveTextContent(
      /revocation disables this owner key; it does not delete stored evidence/i,
    );
    expect(disclosure).not.toHaveTextContent(/anyone with the link can view/i);

    const revokeButton = screen.getByRole("button", {
      name: "Revoke private session access",
    });
    revokeButton.focus();
    await user.keyboard("{Enter}");
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("omits the revoke action when no callback is supplied", () => {
    render(<CapabilityLinkDisclosure variant="private-session" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("warns that a published replay is public and names every included field", () => {
    render(<CapabilityLinkDisclosure variant="publish-public-replay" />);

    const disclosure = screen
      .getByRole("heading", {
        name: "Review what the public link will reveal.",
      })
      .closest("section");
    expect(disclosure).not.toBeNull();
    expect(disclosure).toHaveTextContent(
      "Anyone with the link can view the published replay.",
    );

    const included = within(
      screen
        .getByRole("heading", { name: "Included in the public replay" })
        .closest("section")!,
    ).getByRole("list");
    expect(within(included).getAllByRole("listitem")).toHaveLength(6);
    expect(included).toHaveTextContent(
      "Claim, hypotheses, prediction, and revision",
    );
    expect(included).toHaveTextContent("Scientific result");
    expect(included).toHaveTextContent(
      "Boundary, transfer, and patch summaries",
    );
    expect(included).toHaveTextContent("Integrity and provenance hashes");
    expect(included).toHaveTextContent(
      "Notebook format and evidence locations without source text",
    );
    expect(included).toHaveTextContent(
      "Recorded replay time and ordered activity names",
    );
    expect(disclosure).toHaveTextContent(/available until you revoke it/i);
    expect(disclosure).toHaveTextContent(
      /cannot retract copies or screenshots/i,
    );
    expect(disclosure).toHaveTextContent(
      /approved claim or hypotheses name a field/i,
    );
  });

  it("states that sensitive source material and the owner key stay excluded", () => {
    render(<CapabilityLinkDisclosure variant="publish-public-replay" />);

    const excluded = within(
      screen
        .getByRole("heading", { name: "Excluded from the public replay" })
        .closest("section")!,
    ).getByRole("list");
    expect(within(excluded).getAllByRole("listitem")).toHaveLength(6);
    expect(excluded).toHaveTextContent("Raw rows");
    expect(excluded).toHaveTextContent("Notebook bytes");
    expect(excluded).toHaveTextContent("Local paths");
    expect(excluded).toHaveTextContent(
      "Notebook filenames, schema field lists, source excerpts, and patch diff",
    );
    expect(excluded).toHaveTextContent(
      "Source-session identifiers, private Capsule, and owner key",
    );
    expect(excluded).toHaveTextContent(
      "Private Reasoning Diff prose, code, and exact activity timestamps",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
