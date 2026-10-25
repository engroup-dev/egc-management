// Standard drawing file names: <project>-<map type>-v<version>.<ext>.
// The database names every upload (drawings.add_version, migration
// 20261025120000_drawings_file_naming.sql); this copy of the rule is only
// for previewing the name before upload. Keep the two in step.

// Characters Windows/macOS forbid in file names, and control characters.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g;
const MAX_PART_CHARS = 80;

/** One part of the name, cleaned so "-" only ever separates the parts. */
export function fileNamePart(value: string, fallback: string): string {
  const cleaned = value.replace(FORBIDDEN, "").replace(/-/g, "_").replace(/[\s_]+/g, "_");
  const capped = Array.from(cleaned).slice(0, MAX_PART_CHARS).join("");
  return capped.replace(/^[_.]+|[_.]+$/g, "") || fallback;
}

/** Lowercase extension if short and alphanumeric, otherwise "bin" (as the files service stores it). */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}

/** "Project_627H6I-خرائط_معمارية-v3.pdf" */
export function standardDrawingFileName(
  projectName: string,
  sectionName: string,
  version: number,
  originalFileName: string,
): string {
  return `${fileNamePart(projectName, "project")}-${fileNamePart(sectionName, "section")}-v${version}.${fileExtension(originalFileName)}`;
}
