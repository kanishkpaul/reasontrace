import type { EventType } from "@reasontrace/format";
import type { ComponentType } from "react";
import { ActionIcon, ActivationIcon, AlertIcon, AnswerIcon, DecisionIcon, DerivationIcon, HypothesisIcon, ObservationIcon, ReasoningIcon, TranslationIcon, UpdateIcon } from "./icons";

type IconComponent = ComponentType<{ size?: number; stroke?: number; className?: string }>;

/** Display name and icon for each event type. Colour never carries the type alone. */
export const EVENT_TYPES: Record<EventType, { label: string; icon: IconComponent }> = {
  reasoning: { label: "Reasoning", icon: ReasoningIcon },
  hypothesis: { label: "Hypothesis", icon: HypothesisIcon },
  action: { label: "Action", icon: ActionIcon },
  observation: { label: "Observation", icon: ObservationIcon },
  belief_update: { label: "Belief update", icon: UpdateIcon },
  failure: { label: "Failure", icon: AlertIcon },
  decision: { label: "Decision", icon: DecisionIcon },
  final_answer: { label: "Final answer", icon: AnswerIcon },
  activation: { label: "Activations", icon: ActivationIcon },
  derivation: { label: "Derivation", icon: DerivationIcon },
  translation: { label: "Translation", icon: TranslationIcon },
};

export const EVENT_TYPE_ORDER = Object.keys(EVENT_TYPES) as EventType[];
