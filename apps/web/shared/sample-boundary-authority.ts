import fixtureJson from "../../../fixtures/public/leakage_sample_boundary_v1.json";
import {
  SampleBoundaryFixtureSchema,
  verifyFixedLeakageSampleBoundaryFixture,
  type SampleBoundaryFixture,
} from "@counterlab/proof-capsule/sample-boundary-authority";

export { SampleBoundaryFixtureSchema, type SampleBoundaryFixture };

// Keep imported JSON untrusted until a caught asynchronous verification path.
export const sampleBoundaryFixture: unknown = fixtureJson;

export function verifySampleBoundaryFixtureIntegrity(
  fixture: unknown = sampleBoundaryFixture,
): Promise<SampleBoundaryFixture> {
  return verifyFixedLeakageSampleBoundaryFixture(fixture);
}
