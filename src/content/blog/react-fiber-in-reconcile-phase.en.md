---
author: Hanna922
pubDatetime: 2024-05-25T5:31:52.000Z
modDatetime:
title: React Fiber in Reconcile Phase
titleEn: React Fiber in Reconcile Phase
featured: false
draft: false
tags:
  - React
  - Reconcile
  - Fiber Architecture
  - Principle of Operation
  - Deep Dive
description: A deep dive into Fiber during React's Reconcile Phase
---

This post is written based on React v18.3.0.

## Prerequisites

**React's Operational Phases**

- **Render Phase**: React elements (plain objects) are created via JSX declarations or `React.createElement()`
- **Reconcile Phase**: Compares the previously rendered actual DOM tree with the new React elements to identify changes, then converts React elements into FiberNodes
- **Commit Phase**: Commits the new DOM elements to the browser
- **Update Phase**: When `state` or `props` change, the above process is repeated for the affected component and its descendants

**ReactElement Object**

A React Element is a plain object (not a class) that holds the user-written component, element type, attributes, children, and more.

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

**Two Meanings of Fiber**

Fiber can refer to the Reconciliation Algorithm itself, or to a Rendering Work Unit. Distinguishing which meaning is intended in context is very important. Throughout this post, I'll follow the convention used in most articles: "Fiber" refers to the architecture, while "FiberNode" refers to the individual rendering work unit.

**Singly Linked List for FiberNode**

Although a FiberNode has many fields, they can broadly be grouped into three categories, and the structure uses a singly linked list:

- `tag`, `key`, `type`: Related to the React component being created
- `return`, `child`, `sibling`, `index`: Singly linked list tree structure
- `nextEffect`, `firstEffect`, `lastEffect`: Related to change tracking

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

# Fiber in the Reconcile Algorithm

Now let's take a closer look at Fiber within React's Reconcile Phase.

## **1. Render Phase**

Rendering a React app in the browser begins with `ReactDOM.createRoot()`.

```tsx
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
```

Walking through the React source code, I found it somewhat tricky to pinpoint exactly where the `react-dom` package and the `react-reconciler` package interact. Let's go through it step by step.

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

`createRoot()` sets several flags and then calls `createContainer()` from the `react-reconciler` package, assigning the result to `root`.

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

`createContainer()` calls `createFiberRoot()` to create a unique `FiberRootNode`. The return type `OpaqueRoot` is used internally by React to track and manage the Root Node.

> **A Curious Aside 🧐**
>
> Q. Why is the type used to track and manage the Root Node called `OpaqueRoot`?
>
> "Opaque" means "not transparent." `OpaqueRoot` abstracts the information about the Root Node so it can be managed internally — in other words, the type name signals that the internal implementation details are hidden and abstracted from the outside.

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

In the code above, you can see that in addition to the `FiberRootNode`, a separate FiberNode of type `HostRoot` is created and assigned to `root.current`. The `FiberRootNode` (`root`) is a static node, while the `HostRootFiber` (`uninitializedFiber`) is the FiberNode used to detect changes in the rendered screen. The Reconcile Phase therefore uses the `HostRootFiber`.

Afterwards, `uninitializedFiber.stateNode` is assigned `root` to enable circular reference.

(The value initially assigned to `root` in `createRoot()` is `root.current` of `createFiberRoot()`, which is stored as the React root on the DOM element.)

**After creating the Root FiberNode, the React Reconciler calls `workLoopConcurrent()` to begin the Reconcile Phase.**

## **2. Reconcile Phase**

## workLoopConcurrent()

All reconciliation work is carried out in `workLoopConcurrent()`. As long as there are FiberNodes remaining and the Scheduler has not requested a yield, it calls `performUnitOfWork()` to process work.

Here, `shouldYield()` determines whether the browser needs to perform other important tasks on the main thread (e.g., handling user input). If `shouldYield()` returns `true`, the React Scheduler pauses (yields) the work and hands control back to the browser.

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

The Reconciler treats each FiberNode as a unit of work (`unitOfWork`). In other words, a FiberNode is both an object holding the information needed for rendering and a unit of reconciliation work.

## performUnitOfWork()

`performUnitOfWork(unitOfWork: Fiber)` processes a FiberNode as a work unit. If there are remaining FiberNodes to process, it calls `beginWork()` and assigns the next work unit (FiberNode) to `workInProgress`.

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

Looking at the code above, `performUnitOfWork()` is fundamentally composed of `beginWork()` and `completeUnitOfWork()`.

The very first line, `const current = unitOfWork.alternate;`, sets the node to work on. It sets the new node corresponding to the previous snapshot's node (`unitOfWork`) as the new work target (`current`). That is, the `HostRootFiber` (`uninitializedFiber`) we saw earlier holds the previous snapshot, and the Reconcile work proceeds by traversing the `current` snapshot retrieved via `alternate`.

The first `unitOfWork` will be the Root Container FiberNode.

## beginWork()

`beginWork()` checks whether the given FiberNode has changed, and if there are no changes, it updates the FiberNode according to its `workInProgress.tag` value.

`beginWork()` can be split into two phases: before and after the switch statement. The pre-switch phase determines whether the component needs updating and checks for changes to decide if this is an initial render or a re-render.

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

Since the first `unitOfWork` is the Root Container FiberNode, `workInProgress` will be `HostRoot`, and `updateHostRoot()` will be called.

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

`updateHostRoot` is the function that updates the internals of the `HostRoot` component. Since this is the initial render, `prevState` and `prevChildren` will be `null`. Since no props are provided, `nextProps` will also be `null`. The function first calls `processUpdateQueue`.

## processUpdateQueue()

`processUpdateQueue()` processes the FiberNode's update queue and computes the final state. In order, it performs the following roles:

1. Process the update queue
2. Compute the final state
3. Merge the state

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

The `newState` returned by `getStateFromUpdate()` inside `processUpdateQueue()` is assigned to `workInProgress.memoizedState`. `getStateFromUpdate()` is a function that processes each update entry to compute a new state. At this point, `newState` will contain an `element` field.

## Back to updateHostRoot()

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

The `workInProgress.memoizedState` that was set by `processUpdateQueue()` is reassigned to `nextState`, and `nextState.element` is assigned to `nextChildren`. Then the conditional executes based on the hydration state.

Since the Root is already hydrated, the `else` block executes and `reconcileChildren()` is called.

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

Since `HostRoot` has a `current`, the `else` block executes and `reconcileChildFibers()` (which updates already-rendered components) is called.

> **A Quick Note!**
>
> Q. Is `HostRoot` not an initial render? And when is `current` null?
>
> A. `HostRoot` represents the top-level Root Node of the React application. Unlike regular components, this Root Node has `current` set during initialization so that React can manage the entire tree from the start. Therefore, `current` for `HostRoot` is never `null`. However, when a regular component renders for the first time, React does not yet have an existing render tree for that component, so that component's `current` FiberNode will be `null`. As the comment explains, on initial render, we skip collecting side effects (component changes), which is an optimization. In other words, `mountChildFibers()` is the function that mounts the children of a new component.

`reconcileChildFibers()` ultimately calls `createFiberFromElement()`, which creates the FiberNode for the component.

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

## Back to updateHostRoot() Again

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

After `reconcileChildren()` executes, the created FiberNode is returned as the next work unit.

At this point, `beginWork()` completes one cycle.

## Back to performUnitOfWork()

Let's revisit the code from earlier. If the next work unit (`next`) is `null`, `completeUnitOfWork()` is called; otherwise, `workInProgress = next;` assigns the next work unit to `workInProgress`, and `workLoopConcurrent()` causes `beginWork()` to be entered again. In other words, Reconciliation proceeds in DFS (depth-first search) order.

```tsx
// packages/react-reconciler/src/ReactFiberWorkLoop.new.js
function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork: Fiber): void {
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

Now let's look at the case where `next` becomes `null` in `beginWork()`, causing `completeUnitOfWork()` to be called.

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

Looking at the code, `completeUnitOfWork()` calls `completeWork()`. If a new next work FiberNode is produced while calling `completeWork()` (e.g., a child created due to a state change), the next work unit is assigned to `workInProgress`, and `completeUnitOfWork()` exits, returning to `performUnitOfWork()`. Similarly, if a sibling FiberNode exists, control also returns to `performUnitOfWork()`. Let's look at that case next.

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

In the `HostComponent` case of `completeWork()`, let's first examine the condition `current !== null && workInProgress.stateNode != null`. `current !== null` means the node already exists and is currently being updated. `workInProgress.stateNode != null` means the FiberNode is already connected to a DOM node or has state. When both conditions are true, it indicates that the currently updating node is already mounted and has a DOM node or state, so `updateHostComponent()` is called.

Otherwise, the `else` block executes. If the node is already hydrated, an update is sufficient, so `markUpdate()` is called.

If neither of these cases applies — i.e., on the initial render or when the state node doesn't exist — `createInstance()` is called to create a new DOM instance. Then `appendAllChildren()` attaches the child FiberNode's `stateNode` to the newly created DOM instance.

## Back to completeUnitOfWork()

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

Looking at behavior after `completeWork()`, if `completedWork.sibling` exists, it is set as `workInProgress` and returned. Since `beginWork()` operates in DFS order, a sibling will not have had `beginWork()` run on it yet. Therefore, if a sibling exists, it is set as `workInProgress` and returned — causing the parent to have `completeWork()` called on it again. In other words, `completeUnitOfWork()` repeatedly calls `completeWork()` on parent FiberNodes to build up the complete DOM tree.

If there is no sibling, `returnFiber` is set as `completedWork`, and `completeUnitOfWork()` is called again. This process repeats until we reach the Root, at which point `workInProgressRootExitStatus` is set to `RootCompleted`.

## **3. Commit Phase**

`ReactFiberRootScheduler` monitors whether the update to the Root has completed, and once all updates are done, it calls `commitRoot()` via `finishConcurrentRender()`. `finishConcurrentRender()` is called by `performConcurrentWorkOnRoot()`, which is managed by the Scheduler. (This part is really fascinating! ٩(ˊᗜˋ\*)و)

## performConcurrentWorkOnRoot()

The React Scheduler uses various internal methods and processes to handle complex work efficiently.

`performConcurrentWorkOnRoot()` is one of them — it is the function that processes the work on the Root Node in concurrent mode, and is called when the Scheduler determines the timing to perform a specific piece of work.

**(Scheduling-related content will be covered in a future post.)**

`performConcurrentWorkOnRoot()` calls `finishConcurrentRender()`:

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

`finishConcurrentRender()` calls `commitRoot()` once the Reconcile Phase has completed successfully and the status is `RootCompleted`.

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

`commitRoot()` calls `commitRootImpl()`:

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

`commitRootImpl()` commits the changes by calling `commitMutationEffects()`.

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

`commitMutationEffects()` actually commits the changes by calling `commitMutationEffectsOnFiber()`. Let's look at that function.

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

Since we're looking at the `HostRoot` case, examining that branch shows that `recursivelyTraverseMutationEffects()` is called.

```tsx
// packages/react-reconciler/src/ReactFiberCommitWork.new.js
function commitMutationEffectsOnFiber(
  finishedWork: Fiber,
  root: FiberRoot,
  lanes: Lanes
) {
  ...
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

`recursivelyTraverseMutationEffects()` calls `commitMutationEffectsOnFiber()` again with the child as the argument — effectively traversing the FiberNode tree in DFS order.

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

This process repeats until the `parentFiber.subtreeFlags & MutationMask` condition is no longer satisfied, at which point the child traversal stops and `commitReconciliationEffects()` is called.

## Back to commitRootImpl()

Once all commits are complete, `root.current` is updated to `finishedWork`. That is, `current` becomes the `HostRoot` on which the last commit was completed.

---

## Why Does React Use Fiber?

React's stated goal was to give Fiber scheduling advantages, and for that, [Fiber must be able to](https://github.com/acdlite/react-fiber-architecture):

- Pause work and come back to it later
- Assign priority to different types of work
- Reuse previously completed work
- Abort work that is no longer needed

Achieving these goals requires the ability to split work into units — and that unit itself is a Fiber.

Traditionally, computers track program execution through the call stack. However, when it comes to UI, having too many operations execute simultaneously creates a janky, interrupted feel. Ultimately, the goal of React Fiber is to allow interruptions on the call stack and enable manual scheduling. The FiberNode we've been examining throughout this post is a virtual stack frame.

**Summary: React Fiber is a reimplementation of the stack, specifically for React components.**

The introduction of Fiber also implies Incremental Rendering — breaking rendering work units into smaller pieces, assigning them priorities, and making them pausable and resumable, thereby achieving **Concurrency**.

## Closing Thoughts

Writing this post made me even more curious about the internal workings of React. In the next post, I plan to continue from here and cover the React Scheduler and React Lanes.

I'm also considering writing a post where I instrument the functions seen here with `console.log`, observe various component examples visually, and analyze the Update Phase alongside all of this. (๑╹o╹)✎

This was my first time digging directly into the React source code, and the detailed comments made it much easier to understand. I was reminded once again just how powerful good comments can be. ദ്ദി ˃ ᴗ ˂ ) ദ

If anything is incorrect, please let me know in the comments. 🙇🏻‍♀️

## References

- https://d2.naver.com/helloworld/2690975
- https://velog.io/@ksr20612/Fiber-Reconciler-Deep-Dive
- https://medium.com/stayfolio-tech/react%EA%B0%80-0-016%EC%B4%88%EB%A7%88%EB%8B%A4-%ED%95%98%EB%8A%94-%EC%9D%BC-feat-fiber-1b9c3839675a
