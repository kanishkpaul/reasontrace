/**
 * A file name built from a trace title: characters that file systems reject
 * or treat specially (`/`, `:`, `*`, …) become `_`, and an empty result
 * falls back to "trace".
 */
export function fileNameFor(title: string, suffix: string): string {
  const base = title.replace(/[^\w.-]+/g, "_").replace(/^[_.]+|_+$/g, "") || "trace";
  return `${base}${suffix}`;
}

/** Hands the browser a file to save, and releases the object URL afterwards. */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
