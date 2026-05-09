declare module 'pdf-parse' {
  export class PDFParse {
    constructor(options: { data?: Buffer; url?: string });
    getText(): Promise<{ text: string; info: Record<string, unknown> }>;
    getInfo(): Promise<Record<string, unknown>>;
    destroy(): void;
  }
}
declare module 'mammoth';
declare module 'epub2';
