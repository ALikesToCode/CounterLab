import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LockedBeliefBreakPreview } from "./LockedBeliefBreakPreview";

describe("LockedBeliefBreakPreview", () => {
  it("offers a compact landing strip without revealing the bundled result", () => {
    render(<LockedBeliefBreakPreview density="strip" />);

    const preview = screen.getByLabelText(
      /fair-test preview with result locked/i,
    );
    expect(preview).toHaveAttribute("data-presentation", "strip");
    expect(preview).toHaveAttribute("data-result-visibility", "locked");
    expect(preview).toHaveTextContent(
      /familiar rows.*change who counts as new.*unseen customers/i,
    );
    expect(preview).toHaveTextContent(
      /same model, features, preprocessing, sample size, metric, and seed/i,
    );
    expect(preview).not.toHaveTextContent(/98\.5%|59\.4%|supports|rejected/i);
  });

  it("retains the complete locked mechanism for non-landing surfaces", () => {
    render(<LockedBeliefBreakPreview />);

    const preview = screen.getByLabelText(
      /belief-break fair-test mechanism with result locked/i,
    );
    expect(preview).toHaveAttribute("data-presentation", "compact");
    expect(preview).toHaveTextContent(/familiar-row test.*unseen-entity test/i);
  });
});
