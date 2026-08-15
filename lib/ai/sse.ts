import type { SDKMessage } from "@cursor/sdk";

export const sseHeaders = {
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8",
};

export function createSseSender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  isClosed: () => boolean,
) {
  const encoder = new TextEncoder();

  return function send(event: string, data: unknown) {
    if (isClosed()) return;
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };
}

export function closeSseController(controller: ReadableStreamDefaultController<Uint8Array>) {
  try {
    controller.close();
  } catch {
    // The browser may have already dropped the connection.
  }
}

export function assistantTextDelta(message: SDKMessage): string {
  if (message.type !== "assistant") return "";

  return message.message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}
