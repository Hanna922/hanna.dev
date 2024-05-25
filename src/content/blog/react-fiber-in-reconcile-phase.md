---
author: Hanna922
pubDatetime: 2024-05-25T5:31:52.000Z
modDatetime:
title: React Fiber in Reconcile Phase
featured: false
draft: false
tags:
  - React
  - Reconcile
  - Fiber Architecture
  - Principle of Operation
  - Deep Dive
description: React Reconcile Phase의 Fiber 샅샅이 뜯어보기!
---

해당 게시글은 React v18.3.0을 기준으로 작성되었습니다.

## 사전 지식

**React의 동작 단계**

- Render Phase: JSX 선언 또는 React.createElement()를 통해 일반 객체인 React Element를 생성
- Reconcile Phase: 이전에 렌더링된 실제 DOM Tree와 새롭게 렌더링할 React Element를 비교하여 변경된 부분을 파악, React Element를 FiberNode로 변환
- Commit Phase: 새로운 DOM Element를 브라우저에 반영(커밋)
- Update Phase: state, props 변경 시 해당 컴포넌트와 하위 컴포넌트에 대해 위 과정을 반복

**ReactElement Object**

React Element는 Class가 아닌 일반 객체로, 사용자가 작성한 Component, Element Type, Attribute, Children 등을 갖고 있다.

```tsx
// packages/react/src/ReactElement.js (v18.3.0)
const ReactElement = function (type, key, ref, self, source, owner, props) {
  const element = {
    // This tag allows us to uniquely identify this as a React Element
    $$typeof: REACT_ELEMENT_TYPE,

    // Built-in properties that belong on the element
    type: type,
    key: key,
    ref: ref,
    props: props,

    // Record the component responsible for creating this element.
    _owner: owner,
  };
  ...
  return element;
};
```

**두 가지 의미의 Fiber**

Fiber는 Reconciliation Algorithm을 나타내기도 하지만 Rendering Work Unit을 나타내기도 한다. 따라서 Fiber가 어떤 의미를 가지고 있는지 파악하는 것은 굉장히 중요하다. 이번 글에서는 대부분의 글에서 사용하는 용어를 따라 Architecture로서의 Fiber를 Fiber, Rendering Work Unit으로서의 Fiber를 FiberNode로 구분하여 사용하겠다!

**singly linked list for FiberNode**

FiberNode는 수많은 속성들을 가지고 있지만, 크게 정리하자면 3가지 요소로 구분할 수 있으며 단일 연결 리스트(singly linked list)를 사용하고 있다.

- tag, key, type: 생성할 react component와 관련된 요소
- return, child, sibling, index: singly linked list tree structure
- nextEffect, firstEffect, lastEffect: 변경 사항과 관련된 요소

```tsx
export type Fiber = {
  // Tag identifying the type of fiber.
  tag: WorkTag,
  // Unique identifier of this child.
  key: null | string,
  // The resolved function/class/ associated with this fiber.
  type: any,

  return: Fiber | null,
  // Singly Linked List Tree Structure.
  child: Fiber | null,
  sibling: Fiber | null,
  index: number,

  // Singly linked list fast path to the next fiber with side-effects.
  nextEffect: Fiber | null,
  // The first and last fiber with side-effect within this subtree.
  // This allows us to reuse a slice of the linked list
  // when we reuse the work done within this fiber.
  firstEffect: Fiber | null,
  lastEffect: Fiber | null,
  ...
}
```

<img src="/blog/react-fiber-in-reconcile-phase/image.png" alt="singly linked list for FiberNode" />

---

# Fiber in Reconcile Algorithm

이제 본격적으로 React Reconcile Phase에서의 Fiber를 살펴보자.

## **1. Render Phase**

React 앱을 브라우저에 그리기 위해서는 ReactDOM.createRoot()로부터 시작된다.

```tsx
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
```

사실 React 코드를 살펴보면서 react-dom package와 react-reconciler package가 상호작용하는 부분을 파악하기가 까다로웠다. （◞‸◟） 차근차근 살펴보자..!

## createRoot()

```tsx
// packages/react-dom/src/client/ReactDOMRoot.js (v18.3.0)
import {
  createContainer,
  ...
} from 'react-reconciler/src/ReactFiberReconciler';

export function createRoot(
  container: Element | Document | DocumentFragment,
  options?: CreateRootOptions,
): RootType {
  ...
  const root = createContainer(
    ...
  );
}
```

createRoot()는 몇 가지 플래그를 설정한 후 react-reconciler package의 createContainer()를 호출하며 그 값을 root에 할당한다.

## createContainer()

```tsx
// packages/react-reconciler/src/ReactFiberReconciler.new.js (v18.3.0)
export function createContainer(
  ...
): OpaqueRoot {
  const hydrate = false;
  const initialChildren = null;
  return createFiberRoot(
    containerInfo,
    tag,
    hydrate,
    initialChildren,
    hydrationCallbacks,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks
  );
}
```

createContainer()는 createFiberRoot()를 호출하여 고유한 FiberRootNode를 생성한다. createContainer()의 타입인 OpaqueRoot는 React 내부에서 Root Node를 추적하고 관리하는 데 사용된다.

> **여기서 궁금한 점 🧐**
>
> Q. Root Node를 추적, 관리하는 곳에 사용되는 타입의 이름이 왜 'OpaqueRoot'일까?
>
> Opaque는 '불투명한'이라는 뜻을 가지고 있다. OpaqueRoot는 Root Node에 대한 정보를 추상화하여 내부적으로 관리할 수 있게 하는데, 즉 해당 타입의 내부 구현 사항을 외부에서 볼 수 없게 하고, 추상화하여 감추는 역할을 한다는 것을 나타내기 위함이다.

## createFiberRoot()

```tsx
// packages/react-reconciler/src/ReactFiberRoot.new.js (v18.3.0)
export function createFiberRoot(
  ...
): FiberRoot {
  const root: FiberRoot = (new FiberRootNode(
    ...
  ));
  ...
  // Cyclic construction.
  // This cheats the type system right now because stateNode is any.
  const uninitializedFiber = createHostRootFiber(
    tag,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
  );
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;
  ...
  return root;
}
```

위 코드를 보면 FiberRootNode와는 별개로 HostRoot type의 FiberNode를 하나 더 생성하여 root.current에 할당하는 것을 확인할 수 있다. FiberRootNode인 root는 정적인 상태의 노드이며 HostRootFiber인 uninitializedFiber는 화면이 변경되는 것을 파악하기 위해 사용되는 FiberNode이다. 따라서 Reconcile Phase에서는 HostRootFiber인 uninitializedFiber를 사용하게 된다.

이후 uninitializedFiber.stateNode에는 root를 할당하여 순환 참조가 가능하게 한다.

(맨 처음 createRoot에서 root에 할당되던 값은 createFiberRoot의 root.current 값이며 이는 DOM element에 React root로 저장된다.)

**이렇게 Root FiberNode를 생성한 후 React Reconciler는 workLoopConcurrent()를 호출하여 Reconcile Phase를 시작한다.**

## **2. Reconcile Phase**

## workLoopConcurrent()

모든 Reconcile 과정은 workLoopConcurrent()에서 수행된다.
작업할 FiberNode가 남아있고, Scheduler가 yield를 요청하지 않는 한 performUnitOfWork()를 호출하여 작업을 수행한다.

여기서 `shouldYield()`는 browser가 main thread에 다른 중요한 task(ex. 사용자 입력 처리)를 수행할 필요가 있는지 판단한다.
`shouldYield()`가 true를 반환하면, React Scheduler는 작업을 일시 중단(yield)하고 browser에 제어권을 넘긴다.

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

Reconciler는 FiberNode를 하나의 작업 단위(unitOfWork)로 취급한다.
즉, FiberNode는 렌더링에 필요한 정보를 담고 있는 객체이자 Reconcile(재조정) 작업 단위이다.

## performUnitOfWork()

performUnitOfWork(unitOfWork: Fiber)는 FiberNode를 작업 단위로 처리하는 역할을 한다.
처리해야 하는 FiberNode가 남아있다면 beginWork()를 호출하고 다음 작업 단위(FiberNode)를 workInProgress에 할당한다.

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function performUnitOfWork(unitOfWork: Fiber): void {
  // The current, flushed, state of this fiber is the alternate. Ideally
  // nothing should rely on this, but relying on it here means that we don't
  // need an additional field on the work in progress.
  const current = unitOfWork.alternate;
  setCurrentDebugFiberInDEV(unitOfWork);

  let next;
  if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);
    next = beginWork(current, unitOfWork, entangledRenderLanes);
    stopProfilerTimerIfRunningAndRecordDelta(unitOfWork, true);
  } else {
    next = beginWork(current, unitOfWork, entangledRenderLanes);
  }

  resetCurrentDebugFiberInDEV();
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
}
```

위 코드를 보면 performUnitOfWork()는 크게 beginWork()와 completeUnitOfWork()로 구성되어 있다는 것을 알 수 있다.

가장 첫 줄인 `const current = unitOfWork.alternate;`는 현재 작업할 노드를 설정하는 것이다.
이전 Snapshot의 Node(unitOfWork)에 대응되는 새로운 노드를 새로운 작업 대상(current)으로 설정한다.
즉, 앞에서 살펴보았던 HostRootFiber인 uninitializedFiber가 이전 Snapshot을 가지고 있을 것이고, alternate로 가져온 current Snapshot을 탐색하면서 Reconcile 작업을 수행하게 된다.

첫 unitOfWork는 Root Container FiberNode가 될 것이다.

## beginWork()

beginWork()는 해당 FiberNode가 변경되었는지 확인하고, 변경된 부분이 없다면 workInProgress.tag 값에 따라 해당 FiberNode를 업데이트한다.

beginWork()는 switch case 이전과 이후로 나눌 수 있는데, 이전에는 Component Update 여부 판단과 변경사항 확인을 통해 initial render인지 re-render인지 판단한다.

```tsx
// packages/react-reconciler/src/ReactFiberBeginWork.new.js
function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {
  ...
    switch (workInProgress.tag) {
    case HostRoot:
      return updateHostRoot(current, workInProgress, renderLanes);
    }
    ...
}
export { beginWork };
```

첫 unitOfWork는 Root Container FiberNode이므로 workInProgress는 HostRoot가 될 것이다.
따라서 updateHostRoot()를 호출하게 된다.

## updateHostRoot()

```tsx
// packages/react-reconciler/src/ReactFiberBeginWork.new.js
function updateHostRoot(current, workInProgress, renderLanes) {
  pushHostRootContext(workInProgress);

  if (current === null) {
    throw new Error('Should have a current fiber. This is a bug in React.');
  }

  const nextProps = workInProgress.pendingProps;
  const prevState = workInProgress.memoizedState;
  const prevChildren = prevState.element;
  cloneUpdateQueue(current, workInProgress);
  processUpdateQueue(workInProgress, nextProps, null, renderLanes);

  const nextState: RootState = workInProgress.memoizedState;
  const root: FiberRoot = workInProgress.stateNode;
  ...
  // Caution: React DevTools currently depends on this property being called "element".
  const nextChildren = nextState.element;
  if (supportsHydration && prevState.isDehydrated) {
    ...
  } else {
    // Root is not dehydrated. Either this is a client-only root, or it already hydrated.
    resetHydrationState();
    if (nextChildren === prevChildren) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    }
    reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  }
  return workInProgress.child;
}
```

updateHostRoot 메서드는 HostRoot Component 내부를 갱신하는 함수이다. 최초 렌더링이므로 prevState, prevChildren은 null일 것이다. props도 주어지지 않았으므로 nextProps는 null일 것이다. 먼저 processUpdateQueue 메서드를 호출하게 된다.

## processUpdateQueue()

processUpdateQueue()는 FiberNode의 Update queue를 처리하고, 최종 상태를 계산한다. 순서대로 작성해보자면 다음과 같은 역할을 수행한다.

1. Update queue 처리
2. 최종 상태 계산
3. 상태 병합

```tsx
// packages/react-reconciler/src/ReactFiberClassUpdateQueue.new.js
export function processUpdateQueue<State>(
  workInProgress: Fiber,
  props: any,
  instance: any,
  renderLanes: Lanes,
): void {
  // This is always non-null on a ClassComponent or HostRoot
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;
  ...
  // These values may change as we process the queue.
  if (firstBaseUpdate !== null) {
    do {
      if (shouldSkipUpdate) {
        ...
      } else {
        // Process this update.
        newState = getStateFromUpdate(
          workInProgress,
          queue,
          update,
          newState,
          props,
          instance,
        );
        ...
      }
      ...
    } while (true);
    ...
    workInProgress.memoizedState = newState;
  }
  ...
}
```

processUpdateQueue() 내의 getStateFromUpdate()에서 반환된 newState를 workInProgress.memoizedState에 할당한다. getStateFromUpdate()는 각 업데이트 항목을 처리하여 새로운 상태를 계산하는 함수이다. 이때 newState에는 element 필드가 존재한다.

## 다시 updateHostRoot()로 돌아와서,

```tsx
// packages/react-reconciler/src/ReactFiberBeginWork.new.js
function updateHostRoot(current, workInProgress, renderLanes) {
  ...
  const nextState: RootState = workInProgress.memoizedState;
  const root: FiberRoot = workInProgress.stateNode;
  ...
  // Caution: React DevTools currently depends on this property being called "element".
  const nextChildren = nextState.element;
  if (supportsHydration && prevState.isDehydrated) {
    ...
  } else {
    // Root is not dehydrated. Either this is a client-only root, or it already hydrated.
    resetHydrationState();
    if (nextChildren === prevChildren) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    }
    reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  }
  return workInProgress.child;
}
```

processUpdateQueue()에서 newState를 할당했던 `workInProgress.memoizedState = newState;` workInProgress.memoizedState 값을 다시 nextState에 할당하고, nextState.element는 nextChildren에 할당한다. 이후 hydration 상태에 따라 조건문을 실행하게 된다.

Root는 이미 hydrated 상태이므로 else 블록을 실행하게 되고, reconcileChildren() 메서드를 호출하게 된다.

## reconcileChildren()

```tsx
// packages/react-reconciler/src/ReactFiberBeginWork.new.js
export function reconcileChildren(
  current: Fiber | null,
  workInProgress: Fiber,
  nextChildren: any,
  renderLanes: Lanes
) {
  if (current === null) {
    // If this is a fresh new component that hasn't been rendered yet, we
    // won't update its child set by applying minimal side-effects. Instead,
    // we will add them all to the child before it gets rendered. That means
    // we can optimize this reconciliation pass by not tracking side-effects.
    workInProgress.child = mountChildFibers(
      workInProgress,
      null,
      nextChildren,
      renderLanes
    );
  } else {
    // If the current child is the same as the work in progress, it means that
    // we haven't yet started any work on these children. Therefore, we use
    // the clone algorithm to create a copy of all the current children.

    // If we had any progressed work already, that is invalid at this point so
    // let's throw it out.
    workInProgress.child = reconcileChildFibers(
      workInProgress,
      current.child,
      nextChildren,
      renderLanes
    );
  }
}
```

HostRoot는 current가 존재하므로 else 블록을 실행하며 `reconcileChildFibers()`(이미 rendering 된 component를 update)를 호출한다.

> **여기서 잠깐 !**
>
> Q. HostRoot는 initial rendering이 아닌 것일까? 또, current가 null인 경우는 언제일까?
>
> A. HostRoot는 React Application의 최상위 Root Node를 나타내고, 이 Root Node는 일반적인 Component와 달리 React가 전체 트리를 처음부터 관리할 수 있도록 초기화 시 current를 설정한다. 따라서 HostRoot는 current가 null인 경우가 없다. 하지만, 일반적인 Component가 처음으로 렌더링될 때는 React가 아직 해당 Component의 기존 Render Tree를 가지고 있지 않기 때문에 해당 Component의 current FiberNode가 null일 것이다. 주석을 보면 initial render 시에는 side effect(component의 변화)에 대해 수집하지 않음으로써 최적화를 할 수 있다고 한다. 즉, mountChildFibers()는 새로운 Component의 child들을 mount하는 함수이다.

reconcileChildFibers()는 최종적으로 createFiberFromElement()을 호출하는데, 여기서 Component의 FiberNode를 생성한다.

## createFiberFromElement()

```tsx
// packages/react-reconciler/src/ReactFiber.new.js
export function createFiberFromElement(
  element: ReactElement,
  mode: TypeOfMode,
  lanes: Lanes
): Fiber {
  ...
  const type = element.type;
  const key = element.key;
  const pendingProps = element.props;
  const fiber = createFiberFromTypeAndProps(
    ...
  );
  ...
  return fiber;
}
```

## 또 다시 updateHostRoot()로 돌아와서,

```tsx
// packages/react-reconciler/src/ReactFiberBeginWork.new.js
function updateHostRoot(current, workInProgress, renderLanes) {
  ...
  if (supportsHydration && prevState.isDehydrated) {
    ...
  } else {
    ...
    reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  }
  return workInProgress.child;
}
```

reconcileChildren()을 실행하고 난 후 생성된 FiberNode는 다음 작업 단위로 반환된다.

이렇게 beginWork()가 한 차례 종료되고,

## 다시 performUnitOfWork()로 돌아와보면,

앞에서 봤던 코드를 다시 확인해보자.
다음 작업 단위(next)가 null이라면 completeUnitOfWork()를 호출하지만, 아니라면 `workInProgress = next;` 코드에서 다음 작업 단위(next)를 workInProgress에 할당하고, workLoopConcurrent()dp 의해 다시 beginWork()로 진입하게 된다. 즉, Reconcile은 DFS(깊이 우선 탐색) 방식으로 진행된다.

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork: Fiber): void {
  // The current, flushed, state of this fiber is the alternate. Ideally
  // nothing should rely on this, but relying on it here means that we don't
  // need an additional field on the work in progress.
  const current = unitOfWork.alternate;
  setCurrentDebugFiberInDEV(unitOfWork);

  let next;
  if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);
    next = beginWork(current, unitOfWork, entangledRenderLanes);
    stopProfilerTimerIfRunningAndRecordDelta(unitOfWork, true);
  } else {
    next = beginWork(current, unitOfWork, entangledRenderLanes);
  }

  resetCurrentDebugFiberInDEV();
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
}
```

그럼 이제 beginWork()에서 다음 작업 단위(next)가 null이 되어 completeUnitOfWork()를 호출하는 경우를 살펴보자.

## completeUnitOfWork()

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    ...
    // Check if the work completed or if something threw.
    if ((completedWork.flags & Incomplete) === NoFlags) {
      setCurrentDebugFiberInDEV(completedWork);
      let next;
      if (
        !enableProfilerTimer ||
        (completedWork.mode & ProfileMode) === NoMode
      ) {
        next = completeWork(current, completedWork, subtreeRenderLanes);
      } else {
        startProfilerTimer(completedWork);
        next = completeWork(current, completedWork, subtreeRenderLanes);
        // Update render duration assuming we didn't error.
        stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);
      }
      resetCurrentDebugFiberInDEV();

      if (next !== null) {
        // Completing this fiber spawned new work. Work on that next.
        workInProgress = next;
        return;
      }
    } else {
      ...
    }
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // If there is more work to do in this return, do that next.
      workInProgress = siblingFiber;
      return;
    }
    //Otherwise, return to the parent
    completedWork = returnFiber;
    // Update the next thing we're working on in case something throws.
    workInProgress = completedWork;
  } while (completedWork !== null);

  // We've reached the root.
  if (workInProgressRootExitStatus === RootInProgress) {
    workInProgressRootExitStatus = RootCompleted;
  }
}
```

코드를 살펴보면 completeUnitOfWork()는 completeWork()를 호출한다. 만약 completeWork()를 호출하면서 처리해야 할 다음 작업(next) FiberNode가 생겼다면(ex. 상태 변화로 인한 child 생성) 다시 다음 작업(next)를 workInProgress에 할당하고 completeUnitOfWork()는 종료되며 performUnitOfWork()로 되돌아간다. 마찬가지로 sibling FiberNode가 존재할 경우에도 performUnitOfWork()로 되돌아가게 되는데, 이 경우는 아래에서 더 살펴보자!

## completeWork()

```tsx
// packages/react-reconciler/src/ReactFiberCompleteWork.new.js
function completeWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {
  ...
  switch (workInProgress.tag) {
    case HostComponent: {
      if (current !== null && workInProgress.stateNode != null) {
        updateHostComponent(
          current,
          workInProgress,
          type,
          newProps,
          rootContainerInstance,
        );
        ...
      } else {
        const wasHydrated = popHydrationState(workInProgress);
        if (wasHydrated) {
          ...
        } else {
          const instance = createInstance(
            type,
            newProps,
            rootContainerInstance,
            currentHostContext,
            workInProgress,
          );

          appendAllChildren(instance, workInProgress, false, false);

          workInProgress.stateNode = instance;
          ...
        }
        ...
      }
      ...
      return null;
    }
    ...
  }
  ...
}
```

completeWork()의 HostComponent case에서 먼저 `current !== null && workInProgress.stateNode != null` 조건을 살펴보자. `current !== null`은 해당 노드가 이미 존재하는 노드이며, 현재 업데이트 중인 것을 의미한다. `workInProgress.stateNode != null`은 해당 FiberNode가 이미 DOM Node와 연결되어 있거나, 상태를 가지고 있음을 의미한다. 따라서 이 두 조건이 모두 참인 경우 현재 업데이트 중인 노드가 이미 마운트되어 있으며, DOM 노드나 상태를 가지고 있음을 나타낸다. 이때는 updateHostComponent()를 호출한다.

그렇지 않은 경우에는 else 블럭을 실행하게 되는데, 이미 hydrated 된 상태라면 마찬가지로 업데이트만 진행해주면 되므로 markUpdate()를 호출하게 된다.

이 두 가지 경우가 아닌 경우, 즉 최초 렌더링이거나 상태 노드가 없는 경우에는 createInstance()를 호출하여 새로운 DOM Instance를 생성한다. 이후 appendAllChildren()에서 child FiberNode.stateNode를 생성된 DOM Instance에 부착한다.

## 다시 completeUnitOfWork()로 돌아와서,

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    ...
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // If there is more work to do in this return, do that next.
      workInProgress = siblingFiber;
      return;
    }
    //Otherwise, return to the parent
    completedWork = returnFiber;
    // Update the next thing we're working on in case something throws.
    workInProgress = completedWork;
  } while (completedWork !== null);

  // We've reached the root.
  if (workInProgressRootExitStatus === RootInProgress) {
    workInProgressRootExitStatus = RootCompleted;
  }
}
```

completeWork() 이후 동작을 살펴보면, completedWork.sibling이 있을 경우 workInProgress로 지정하고 반환하는 것을 확인할 수 있다. beginWork가 DFS 방식으로 동작하기 때문에 sibling은 아직 beginWork()를 수행하지 않았을 것이다. 따라서 sibling이 있다면 부모를 workInProgress로 지정하고 completeWork()를 다시 호출한다. 즉, completeUnitOfWork() 내부에서 completeWork()를 부모 FiberNode에 대해 반복적으로 호출하며 DOM Tree를 완성시키는 것이다.

sibling이 없다면 returnFiber를 completedWork로 지정하고 다시 completeUnitOfWork()를 호출한다. 이 과정을 반복하다 Root에 도달하면 workInProgressRootExitStatus를 RootCompleted로 변경한다.

## **3. Commit Phase**

ReactFiberRootScheduler는 Root까지 Update가 완료되었는지 모니터링을 하고 있다가 모든 Update가 완료되면 finishConcurrentRender()를 통해 commitRoot()를 실행한다. finishConcurrentRender()는 performConcurrentWorkOnRoot()에 의해 호출되는데, 이 performConcurrentWorkOnRoot를 스케줄러가 관리한다. (이 부분! 신기하다 ٩(ˊᗜˋ\*)و)

## performConcurrentWorkOnRoot()

React Scheduler는 복잡한 작업을 효율적으로 처리하기 위해 다양한 내부 메서드와 프로세스를 사용한다.

performConcurrentWorkOnRoot()는 그 중 하나로, concurrent mode에서 Root Node의 작업을 수행하는 함수이며 Scheduler가 특정 작업을 수행할 타이밍을 결정할 때 호출된다.

**(Scheduling에 관련된 내용은 다음 글에서 다루도록 하겠다.)**

performConcurrentWorkOnRoot()는 finishConcurrentRender()를 호출하고,

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
// This is the entry point for every concurrent task, i.e. anything that goes through Scheduler.
function performConcurrentWorkOnRoot(root, didTimeout) {
  ...
  if (exitStatus !== RootErrored) {
    ...
    if (exitStatus === RootDidNotComplete) {
      ...
    } else {
      // The render completed.
      ...
      // We now have a consistent tree. The next step is either to commit it,
      // or, if something suspended, wait to commit it after a timeout.
      root.finishedWork = finishedWork;
      root.finishedLanes = lanes;
      finishConcurrentRender(root, exitStatus, lanes);
    }
  }
  ...
}
```

## finishConcurrentRender()

finishConcurrentRender()는 (Reconcile Phase가 성공적으로 끝나고 RootCompleted status를 가졌을 때) commitRoot()를 호출한다.

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function finishConcurrentRender(root, exitStatus, lanes) {
  switch (exitStatus) {
    ...
    case RootCompleted: {
      // The work completed. Ready to commit.
      commitRoot(
        root,
        workInProgressRootRecoverableErrors,
        workInProgressTransitions,
      );
      break;
    }
    default: {
      throw new Error('Unknown root exit status.');
    }
  }
}
```

## commitRoot()

commitRoot()는 commitRootImpl()을 호출하고,

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function commitRoot(
  root: FiberRoot,
  recoverableErrors: null | Array<CapturedValue<mixed>>,
  transitions: Array<Transition> | null,
) {
  ...
  try {
    ...
    commitRootImpl(
      root,
      recoverableErrors,
      transitions,
      previousUpdateLanePriority,
    );
    ...
  }
  return null;
}
```

## commitRootImpl()

commitRootImpl()은 commitMutationEffects()를 호출하면서 변경 내용을 커밋한다.

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function commitRootImpl(
  root: FiberRoot,
  recoverableErrors: null | Array<CapturedValue<mixed>>,
  transitions: Array<Transition> | null,
  renderPriorityLevel: EventPriority
) {
  ...
  if (subtreeHasEffects || rootHasEffect) {
    ...
    // The next phase is the mutation phase, where we mutate the host tree.
    commitMutationEffects(root, finishedWork, lanes);
  } else {
    // No effects.
    root.current = finishedWork;
    ...
  }
}
```

## commitMutationEffects()

commitMutationEffects()는 본격적으로 변경 내용을 커밋하는데, commitMutationEffectsOnFiber()를 호출하고 있으니 해당 함수를 살펴보자.

```tsx
// packages/react-reconciler/src/ReactFiberCommitWork.new.js
export function commitMutationEffects(
  root: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes
) {
  inProgressLanes = committedLanes;
  inProgressRoot = root;

  setCurrentDebugFiberInDEV(finishedWork);
  commitMutationEffectsOnFiber(finishedWork, root, committedLanes);
  setCurrentDebugFiberInDEV(finishedWork);

  inProgressLanes = null;
  inProgressRoot = null;
}
```

## commitMutationEffectsOnFiber()

우리는 HostRoot일 경우를 보고 있으니 HostRoot case를 살펴보면 recursivelyTraverseMutationEffects()을 호출하고 있다.

```tsx
// packages/react-reconciler/src/ReactFiberCommitWork.new.js
function commitMutationEffectsOnFiber(
  finishedWork: Fiber,
  root: FiberRoot,
  lanes: Lanes
) {
  ...
  // The effect flag should be checked *after* we refine the type of fiber,
  // because the fiber tag is more specific. An exception is any flag related
  // to reconcilation, because those can be set on all fiber types.
  switch (finishedWork.tag) {
    case HostComponent:
      recursivelyTraverseMutationEffects(root, finishedWork, lanes);
      commitReconciliationEffects(finishedWork);
      ...
  }
  ...
}
```

## recursivelyTraverseMutationEffects()

recursivelyTraverseMutationEffects()는 다시 child를 매개변수로 commitMutationEffectsOnFiber()를 호출한다. 즉, FiberNode Tree를 DFS 방식으로 호출하는 것이다.

```tsx
// packages/react-reconciler/src/ReactFiberCommitWork.new.js
function recursivelyTraverseMutationEffects(
  root: FiberRoot,
  parentFiber: Fiber,
  lanes: Lanes
) {
  ...
  if (parentFiber.subtreeFlags & MutationMask) {
    let child = parentFiber.child;
    while (child !== null) {
      setCurrentDebugFiberInDEV(child);
      commitMutationEffectsOnFiber(child, root, lanes);
      child = child.sibling;
    }
  }
  setCurrentDebugFiberInDEV(prevDebugFiber);
}
```

위 과정을 반복하다 `parentFiber.subtreeFlags & MutationMask` 조건을 만족하지 않을 경우 더이상 child를 탐색하지 않고 commitReconciliationEffects()를 호출한다.

## 다시 commitRootImpl()로 돌아와서,

모든 Commit이 끝나면 root.current를 finishedWork로 변경한다. 즉, current는 마지막으로 Commit이 끝난 HostRoot가 된다.

---

## 왜 Fiber를 사용할까?

React는 Scheduling에 강점을 갖기 위해 [Fiber가 아래 항목들을 할 수 있어야 한다고 한다.](https://github.com/acdlite/react-fiber-architecture)

- 작업을 중단하고 나중에 다시 돌아올 수 있어야 한다.
- 다른 작업에 우선순위를 부여할 수 있어야 한다.
- 이미 완료된 작업을 재사용할 수 있어야 한다.
- 더 이상 필요가 없어지면 작업을 중단할 수 있어야 한다.

위 항목들을 달성하기 위해서는 작업을 Unit 단위로 나눌 수 있어야 하며 이것 자체가 Fiber인 것이다.

일반적으로 컴퓨터는 콜스택(call stack)을 통해 프로그램의 실행을 추적한다. 하지만, UI를 다룸에 있어 너무 많은 작업이 동시에 수행되면 전반적으로 뚝뚝 끊기는 느낌을 주게 된다는 문제점이 있다. 결국 UI 렌더링을 최적화하기 위해 call stack에 interrupt를 걸 수 있고 수동으로 조정할 수 있게끔 하는 것이 React Fiber의 목적이다. 이 글에서 불러왔던 FiberNode는 virtual stack frame인 것이다.

**요약: React Fiber는 React Component를 위한 Stack의 재구현인 것!!**

Fiber의 도입은 또한 Incremental Rendering(증분 렌더링)을 의미한다. Rendering Work Uint을 작게 쪼개어 우선순위를 부여하고, 중단하거나 다시 시작할 수 있게 함으로써 **Concurrency(동시성)**을 달성하는 것이다.

## 글을 마치며

이번 글을 작성하면서 React 내부 동작에 관해 궁금한 점이 더 많아졌습니다.
다음 글은 이번 글에 이어 React Scheduler와 React Lanes에 대해 다루어보려 합니다.
또, 이번 글에서 본 함수들에 console.log를 심어 여러 컴포넌트 예시들을 눈으로 확인해보며 Update Phase까지 함께 분석해보는 글도 작성해볼까 합니다. (๑╹o╹)✎

React 코드를 이렇게 직접 뜯어보는 것은 처음인데 주석이 매우 상세하게 달려있어서 이해하는 데 많은 도움이 되었습니다.
주석의 힘이 생각보다 굉장히 크다는 것을 다시 한 번 느끼게 되었습니다. ദ്ദി ˃ ᴗ ˂ ) ദ

혹시나 틀린 부분이 있다면 댓글로 알려주시면 감사하겠습니다. 🙇🏻‍♀️

## Reference

- https://d2.naver.com/helloworld/2690975
- https://velog.io/@ksr20612/Fiber-Reconciler-Deep-Dive
- https://medium.com/stayfolio-tech/react%EA%B0%80-0-016%EC%B4%88%EB%A7%88%EB%8B%A4-%ED%95%98%EB%8A%94-%EC%9D%BC-feat-fiber-1b9c3839675a
