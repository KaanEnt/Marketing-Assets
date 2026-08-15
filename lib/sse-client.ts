export type SseHandlers = Record<string, (data: never) => void>;

/**
 * Minimal SSE reader over fetch. EventSource cannot POST, and the generation
 * request needs a JSON body, so the stream is parsed by hand.
 */
export async function streamSse(
  url: string,
  body: unknown,
  handlers: Record<string, (data: Record<string, unknown>) => void>,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Events are separated by a blank line; keep the trailing partial in the buffer.
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const raw = chunk.match(/^data: (.+)$/m)?.[1];
      if (!event || !raw) continue;

      try {
        handlers[event]?.(JSON.parse(raw));
      } catch {
        // A malformed frame should not tear down the whole stream.
      }
    }
  }
}
