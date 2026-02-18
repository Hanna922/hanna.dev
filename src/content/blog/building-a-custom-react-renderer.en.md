---
author: Hanna922
pubDatetime: 2024-05-20T9:30:53.000Z
modDatetime:
title: Building a Custom React Renderer
titleEn: Building a Custom React Renderer
featured: false
draft: false
tags:
  - React
  - React DOM
  - Reconciliation
  - Fiber Architecture
  - Custom Renderer
  - Translate
description: A guide to building a Custom Renderer as an alternative to ReactDOM
---

This post is based on a translation of [Building A Custom Renderer For React](https://blog.openreplay.com/building-a-custom-react-renderer/).

Written against react v18.2.0 and react-reconciler v0.29.2. Some details may differ from the original article depending on the version.

> React has gained tremendous popularity through its declarative approach to frontend development and its component-based architecture. One of its core capabilities is the Renderer, which transforms components into UI elements. React primarily uses ReactDOM as its web renderer, but the flexibility of its architecture allows you to build custom renderers tailored to specific platforms or needs.

As applications grow more diverse and extend beyond traditional web platforms, the demand for specialized rendering solutions increases. The need for a custom renderer arises when the default ReactDOM approach isn't optimal — for instance, when targeting mobile applications, virtual reality environments, or server-side rendering scenarios.

There can be significant performance bottlenecks or limitations when relying solely on React's default rendering. Consider a financial analysis dashboard that dynamically visualizes stock market data with numerous real-time updates and sophisticated charts. In such a case, React's default rendering approach may not efficiently handle the continuous stream of data or complex chart calculations, making a custom renderer necessary.

Custom renderers offer several benefits. First, they deliver improved performance by addressing specific bottlenecks, significantly improving rendering speed, memory usage, and frame rate compared to the default renderer approach. For example, a custom renderer for a financial dashboard could optimize data processing and chart rendering to deliver a smoother, more responsive experience.

In the sections that follow, we will walk through the process of building a custom renderer and explain the steps required to extend React's rendering capabilities to meet specific project requirements.

## Overview of the react-reconciler Package

Within the broad scope of React customization, the [react-reconciler](https://www.npmjs.com/package/react-reconciler) package is a powerful tool that enables developers to implement custom renderers with precision and efficiency. It serves as the backbone for building custom renderers and provides a structured, extensible framework for React's reconciliation process.

React's reconciliation process is responsible for efficiently updating the UI by determining the minimal set of changes needed to reflect the application's current state. The react-reconciler package plays a critical role here by providing a set of interfaces and utilities that simplify custom renderer implementation, allowing developers to tailor the reconciliation process to their specific use case.

### Purpose and Use Cases

The primary purpose of the react-reconciler package is to allow developers to construct custom renderers that align perfectly with their project requirements. This versatility is especially valuable when existing rendering approaches are insufficient or when a custom solution is needed to address unique challenges.

Use cases for custom renderers built with react-reconciler are broad — from optimizing performance for specific platforms like native mobile apps, to integrating React into specialized environments such as game engines or augmented reality frameworks. By leveraging this package, developers gain the flexibility to extend React's capabilities far beyond standard web rendering into a wide range of innovative applications.

### Relationship with the Fiber Architecture

The react-reconciler package is tightly coupled with React's Fiber Architecture to improve the efficiency and responsiveness of the reconciliation process. By working alongside Fiber, react-reconciler leverages a robust infrastructure for prioritizing and scheduling updates, enabling the construction of more efficient and performant rendering systems.

Understanding this relationship between react-reconciler and the Fiber Architecture is essential for developers building custom renderers. The synergy ensures that custom renderers integrate seamlessly with React's core architecture, taking advantage of Fiber's incremental rendering to deliver smooth and responsive user experiences.

## Exploring the Fiber Data Structure

React's Fiber is a small unit of work that represents a component in the Virtual DOM. It plays a central role in the reconciliation process, helping React update and render components efficiently.

### Fiber Node Anatomy

A Fiber node is a JavaScript object that stores information about a component. It contains various fields including:

- **Type**: The type of the component (e.g., function, class, etc.)
- **Key**: An optional unique identifier for optimizing updates
- **State**: The component's current state
- **Props**: The properties passed to the component
- **Child, Sibling, and Return**: Pointers to other Fiber nodes that form the tree structure, representing the application's component hierarchy. The `child` pointer points to the first child of the current node, `sibling` points to the next sibling, and `return` points to the parent.

### Work-in-Progress and Committed Fiber Trees

React maintains two Fiber trees during reconciliation: the work-in-progress tree (where current changes are being applied) and the committed tree (the successfully rendered state). The Work-in-Progress Fiber Tree is a dynamic in-memory representation that reflects the current state of React components being processed.

When changes occur in the application — such as state updates or prop changes — React creates a new version of the component tree. This newly created tree is called the work-in-progress tree because it captures the in-progress changes.

Conversely, the Committed Fiber Tree represents the last successfully rendered state in the user interface. Once the reconciliation process completes, React takes the updated Work-in-Progress Fiber Tree and designates it as the new Committed Fiber Tree. This tree represents the most recently successfully rendered state and is ready to be displayed to the user.

The image below shows both the committed tree and the work-in-progress tree. Rectangles with blue outlines represent updated nodes.

<img src="/blog/building-a-custom-react-renderer/image.png" alt="Committed Tree & Work-in-progress Tree" />

### Reconciliation Algorithm

The reconciliation algorithm is React's core mechanism for efficiently updating the UI. It utilizes the Fiber tree to determine which components need to be updated and in what order. The algorithm balances responsiveness with throughput to ensure a smooth user experience.

## Fiber Node Lifecycle

The lifecycle of a Fiber node is a dynamic process that passes through various stages during rendering. Understanding these stages is essential for building a Custom React Renderer.

- **Initialization**: When a component is first rendered, a Fiber node is created and initialized with its `type`, `props`, and `state`. This stage is the starting point of the reconciliation process.
- **Reconciliation**: During reconciliation, React compares the current state of the Fiber node with the new state. It identifies what has changed and plans UI updates. This process involves propagating changes through the Fiber tree.
- **Rendering**: The rendering phase involves transforming the Virtual DOM into the actual UI. This process uses the committed Fiber tree to apply only the necessary updates.
- **Commit**: Once rendering is complete, React commits the changes to the DOM. This stage causes the updated UI to become visible to the user. The committed Fiber tree becomes the new baseline for future updates.
- **Cleanup**: After committing changes, React performs cleanup work, which may include releasing resources or updating internal data structures to prepare for the next rendering cycle.
- **Reusable Fibers**: React optimizes performance by reusing Fibers across renders. This reduces the need to create new objects, improving efficiency.

The image below is a flowchart illustrating the Fiber node lifecycle.

<img src="/blog/building-a-custom-react-renderer/image-1.png" alt="Fiber Node LifeCycle" />

## Steps to Build a Custom React Renderer

A custom renderer applies to any React application. In this guide, we focus specifically on testing with a basic React single-page application (SPA).

To demonstrate custom renderer creation, we will intentionally remove the default renderer from a React app and replace it with a custom one. This custom renderer will be responsible for displaying the React page's content on an actual web page.

Removing the default renderer will initially break the app and produce errors. But once we integrate the essential functionality into the custom renderer, the default page will reappear and become visible in the browser again. This step-by-step process helps us understand how a renderer works behind the scenes to display the app on a web page, and also serves as a guide for constructing the custom renderer.

**(The source code in this post uses Vite, which differs from the original article.)**

### Setting Up the Development Environment

Create a React application from the terminal. Replace `app_name` with your desired application name.

```bash
pnpm create vite <app_name> --template react
```

Once the application is created, navigate into the project directory and run the following command to install the required packages.

```bash
cd <app_name>

pnpm install
```

Start the application!

```bash
pnpm dev
```

For the custom renderer, install the required dependency `react-reconciler`. If you're using TypeScript, also install `@types/react-reconciler`.

```bash
pnpm install react-reconciler
```

### Integrating the Custom Renderer

1. Create a `ReactDOMCustom.tsx` file under the `src` folder, and import `react-reconciler` in this file.

```tsx
import ReactReconciler from "react-reconciler";
```

2. Open `main.tsx`, import the `ReactDOMCustom` file, and remove the existing `ReactDOM` import.

```tsx
import ReactDOMCustom from "./ReactDOMCustom.tsx";
```

3. Replace the existing `ReactDOM.render()` call with `ReactDOMCustom.render()`.

```tsx
// Original renderer code
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Custom renderer code
ReactDOMCustom.render(<App />, document.getElementById("root")!);
```

After making this change, the app will break and errors will appear in the browser console.

<img src="/blog/building-a-custom-react-renderer/image-2.png" alt="ReactDOM Error" />

Let's now implement the core logic of the custom renderer so that our React app functions as expected in the browser.

### Creating a Custom Host Config

The host config file represents a JavaScript module that defines the behavior and capabilities of the host environment in which React is used. The host environment is the platform or runtime where the React application runs — it could be a web browser, a mobile app environment, or any other runtime.

A host config generally contains a set of methods that the custom renderer must implement. These methods correspond to various aspects of the rendering process such as creating and updating instances, appending children, and handling text content. By providing custom implementations for these methods, you control how React elements are created, updated, and manipulated within the target environment.

In the `ReactDOMCustom` file, instantiate `react-reconciler` by creating a reconciler object and adding the following methods.

```tsx
let reconciler = ReactReconciler({
  // host config options
  supportsMutation: true,
  createInstance(type, props, rootContainer, hostContext, internalHandle) {
    // Logic for creating new instance
  },
  createTextInstance(text, rootContainer, hostContext, internalHandle) {
    // Logic for creating a text instance
  },
  appendChildToContainer(container, child) {
    // Logic for appending a child to the container
  },
  appendChild(parentInstance, child) {
    // Logic for appending a child to a parent
  },
  appendInitialChild(parentInstance, child) {
    // Logic for appending initial child
  },
  prepareUpdate(
    instance,
    type,
    oldProps,
    newProps,
    rootContainer,
    hostContext
  ) {
    // Logic for preparing an update
  },
  commitUpdate(
    instance,
    updatePayload,
    type,
    prevProps,
    nextProps,
    internalHandle
  ) {
    // Logic for committing an update
  },
  finalizeInitialChildren() {
    // Logic for finalizing initial children
  },
  getChildHostContext() {
    // Logic for getting child host context
  },
  getPublicInstance() {
    // Logic for getting public instance
  },
  getRootHostContext() {
    // Logic for getting root host context
  },
  prepareForCommit() {
    // Logic before committing changes
  },
  resetAfterCommit() {
    // Logic after committing changes
  },
  shouldSetTextContent() {
    return false;
  },
  // The following code was added differently from the original article.
  clearContainer() {
    // Logic for clearing the container
    console.log("Clearing container:", container);
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  },
});
```

### createInstance()

This method creates and configures an HTML element based on the provided `type` and `props`. It uses `document.createElement` to create a new HTML element of the specified type, then checks for specific attributes such as `className` and `src` from the `props` object and applies them to the created element if they exist.

To achieve this, a string array representing HTML attributes (`alt`, `className`, `href`, `rel`, `src`, `target`) is created. The method iterates over this array and sets each attribute on the element if it exists in `props`. Finally, the function returns the created HTML element.

```tsx
// Define a function to create a new instance of an element
createInstance(
  type, // The type of element to create (e.g., "div", "span")
  props, // The properties (attributes) to apply to the element
  rootContainer, // The root container instance to which the element belongs
  hostContext, // The host context of the element
  internalHandle // The internal instance handle of the element
) {
  // Create a new HTML element based on the provided type
  let element = document.createElement(type);

  // Apply the className and src properties from the props object if they exist
  if (props.className) element.className = props.className;
  if (props.src) element.src = props.src;

  // Iterate through an array of specific attributes to check if they exist in the props object
  ["alt", "className", "href", "rel", "src", "target"].forEach((attr) => {
    // If the attribute exists in the props object, set it on the element
    if (props[attr]) element[attr] = props[attr];
  });

  // Log information about the created text instance
  console.log("Created instance:", type, props);

  // Return the created element
  return element;
},
```

### createTextInstance()

The purpose of this method is to create a text node in the user interface. It does so by returning a text node containing the provided content. The implementation involves calling `document.createTextNode` and passing `text` as the argument.

```tsx
// Define a function to create a new text instance
createTextInstance(
  text, // The text content of the instance
  rootContainer, // The root container instance to which the text belongs
  hostContext, // The host context of the text instance
  internalHandle // The internal instance handle of the text instance
) {
  console.log("Created text instance:", text);

  // Create a new text node with the provided text content
  return document.createTextNode(text);
},
```

### appendChildToContainer(), appendChild(), and appendInitialChild()

These methods are used to append child elements to a parent container within the user interface. The distinction between them is based on specific cases or lifecycle events in the UI rendering process. Each method achieves this by utilizing the browser's built-in `appendChild` API and passing the child element as an argument.

```tsx
// Function to append a child to a container
appendChildToContainer(container, child) {
  // Log information about appending child to container
  console.log("Appending child to container:", child);
  // Append the child to the container
  container.appendChild(child);
},
// Function to append a child to a parent element
appendChild(parentInstance, child) {
  // Log information about appending child to parent
  console.log("Appending child to parent:", child);
  // Append the child to the parent element
  parentInstance.appendChild(child);
},
// Function to append an initial child to a parent element
appendInitialChild(parentInstance, child) {
  // Log information about appending initial child to parent
  console.log("Appending initial child to parent:", child);
  // Append the initial child to the parent element
  parentInstance.appendChild(child);
},
```

### Enabling the Render Method

The API of the reconciliation object differs slightly from the top-level React DOM API. To integrate the render method into `main.tsx`, you need to define an object with a `render` method in the `ReactDOMCustom.tsx` file. This render method takes two arguments: the `component` to render and the `container` that determines where to place it.

```tsx
let ReactDOMCustom = {
  render(component, div) {
    // Logic for rendering
  },
};
```

Inside the render function, use the `createContainer` method to create a new container. This method takes three arguments: the `container` itself, and two boolean values set to `false` representing concurrent mode and server-side hydration respectively.

```tsx
let container = reconciler.createContainer(div, false, false);
```

Next, call the `updateContainer` method to initiate the rendering process. This method requires four arguments: the rendered `component`, the pre-created `container`, and two `null` values representing hydration and callback execution options.

```tsx
reconciler.updateContainer(whatToRender, container, null, null);
```

For reference, here is the complete render method:

```tsx
// ReactDOMCustom object to encapsulate custom rendering logic
let ReactDOMCustom = {
  // Render method to render a React component into a specified container
  render(component, div) {
    // Create a container using the reconciler's createContainer method
    let container = reconciler.createContainer(div, false, false);

    // Update the container with the specified component to trigger the rendering process
    reconciler.updateContainer(component, container, null, null);
  },
};

export default ReactDOMCustom;
```

If the custom renderer is configured successfully, you should see the following result in the browser.

<img src="/blog/building-a-custom-react-renderer/image-3.png" alt="Success Custom Renderer" />

## Real-World Examples

Real-world examples of custom React renderers demonstrate the versatility and adaptability of the React architecture.

### Case Studies of Custom React Renderers

- **React Three Fiber** — A Custom React Renderer designed to create 3D graphics using Three.js, a popular WebGL library.
- **React Native** — Takes React components and renders native UI components for iOS and Android.
- **React ART** — A library for drawing vector graphics using React. A Custom React Renderer that outputs to Canvas and SVG.
- **React PDF** — A Custom React Renderer that generates PDF documents using React components.
- **React Hardware** — A Custom React Renderer targeting hardware components like Arduino and Raspberry Pi, enabling developers to build Internet of Things (IoT) applications using React components.

### Use Cases

Here are some common use cases related to Custom React Renderers:

- **Specialized UI Components** — Building a Custom React Renderer for specialized UI components that require low-level rendering optimizations or integration with specific technologies (e.g., graphics libraries, game engines).
- **Custom Platforms or Devices** — Developing React applications for non-standard platforms or devices (e.g., IoT devices, custom hardware) by implementing a Custom Renderer suited to their unique requirements.
- **Domain-Specific Languages (DSLs)** — Implementing a domain-specific language (DSL) using React for specific use cases, such as dynamic PDF document generation where components define the document's structure and content.
- **Graphic User Interfaces (GUIs) for 3D Applications**
- **Performance Optimization** — Creating a Custom React Renderer tailored to specific application requirements to optimize performance in scenarios where the default rendering process introduces unnecessary overhead.

### Benefits

Custom React Renderers offer several advantages:

- **Declarative Syntax** — Leverages React's declarative syntax to express UI components clearly and concisely, making them easier for developers to understand and maintain.
- **Code Reusability** — Encapsulating logic within React components improves code reusability, allowing developers to reuse components across different projects or scenarios.
- **Ecosystem Compatibility** — Leverages the existing React ecosystem and developer community, making use of the wide range of libraries, tools, and resources available to React developers.
- **Familiar Development Workflow** — Maintains a familiar development workflow for developers who already have React experience. Through a custom renderer, developers can apply React patterns and best practices across various domains.
- **Abstraction of Complexity** — Abstracts the complex details of low-level rendering by providing a high-level API that simplifies the creation and management of UI components, reducing the cognitive load on developers.
- **Cross-Platform Development** — Facilitates cross-platform development by creating custom renderers for platforms like React Native, enabling developers to build applications across multiple platforms using a single codebase.

## Conclusion

Custom React Renderers offer developers a diverse set of solutions to tailor frontend development to specific platforms and use cases. By leveraging React's core rendering concepts and the react-reconciler package, developers can efficiently build custom renderers — just as seen in real-world examples like React Three Fiber and React Native.

---

## Additional Code Not in the Original Article

**If you don't add the clearContainer method to the reconciler**

```tsx
clearContainer() {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
},
```

The following error will occur:

<img src="/blog/building-a-custom-react-renderer/image-4.png" alt="Custom Renderer Error1" />

Reading the error message, you can see that the `removeChildFromContainer`, `clearContainer`, and `detachDeletedInstance` methods need to be added. These methods are required to manage the lifecycle of elements within the custom renderer.

**So why does adding only the clearContainer method resolve the issue?**

Here, `clearContainer` already handles the removal of all child elements, which means the other deletion-related methods are never called, so no error occurs. However, for a complete React Reconciler Host configuration, it is better practice to explicitly add `removeChildFromContainer` and `detachDeletedInstance` as well.

The fact that you can swap out the renderer like this is truly one of the fascinating aspects of React. ദ്ദിᐢ.\_.ᐢ₎
