// @vitest-environment node
/**
 * `document-tools.ts` imports production code only: the five factories and
 * `getDocumentToolbox`, the real `text`/`fail` builders via the tools, and the real
 * executor/verifier/loader underneath — no mocks except `electron`, which
 * `toolbox.ts` imports at module scope. Files written here land in the real
 * `~/Documents` sandbox and are removed in `afterAll`, same as `document-executor.test.ts`.
 */
import { describe, it, expect, vi, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("electron", () => ({
  clipboard: { readText: vi.fn(), writeText: vi.fn(), clear: vi.fn() },
}));

import type { TextContent } from "@earendil-works/pi-ai";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { PiToolDetails } from "../toolbox";
import { getDocumentsFolder } from "../../document/document-executor";
import { getDocumentToolbox } from "./document-tools";

const MARKER = "QytherDocToolProbe";
const written: string[] = [];

function bodyOf(result: { content: Array<{ type: string }> }): string {
  return (result.content[0] as TextContent).text;
}

function filePathOf(result: AgentToolResult<PiToolDetails>): string {
  return result.details.filePath as string;
}

afterAll(() => {
  for (const filePath of written) rmSync(filePath, { force: true });
});

describe("Pi document toolbox", () => {
  it("exposes exactly the five names ask-prompt.ts advertises, with no duplicates", async () => {
    const tools = await getDocumentToolbox();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_docx",
      "create_pptx",
      "create_xlsx",
      "modify_document",
      "read_document",
    ]);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it("writes every create result inside the ~/Documents sandbox", async () => {
    const tools = await getDocumentToolbox();
    const root = getDocumentsFolder();
    for (const name of ["create_docx", "create_pptx", "create_xlsx"] as const) {
      const tool = tools.find((t) => t.name === name)!;
      const param = name === "create_docx" ? { sections: [{ heading: `${MARKER} H`, paragraphs: [`${MARKER} body`] }] }
        : name === "create_pptx" ? { slides: [{ title: `${MARKER} S`, bulletPoints: [`${MARKER} bullet`] }] }
        : { sheets: [{ name: "Data", headers: ["h"], rows: [[`${MARKER} cell`]] }] };
      const result = await tool.execute("1", { title: `${MARKER} ${name}`, ...param });
      expect(result.details.status).toBe("complete");
      expect(filePathOf(result).startsWith(root)).toBe(true);
      expect(existsSync(filePathOf(result))).toBe(true);
      written.push(filePathOf(result));
    }
  });

  it("sets details.verifies on every writing tool", async () => {
    const tools = await getDocumentToolbox();
    const docx = tools.find((t) => t.name === "create_docx")!;
    const created = await docx.execute("1", { title: `${MARKER} verifies`, sections: [{ heading: `${MARKER} V` }] });
    written.push(filePathOf(created));
    expect(created.details.verifies).toBe(true);
    const modified = await tools
      .find((t) => t.name === "modify_document")!
      .execute("1", { filePath: filePathOf(created), operation: "append", content: `${MARKER} appended` });
    expect(modified.details.verifies).toBe(true);
    written.push(filePathOf(modified));
  });

  it("leaves details.verifies unset on read_document", async () => {
    const tools = await getDocumentToolbox();
    const docx = tools.find((t) => t.name === "create_docx")!;
    const created = await docx.execute("1", { title: `${MARKER} readable`, sections: [{ heading: `${MARKER} R` }] });
    written.push(filePathOf(created));
    const read = await tools.find((t) => t.name === "read_document")!.execute("1", { filePath: filePathOf(created) });
    expect(read.details.status).toBe("complete");
    expect(read.details.verifies).toBeUndefined();
    expect(bodyOf(read)).toContain(MARKER);
  });

  it("reads back what create_docx wrote", async () => {
    const tools = await getDocumentToolbox();
    const created = await tools
      .find((t) => t.name === "create_docx")!
      .execute("1", { title: `${MARKER} roundtrip`, sections: [{ heading: `${MARKER} Alpha`, paragraphs: [`alpha ${MARKER}`] }] });
    written.push(filePathOf(created));
    const read = await tools.find((t) => t.name === "read_document")!.execute("1", { filePath: filePathOf(created) });
    expect(bodyOf(read)).toContain(`${MARKER} Alpha`);
    expect(bodyOf(read)).toContain(`alpha ${MARKER}`);
  });

  it("modify_document appends and reports a new verified file, leaving the source alone", async () => {
    const tools = await getDocumentToolbox();
    const created = await tools
      .find((t) => t.name === "create_docx")!
      .execute("1", { title: `${MARKER} source`, sections: [{ heading: `${MARKER} Orig`, paragraphs: [`orig ${MARKER}`] }] });
    written.push(filePathOf(created));
    const source = filePathOf(created);
    const modified = await tools
      .find((t) => t.name === "modify_document")!
      .execute("1", { filePath: source, operation: "append", content: `${MARKER} new section` });
    expect(modified.details.status).toBe("complete");
    const updated = filePathOf(modified);
    written.push(updated);
    expect(updated).not.toBe(source);
    expect(existsSync(source)).toBe(true);
    const read = await tools.find((t) => t.name === "read_document")!.execute("1", { filePath: updated });
    expect(bodyOf(read)).toContain(`${MARKER} new section`);
  });

  it("never throws on bad input — every tool answers with an isError result", async () => {
    const tools = await getDocumentToolbox();
    const bad: Record<string, unknown[]> = {
      create_docx: [{}, { title: "" }, { title: 42 }, { sections: [] }],
      create_pptx: [{}, { title: "  " }, { slides: [] }],
      create_xlsx: [{}, { sheets: [] }],
      read_document: [{}, { filePath: "" }, { filePath: 42 }, { filePath: "../evil.docx" }],
      modify_document: [{}, { filePath: "x.docx" }, { filePath: "x.docx", operation: "explode", content: "y" }, { content: "" }],
    };
    for (const tool of tools) {
      for (const params of bad[tool.name]!) {
        const result = await tool.execute("1", params);
        expect(result.isError, `${tool.name} ${JSON.stringify(params)}`).toBe(true);
        expect(result.details.status).toBeTruthy();
      }
    }
  });

  it("rejects sandbox escapes without writing anything outside Documents", async () => {
    const tools = await getDocumentToolbox();
    const escapes = [
      "../evil.docx",
      "..\\evil.docx",
      path.join(os.tmpdir(), `${MARKER}-escape.docx`),
      "C:\\Windows\\Temp\\evil.docx",
      "/etc/evil.docx",
    ];
    for (const filePath of escapes) {
      const read = await tools.find((t) => t.name === "read_document")!.execute("1", { filePath });
      expect(read.isError).toBe(true);
      expect(bodyOf(read)).toContain("Documents");
      const created = await tools.find((t) => t.name === "create_docx")!.execute("1", {
        title: filePath,
        sections: [{ heading: "x" }],
      });
      // Title is sanitized into the sandbox, never treated as a path.
      expect(filePathOf(created).startsWith(getDocumentsFolder())).toBe(true);
      written.push(filePathOf(created));
    }
    expect(existsSync(path.join(os.tmpdir(), `${MARKER}-escape.docx`))).toBe(false);
  });

  it("modify_document fails readably on a missing source instead of throwing", async () => {
    const tools = await getDocumentToolbox();
    const result = await tools
      .find((t) => t.name === "modify_document")!
      .execute("1", { filePath: `${MARKER}-absent.docx`, operation: "append", content: "new" });
    expect(result.isError).toBe(true);
    expect(result.details.status).toBeTruthy();
  });
});
