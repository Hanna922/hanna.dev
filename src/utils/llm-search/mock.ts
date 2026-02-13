import { createSourcesPrefix } from "./streaming";
import type { SourceRef } from "./types";

const MOCK_SOURCES: SourceRef[] = [
  {
    title: "React Fiber in Reconcile Phase",
    slug: "/posts/react-fiber-in-reconcile-phase/",
  },
  {
    title: "Building a Custom React Renderer",
    slug: "/posts/building-a-custom-react-renderer/",
  },
];

const MOCK_ANSWER = `React Fiber는 React 16에서 도입된 새로운 재조정(Reconciliation) 엔진입니다. 기존 Stack Reconciler의 한계를 극복하기 위해 설계되었으며, 작업을 작은 단위(fiber)로 나누어 비동기적으로 처리할 수 있는 것이 핵심입니다.

블로그 글에서 다룬 주요 내용은 다음과 같습니다:

- **Fiber 노드 구조**: 컴포넌트의 인스턴스와 1:1로 매핑되며, type, stateNode, child, sibling, return 등의 속성을 가집니다. (출처 1)

- **Reconcile Phase**: beginWork()와 completeWork() 두 단계를 거쳐 변경사항을 수집하고, Commit Phase에서 실제 DOM에 반영합니다. (출처 2)

- **비동기 처리**: 작업 우선순위 지정과 중단/재개가 가능해져, 사용자 인터랙션에 더 빠르게 반응할 수 있습니다.`;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMockStream() {
  const encoder = new TextEncoder();
  const chunkSize = 6;
  const chunkDelay = 40;

  const sourcePrefix = createSourcesPrefix(MOCK_SOURCES);

  let sourcesSent = false;
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sourcesSent) {
        controller.enqueue(encoder.encode(sourcePrefix));
        sourcesSent = true;
        await delay(chunkDelay);
        return;
      }

      if (offset >= MOCK_ANSWER.length) {
        controller.close();
        return;
      }

      const chunk = MOCK_ANSWER.slice(offset, offset + chunkSize);
      controller.enqueue(encoder.encode(chunk));
      offset += chunkSize;

      await delay(chunkDelay);
    },
  });
}
