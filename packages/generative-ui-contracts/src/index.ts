import { ConceptIdSchema } from "@counterlab/contracts";
import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const BlockId = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/u);
const ResultBinding = z
  .string()
  .trim()
  .min(2)
  .max(240)
  .regex(/^\/(?!\/)(?!.*(?:\.\.|:|\\))[A-Za-z0-9_/-]+$/u);

const StaticCopy = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine(
    (value) =>
      !/(?:<\/?(?:script|iframe|style)|javascript:|data:text\/html)/iu.test(
        value,
      ),
    "scene copy must not contain executable presentation",
  )
  .refine(
    (value) =>
      !/(?:proves? (?:global )?mastery|100% secure|works? for every|always correct)/iu.test(
        value,
      ),
    "scene copy exceeds CounterLab's evidence scope",
  );

const BaseBlock = { id: BlockId } as const;

const HypothesisBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("Hypothesis"),
    current: StaticCopy,
    competing: StaticCopy,
  })
  .strict();

const PredictionBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("Prediction"),
    prompt: StaticCopy,
    immutableBinding: ResultBinding,
  })
  .strict();

const WhyThisTestBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("WhyThisTest"),
    text: StaticCopy,
  })
  .strict();

const SliderBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("Slider"),
    label: StaticCopy,
    operationId: NonEmptyString,
    parameterId: NonEmptyString,
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().finite().positive(),
    defaultValue: z.number().finite(),
    unit: NonEmptyString,
  })
  .strict()
  .superRefine((block, context) => {
    if (
      block.min >= block.max ||
      block.defaultValue < block.min ||
      block.defaultValue > block.max
    ) {
      context.addIssue({
        code: "custom",
        message: "slider bounds and default value must resolve",
        path: ["defaultValue"],
      });
    }
  });

const ToggleBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("Toggle"),
    label: StaticCopy,
    operationId: NonEmptyString,
    parameterId: NonEmptyString,
    defaultValue: z.boolean(),
  })
  .strict();

const SegmentedControlBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("SegmentedControl"),
    label: StaticCopy,
    operationId: NonEmptyString,
    parameterId: NonEmptyString,
    options: z
      .array(z.object({ value: NonEmptyString, label: StaticCopy }).strict())
      .min(2)
      .max(6),
    defaultValue: NonEmptyString,
  })
  .strict()
  .superRefine((block, context) => {
    if (!block.options.some((option) => option.value === block.defaultValue)) {
      context.addIssue({
        code: "custom",
        message: "segmented-control default must resolve to an option",
        path: ["defaultValue"],
      });
    }
  });

const ResultBlockBase = {
  ...BaseBlock,
  label: StaticCopy,
  resultBinding: ResultBinding,
} as const;

const MetricBlockSchema = z
  .object({
    ...ResultBlockBase,
    type: z.literal("Metric"),
    unit: NonEmptyString,
  })
  .strict();

function chart(type: "BarChart" | "LineChart" | "Scatter") {
  return z
    .object({
      ...ResultBlockBase,
      type: z.literal(type),
      xLabel: StaticCopy,
      yLabel: StaticCopy,
      xUnit: NonEmptyString,
      yUnit: NonEmptyString,
      accessibleLabel: StaticCopy,
    })
    .strict();
}

const BoundaryMapBlockSchema = z
  .object({
    ...ResultBlockBase,
    type: z.literal("BoundaryMap"),
    accessibleTableBinding: ResultBinding,
  })
  .strict();

const MotionCanvasBlockSchema = z
  .object({
    ...ResultBlockBase,
    type: z.literal("MotionCanvas"),
    accessibleTableBinding: ResultBinding,
    reducedMotionBinding: ResultBinding,
  })
  .strict();

const NotebookCellBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("NotebookCell"),
    label: StaticCopy,
    evidenceBinding: ResultBinding,
  })
  .strict();

const NotebookDiffBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("NotebookDiff"),
    label: StaticCopy,
    diffBinding: ResultBinding,
  })
  .strict();

const TransferBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("Transfer"),
    prompt: StaticCopy,
    evaluatorId: NonEmptyString,
  })
  .strict();

const ReasoningDiffBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("ReasoningDiff"),
    resultBinding: ResultBinding,
  })
  .strict();

const ProofBadgeBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("ProofBadge"),
    label: StaticCopy,
    proofBinding: ResultBinding,
  })
  .strict();

const LimitationBlockSchema = z
  .object({
    ...BaseBlock,
    type: z.literal("Limitation"),
    text: StaticCopy,
  })
  .strict();

export const LabSceneBlockV2Schema = z.discriminatedUnion("type", [
  HypothesisBlockSchema,
  PredictionBlockSchema,
  WhyThisTestBlockSchema,
  SliderBlockSchema,
  ToggleBlockSchema,
  SegmentedControlBlockSchema,
  MetricBlockSchema,
  chart("BarChart"),
  chart("LineChart"),
  chart("Scatter"),
  BoundaryMapBlockSchema,
  MotionCanvasBlockSchema,
  NotebookCellBlockSchema,
  NotebookDiffBlockSchema,
  TransferBlockSchema,
  ReasoningDiffBlockSchema,
  ProofBadgeBlockSchema,
  LimitationBlockSchema,
]);

const LabSceneDraftShape = {
  schemaVersion: z.literal("2"),
  sceneId: BlockId,
  sessionId: NonEmptyString,
  concept: ConceptIdSchema,
  supportLabel: z.enum(["VERIFIED_TEST", "GUIDED_VISUAL", "EXPLANATION_ONLY"]),
  title: StaticCopy,
  blocks: z.array(LabSceneBlockV2Schema).min(1).max(32),
  assumptions: z.array(StaticCopy).min(1).max(12),
  limitations: z.array(StaticCopy).min(1).max(12),
} as const;

export const LabSceneDraftV2Schema = z
  .object(LabSceneDraftShape)
  .strict()
  .superRefine((scene, context) => {
    const ids = new Set<string>();
    for (const [index, block] of scene.blocks.entries()) {
      if (ids.has(block.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate scene block id: ${block.id}`,
          path: ["blocks", index, "id"],
        });
      }
      ids.add(block.id);
    }
    if (scene.supportLabel === "VERIFIED_TEST") {
      context.addIssue({
        code: "custom",
        message: "only fixed verification may promote a draft to VERIFIED_TEST",
        path: ["supportLabel"],
      });
    }
    if (scene.blocks.some((block) => block.type === "ProofBadge")) {
      context.addIssue({
        code: "custom",
        message: "only fixed verification may bind a ProofBadge",
        path: ["blocks"],
      });
    }
  });

export const LabSceneV2Schema = z
  .object({
    ...LabSceneDraftShape,
    provenance: z
      .object({
        experimentIrHash: Sha256,
        discriminationContractHash: Sha256,
      })
      .strict(),
  })
  .strict()
  .superRefine((scene, context) => {
    const ids = new Set<string>();
    for (const [index, block] of scene.blocks.entries()) {
      if (ids.has(block.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate scene block id: ${block.id}`,
          path: ["blocks", index, "id"],
        });
      }
      ids.add(block.id);
    }
    if (
      scene.supportLabel === "VERIFIED_TEST" &&
      !scene.blocks.some((block) => block.type === "ProofBadge")
    ) {
      context.addIssue({
        code: "custom",
        message: "a verified scene requires a ProofBadge binding",
        path: ["blocks"],
      });
    }
  });

export type LabSceneBlockV2 = z.infer<typeof LabSceneBlockV2Schema>;
export type LabSceneDraftV2 = z.infer<typeof LabSceneDraftV2Schema>;
export type LabSceneV2 = z.infer<typeof LabSceneV2Schema>;
