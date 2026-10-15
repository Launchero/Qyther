/**
 * Pi-native generative-UI toolbox: the `ui` family
 * (`create_table`, `create_form`, `create_comparison`, `create_chart`, `create_list`).
 *
 * These replace `chatModel.withStructuredOutput(schema, { method: "jsonMode" })` plus the
 * post-parse validity filter the LangGraph nodes ran. A Pi tool's `parameters` schema IS
 * the structured output — the model fills it, and the payload rides back in
 * `details.uiPayload` for the chat pump (`ask-events.ts` reads it off
 * `tool_execution_end`). No second model round trip, no `JSON.parse` of a string.
 *
 * Shapes mirror the old Zod schemas (`comparisonOutputSchema`, `formOutputSchema`,
 * `chartOutputSchema`) and the `{ columns, rows }` table the post-process node built.
 * The `form` and `list` payloads carry their data as a bare array because that is what
 * the renderer reads: `GenerativeUI/index.tsx` casts `data` straight to `FormField[]`
 * (`:35`) and only renders the list branch for `Array.isArray(data)` (`:62`). An object
 * there renders nothing (list) or throws in `FormPreview`'s `reduce` (form), so the cast
 * on those two is load-bearing, not convenience.
 *
 * Deliberately no hand-written `validate()` pass: the renderer components validate
 * defensively and fall back to a JSON dump. Each tool guards only its missing/blank
 * required argument and returns `fail(...)` rather than throwing — tools never throw.
 */
import { Type, StringEnum } from "@earendil-works/pi-ai";

import { fail, text, type PiTool } from "../toolbox";

/** Non-empty-string check for the one required scalar each chart/table title defaults. */
function titled(title: unknown, fallback: string): string {
  return typeof title === "string" && title.trim().length > 0 ? title : fallback;
}

/** Required-array guard shared by every tool: missing or empty reads as a model error. */
function missingList(value: unknown): boolean {
  return !Array.isArray(value) || value.length === 0;
}

export function createTableTool(): PiTool {
  return {
    name: "create_table",
    label: "Create table",
    description:
      "Render several comparable rows as an interactive data table. Pass columns once and one object per row keyed by column key. Call this rather than writing the data as prose or a markdown table.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Short title shown above the table" })),
      columns: Type.Array(
        Type.Object({
          key: Type.String({ description: "Row-object key for this column" }),
          label: Type.String({ description: "Human-readable column header" }),
        }),
        { description: "Columns in display order" },
      ),
      rows: Type.Array(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()])), {
        description: "One object per row, keyed by column key",
      }),
    }),
    async execute(_id, params) {
      try {
        const { title, columns, rows } = (params ?? {}) as {
          title?: string;
          columns?: Array<{ key: string; label: string }>;
          rows?: Array<Record<string, string | number>>;
        };
        if (missingList(columns)) return fail("Create table failed", new Error("columns must be a non-empty array"));
        if (missingList(rows)) return fail("Create table failed", new Error("rows must be a non-empty array"));
        const name = titled(title, "Table");
        return text(`Created table "${name}" with ${rows!.length} rows and ${columns!.length} columns.`, "complete", {
          uiPayload: { type: "table", title: name, data: { columns, rows }, node: "ui" },
        });
      } catch (e) {
        return fail("Create table failed", e);
      }
    },
  };
}

export function createFormTool(): PiTool {
  return {
    name: "create_form",
    label: "Create form",
    description:
      "Render fields a user needs to fill in as an interactive form. Pass one entry per field with its input type and default value. Call this rather than describing the fields as prose.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Short title shown above the form" })),
      targetUrl: Type.Optional(Type.String({ description: "File path or URL where the form data will be saved" })),
      fields: Type.Array(
        Type.Object({
          name: Type.String({ description: "Field key (e.g. 'apiEndpoint')" }),
          label: Type.String({ description: "Human-readable label" }),
          type: StringEnum(["text", "email", "number", "textarea", "select", "checkbox"], {
            description: "Input type",
          }),
          value: Type.Union([Type.String(), Type.Number(), Type.Boolean()], {
            description: "Default or pre-filled value",
          }),
          options: Type.Optional(Type.Array(Type.String(), { description: "Options for select fields" })),
          required: Type.Optional(Type.Boolean({ description: "Whether the field is required" })),
        }),
        { description: "Form fields to render" },
      ),
    }),
    async execute(_id, params) {
      try {
        const { title, targetUrl, fields } = (params ?? {}) as {
          title?: string;
          targetUrl?: string;
          fields?: Array<Record<string, unknown>>;
        };
        if (missingList(fields)) return fail("Create form failed", new Error("fields must be a non-empty array"));
        const name = titled(title, "Configuration Form");
        const target = typeof targetUrl === "string" && targetUrl.trim() ? ` (target: ${targetUrl})` : "";
        return text(`Created form "${name}" with ${fields!.length} fields${target}.`, "complete", {
          // Bare array: the renderer's form branch reads `data` itself as the field list.
          uiPayload: {
            type: "form",
            title: name,
            data: fields as unknown as Record<string, unknown>,
            node: "ui",
          },
        });
      } catch (e) {
        return fail("Create form failed", e);
      }
    },
  };
}

export function createComparisonTool(): PiTool {
  return {
    name: "create_comparison",
    label: "Create comparison",
    description:
      "Render two or more options against shared criteria as a comparison table. Criteria keys must match the attribute keys on every item. Call this rather than writing the comparison as prose.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Short title (e.g. 'Apples vs Oranges')" })),
      criteria: Type.Array(
        Type.Object({
          key: Type.String({ description: "Attribute key matching items' attribute keys" }),
          label: Type.String({ description: "Human-readable column label" }),
        }),
        { description: "Comparison criteria/columns" },
      ),
      items: Type.Array(
        Type.Object({
          name: Type.String({ description: "Name of the item being compared" }),
          attributes: Type.Array(
            Type.Object({
              key: Type.String({ description: "Attribute name (e.g. 'Performance')" }),
              value: Type.String({ description: "Attribute value (concise, 1-3 words)" }),
            }),
            { description: "Attribute key-value pairs for this item" },
          ),
        }),
        { description: "Items being compared" },
      ),
    }),
    async execute(_id, params) {
      try {
        const { title, criteria, items } = (params ?? {}) as {
          title?: string;
          criteria?: Array<{ key: string; label: string }>;
          items?: Array<{ name: string; attributes: Array<{ key: string; value: string }> }>;
        };
        if (missingList(criteria)) {
          return fail("Create comparison failed", new Error("criteria must be a non-empty array"));
        }
        if (missingList(items)) return fail("Create comparison failed", new Error("items must be a non-empty array"));
        const name = titled(title, "Comparison");
        return text(
          `Created comparison "${name}" with ${items!.length} items across ${criteria!.length} criteria.`,
          "complete",
          { uiPayload: { type: "comparison", title: name, data: { title: name, criteria, items }, node: "ui" } },
        );
      } catch (e) {
        return fail("Create comparison failed", e);
      }
    },
  };
}

/** A chart point whose value survived: numeric and finite, exactly the old `chartNode` filter. */
interface ChartPoint {
  name: string;
  value: number;
  category?: string;
}

/**
 * The old `chartNode` line, kept verbatim in spirit:
 * `parsed.data.filter((d) => typeof d.value === "number" && isFinite(d.value))`.
 * `Number.isFinite` needs no coercion guard because the `typeof` check already ran.
 */
function cleanChartData(data: unknown): ChartPoint[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (d): d is ChartPoint =>
      typeof d === "object" && d !== null && typeof (d as ChartPoint).value === "number" &&
      Number.isFinite((d as ChartPoint).value),
  );
}

export function createChartTool(): PiTool {
  return {
    name: "create_chart",
    label: "Create chart",
    description:
      "Render a numeric series over categories as a bar, line, area or pie chart. Use bar for comparisons, line for trends, pie for proportions, area for cumulative trends. Call this rather than writing the numbers as prose.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Short title for the chart" })),
      chartType: StringEnum(["bar", "line", "area", "pie"], { description: "Chart visualization type" }),
      description: Type.Optional(Type.String({ description: "What the chart shows" })),
      data: Type.Array(
        Type.Object({
          name: Type.String({ description: "Label for the data point" }),
          value: Type.Number({ description: "Numeric value" }),
          category: Type.Optional(Type.String({ description: "Optional group for grouped charts" })),
        }),
        { description: "Data points to visualize (3-12)" },
      ),
      xKey: Type.Optional(Type.String({ description: "Data field for the x axis (default: name)" })),
      yKey: Type.Optional(Type.String({ description: "Data field for the y axis (default: value)" })),
    }),
    async execute(_id, params) {
      try {
        const { title, chartType, description, data, xKey, yKey } = (params ?? {}) as {
          title?: string;
          chartType?: string;
          description?: string;
          data?: unknown;
          xKey?: string;
          yKey?: string;
        };
        if (typeof chartType !== "string" || chartType.trim().length === 0) {
          return fail("Create chart failed", new Error("chartType must be one of bar, line, area, pie"));
        }
        if (missingList(data)) return fail("Create chart failed", new Error("data must be a non-empty array"));
        const valid = cleanChartData(data);
        if (valid.length === 0) {
          return fail("Create chart failed", new Error("data has no valid numeric values to plot"));
        }
        const name = titled(title, "Chart Visualization");
        const dropped = (data as unknown[]).length - valid.length;
        const note = dropped > 0 ? ` (${dropped} non-numeric ${dropped === 1 ? "point" : "points"} dropped)` : "";
        return text(`Created ${chartType} chart "${name}" with ${valid.length} data points${note}.`, "complete", {
          uiPayload: {
            type: "chart",
            title: name,
            data: {
              title: name,
              chartType,
              description: typeof description === "string" ? description : "",
              data: valid,
              xKey: typeof xKey === "string" && xKey ? xKey : "name",
              yKey: typeof yKey === "string" && yKey ? yKey : "value",
            },
            node: "ui",
          },
        });
      } catch (e) {
        return fail("Create chart failed", e);
      }
    },
  };
}

export function createListTool(): PiTool {
  return {
    name: "create_list",
    label: "Create list",
    description:
      "Render a plain ordered set as a bullet list. Use for steps, takeaways, or item collections with no columns to compare and no numbers to plot. This is the first producer of the renderer's list branch — nothing before it built one.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Short title shown above the list" })),
      items: Type.Array(Type.String({ description: "One list entry" }), { description: "Entries in display order" }),
    }),
    async execute(_id, params) {
      try {
        const { title, items } = (params ?? {}) as { title?: string; items?: string[] };
        if (missingList(items)) return fail("Create list failed", new Error("items must be a non-empty array"));
        const name = titled(title, "List");
        return text(`Created list "${name}" with ${items!.length} items.`, "complete", {
          // Bare array: the renderer's list branch only renders `Array.isArray(data)`.
          uiPayload: { type: "list", title: name, data: items as unknown as Record<string, unknown>, node: "ui" },
        });
      } catch (e) {
        return fail("Create list failed", e);
      }
    },
  };
}

/** The `ui` family: one tool per value of `GENERATIVE_UI_TYPES`. */
export function createPiUiToolbox(): PiTool[] {
  return [createTableTool(), createFormTool(), createComparisonTool(), createChartTool(), createListTool()];
}
