import type { UIPayload } from "../langgraph/state";

const SOURCE_NODE = "browserSubgraph";

export function detectAndFormatUIPayload(
  taskResult: string,
  sourceNode?: string,
): UIPayload[] {
  const payloads: UIPayload[] = [];
  const node = sourceNode ?? SOURCE_NODE;

  let parsed: unknown;
  try {
    parsed = JSON.parse(taskResult);
  } catch {
    return payloads;
  }

  // Pattern 1: Table detection — array of objects with >= 2 shared keys, >= 3 items
  if (Array.isArray(parsed) && parsed.length >= 3) {
    const keys = parsed.map((item) =>
      typeof item === "object" && item !== null ? Object.keys(item) : [],
    );
    if (keys.length > 0 && keys[0].length > 0) {
      const commonKeys = keys[0].filter((k) => keys.every((ki) => ki.includes(k)));
      if (commonKeys.length >= 2) {
        payloads.push({
          type: "table",
          title: "Extracted Data",
          data: { columns: commonKeys.map((k) => ({ key: k, label: k })), rows: parsed },
          node,
        });
      }
    }
  }

  // Pattern 2: Chart detection — array with >= 3 items containing numeric value/amount/total
  if (Array.isArray(parsed) && parsed.length >= 3) {
    const hasNumericValues = parsed.some(
      (item: any) =>
        typeof item === "object" &&
        item !== null &&
        (typeof item.value === "number" ||
          typeof item.amount === "number" ||
          typeof item.total === "number"),
    );
    if (hasNumericValues) {
      const chartData = parsed.map((item: any) => ({
        name: item.name ?? item.label ?? item.category ?? "Item",
        value: item.value ?? item.amount ?? item.total ?? 0,
        category: item.category,
      }));
      payloads.push({
        type: "chart",
        title: "Data Visualization",
        data: { chartType: "bar", data: chartData, xKey: "name", yKey: "value" },
        node,
      });
    }
  }

  // Pattern 3: Comparison detection — object with >= 2 named entities sharing >= 2 attributes
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed);
    if (entries.length >= 2) {
      const hasComparableEntities = entries.every(
        ([, value]) => typeof value === "object" && value !== null,
      );
      if (hasComparableEntities) {
        const criteria = new Set<string>();
        entries.forEach(([, value]) => {
          if (typeof value === "object" && value !== null) {
            Object.keys(value).forEach((k) => criteria.add(k));
          }
        });
        if (criteria.size >= 2) {
          const items = entries.map(([name, value]) => ({
            name,
            attributes: typeof value === "object" ? value : { value: String(value) },
          }));
          const criteriaList = Array.from(criteria).map((k) => ({ key: k, label: k }));
          payloads.push({
            type: "comparison",
            title: "Comparison",
            data: { criteria: criteriaList, items },
            node,
          });
        }
      }
    }
  }

  // Pattern 4: Form detection — object with >= 3 primitive key-value pairs
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const formFields = Object.entries(parsed)
      .filter(
        ([, value]) =>
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean",
      )
      .map(([key, value]) => ({
        name: key,
        label: key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (s) => s.toUpperCase()),
        type:
          typeof value === "boolean"
            ? "checkbox"
            : typeof value === "number"
              ? "number"
              : "text",
        value,
      }));

    if (formFields.length >= 3) {
      payloads.push({
        type: "form",
        title: "Configuration Form",
        data: { fields: formFields },
        node,
      });
    }
  }

  return payloads;
}
