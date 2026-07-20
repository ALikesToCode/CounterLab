import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import {
  SampleProofCapsuleReferenceV1Schema,
  validateSampleProofCapsuleV1,
} from "@counterlab/proof-capsule/sample";
import { describe, expect, it, vi } from "vitest";

import {
  SampleEvidencePack,
  verifyCheckedInSampleProofCapsule,
} from "./SampleEvidencePack";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");

async function checkedInCapsule() {
  const [bytes, referenceText] = await Promise.all([
    readFile(
      resolve(
        repositoryRoot,
        "fixtures/public/leakage_sample_proof_capsule_v1.counterlab",
      ),
    ),
    readFile(
      resolve(
        repositoryRoot,
        "fixtures/public/leakage_sample_proof_capsule_v1.ref.json",
      ),
      "utf8",
    ),
  ]);
  return {
    bytes: new Uint8Array(bytes),
    reference: SampleProofCapsuleReferenceV1Schema.parse(
      JSON.parse(referenceText),
    ),
  };
}

describe("SampleEvidencePack", () => {
  it("validates the exact checked-in capsule without live authority claims", async () => {
    const loaded = await checkedInCapsule();
    const capsule = await verifyCheckedInSampleProofCapsule(async () => loaded);

    expect(capsule.manifest.calls).toEqual({
      gpt56: "not-called",
      runtimeCodex: "not-called",
      runner: "not-called",
    });
    expect(capsule.manifest.learnerEpisode).toEqual({
      predictionIncluded: false,
      revisionIncluded: false,
      eventChainIncluded: false,
    });
    expect(capsule.manifest.liveProofCapsuleV2).toBe(false);
    expect(capsule.reference).toEqual(loaded.reference);
  });

  it("offers inspection and exact-asset download only after verification", async () => {
    const loaded = await checkedInCapsule();
    const capsule = await validateSampleProofCapsuleV1(
      loaded.bytes,
      loaded.reference,
    );
    const revoke = vi.fn();
    const createDownload = vi.fn((bytes: Uint8Array) => {
      expect(bytes).toEqual(loaded.bytes);
      return { href: "blob:verified-sample-capsule", revoke };
    });
    const { unmount } = render(
      <SampleEvidencePack
        verifyCapsule={async () => capsule}
        createDownload={createDownload}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /checking the archive/iu,
    );
    expect(
      await screen.findByText(/capsule bytes match the checked-in reference/iu),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByText("Inspect Sample Proof Capsule", {
        selector: "summary",
      }),
    );
    expect(screen.getByText("Fixed-kernel result SHA-256")).toBeInTheDocument();
    expect(screen.getByText("Limitations")).toBeInTheDocument();
    expect(screen.getByText("Non-claims")).toBeInTheDocument();
    expect(screen.getByText(/local candidate runtime/iu)).toBeInTheDocument();
    expect(screen.getByText(/not called/iu)).toBeInTheDocument();
    const download = screen.getByRole("link", {
      name: "Download Sample Proof Capsule",
    });
    expect(download).toHaveAttribute(
      "download",
      "leakage_sample_proof_capsule_v1.counterlab",
    );
    expect(download).toHaveAttribute("href", "blob:verified-sample-capsule");
    expect(createDownload).toHaveBeenCalledOnce();
    unmount();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("withholds inspection and download when verification fails", async () => {
    render(
      <SampleEvidencePack
        verifyCapsule={async () => {
          throw new Error("tampered");
        }}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /inspection and download are withheld/iu,
    );
    expect(
      screen.queryByRole("link", { name: /download sample proof capsule/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Fixed-kernel result SHA-256"),
    ).not.toBeInTheDocument();
  });
});
