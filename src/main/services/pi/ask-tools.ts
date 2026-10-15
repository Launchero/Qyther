/**
 * Where every tool family is bound into the one Ask-mode agent.
 *
 * This file is the assembly point the LangGraph node registry used to be. `node-registry.ts`
 * existed because a graph had to be told which nodes could stream tokens and what to call
 * them; here the registry is the toolbox list itself, and the label question is answered
 * from the family a tool belongs to (`families.ts`).
 *
 * **Adding a family is four edits, in this order:**
 *  1. add its `ToolFamily` guidance to `ask-prompt.ts` (the model must know it exists);
 *  2. add a key to `Toolboxes` in `families.ts`;
 *  3. add a toolbox under `tools/` that returns `PiTool[]`, degrading to `[]`;
 *  4. bind that factory into `buildAskToolboxes` below.
 *
 * `families.test.ts` then proves no tool name is claimed by two families, and
 * `buildAskFamilyIndex` throws at construction if one is — which is the failure a
 * hand-maintained name map would have hidden.
 *
 * A family left empty is *not* an error: `ask-prompt.ts` drops empty families from the
 * prompt, so the model is never told about a capability that has no tools.
 */
import { getDesktopToolbox } from "./agent";
import { buildFamilyIndex, TOOL_FAMILIES, type FamilyIndex, type Toolboxes } from "./families";
import { createPiWebToolbox } from "./tools/web-tools";
import { createPiUiToolbox } from "./tools/ui-tools";
import { getBrowserToolbox } from "./tools/browser-tools";
import { getDocumentToolbox } from "./tools/document-tools";
import { getMcpToolbox } from "./tools/mcp-tools";
import type { PiTool } from "./toolbox";

export { TOOL_FAMILIES };

/**
 * Build every toolbox. Desktop first because it is the only one that opens native handles;
 * the rest are cheap or already connected. Memoised at the call site in `ask-turn.ts`,
 * not here, so a test can inject its own set.
 */
export async function buildAskToolboxes(): Promise<Toolboxes> {
  // Every family is bound. An absent family is still a valid state — each builder returns
  // an empty array rather than throwing when its substrate is unavailable — and the prompt
  // drops a family with no tools so the model is never told about a capability it lacks
  // (see the file comment).
  const toolboxes: Partial<Record<(typeof TOOL_FAMILIES)[number], PiTool[]>> = {
    desktop: await getDesktopToolbox(),
    browser: await getBrowserToolbox(),
    document: await getDocumentToolbox(),
    web: createPiWebToolbox(),
    ui: createPiUiToolbox(),
    mcp: await getMcpToolbox(),
  };
  return toolboxes;
}

/**
 * The label lookup the translator uses. Kept as its own function so the translator can be
 * tested against a hand-built index while production builds it from the real toolboxes.
 */
export function buildAskFamilyIndex(toolboxes: Toolboxes): FamilyIndex {
  return buildFamilyIndex(toolboxes);
}