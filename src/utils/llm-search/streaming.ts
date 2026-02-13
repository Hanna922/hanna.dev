import type { SourceRef } from "./types";

const encoder = new TextEncoder();

export function createSourcesPrefix(sources: SourceRef[]) {
  return (
    "<!-- SOURCES_START -->" +
    JSON.stringify(sources) +
    "<!-- SOURCES_END -->\n"
  );
}

export function createTextStreamResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

export function mergeSourcesAndStream(
  textStream: AsyncIterable<string>,
  sources: SourceRef[]
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (sources.length > 0) {
        controller.enqueue(encoder.encode(createSourcesPrefix(sources)));
      }

      for await (const chunk of textStream) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}
