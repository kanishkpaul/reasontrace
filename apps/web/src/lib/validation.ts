import type { DecodedAttachment } from "@reasontrace/format";

/**
 * Whether a decoded attachment counts as validated. A validation made for
 * another decoder or another version of it does not count: a changed method
 * has to pass the harness again.
 */
export function validationOf(attachment: DecodedAttachment): { validated: boolean; reason: string | null } {
  const validation = attachment.validation;
  if (!validation) return { validated: false, reason: "No control was run for this decoder." };
  const { decoder } = validation;
  if (decoder.kind !== attachment.kind || decoder.version !== attachment.method.version) {
    return {
      validated: false,
      reason: `The validation is for ${decoder.name} version ${decoder.version} (${decoder.kind}); this was decoded by ${attachment.method.name} version ${attachment.method.version} (${attachment.kind}).`,
    };
  }
  return { validated: validation.status === "validated", reason: validation.reason };
}
