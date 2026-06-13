export async function parseText(text: string): Promise<string> {
  return text.trim();
}

export async function parseTxtFile(buffer: Buffer): Promise<string> {
  return buffer.toString("utf8").trim();
}
