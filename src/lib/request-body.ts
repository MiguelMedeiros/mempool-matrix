export type LimitedJsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; kind: "oversized" | "invalid"; message: string };

export async function readLimitedJsonObject(request: Request, maxBytes: number): Promise<LimitedJsonBodyResult> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { ok: false, kind: "invalid", message: "Content-Type must be application/json." };
  }

  if (!request.body) {
    return { ok: false, kind: "invalid", message: "Request body must be valid JSON." };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await cancelReader(reader);
        return { ok: false, kind: "oversized", message: "Request body is too large." };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    await cancelReader(reader);
    return { ok: false, kind: "invalid", message: "Could not read request body." };
  } finally {
    reader.releaseLock();
  }

  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, kind: "invalid", message: "Request body must be a JSON object." };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, kind: "invalid", message: "Request body must be valid JSON." };
  }
}

const MIME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) return false;
  const value = contentType.trim();
  const separator = value.indexOf(";");
  const mediaType = (separator === -1 ? value : value.slice(0, separator)).trim().toLowerCase();
  if (mediaType !== "application/json") return false;
  if (separator === -1) return true;

  let position = separator;
  while (position < value.length) {
    if (value[position] !== ";") return false;
    position = skipWhitespace(value, position + 1);

    const nameStart = position;
    while (position < value.length && !/[\s=;]/.test(value[position])) position += 1;
    const name = value.slice(nameStart, position);
    if (!MIME_TOKEN.test(name)) return false;

    position = skipWhitespace(value, position);
    if (value[position] !== "=") return false;
    position = skipWhitespace(value, position + 1);

    if (value[position] === '"') {
      position = consumeQuotedString(value, position + 1);
      if (position === -1) return false;
    } else {
      const valueStart = position;
      while (position < value.length && !/[\s;]/.test(value[position])) position += 1;
      if (!MIME_TOKEN.test(value.slice(valueStart, position))) return false;
    }

    position = skipWhitespace(value, position);
    if (position < value.length && value[position] !== ";") return false;
  }
  return true;
}

function skipWhitespace(value: string, position: number): number {
  while (position < value.length && (value[position] === " " || value[position] === "\t")) position += 1;
  return position;
}

function consumeQuotedString(value: string, position: number): number {
  while (position < value.length) {
    const character = value[position];
    if (character === '"') return position + 1;
    if (character === "\\") {
      position += 1;
      if (position >= value.length || !isQuotedCharacter(value[position])) return -1;
    } else if (!isQuotedCharacter(character)) {
      return -1;
    }
    position += 1;
  }
  return -1;
}

function isQuotedCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return character === "\t" || (code >= 0x20 && code !== 0x7f);
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The original read/limit error determines the response.
  }
}
