// Minimal ambient types for mammoth (ships no type definitions). We only use
// extractRawText to pull plain text out of .docx uploads.
declare module "mammoth" {
  interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface Input {
    buffer?: Buffer;
    path?: string;
    arrayBuffer?: ArrayBuffer;
  }
  export function extractRawText(input: Input): Promise<ExtractResult>;
  export function convertToHtml(input: Input): Promise<ExtractResult>;
  const _default: {
    extractRawText: typeof extractRawText;
    convertToHtml: typeof convertToHtml;
  };
  export default _default;
}
