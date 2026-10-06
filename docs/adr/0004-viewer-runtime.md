# ADR 0004: Give the WebGPU viewer a stable imperative runtime

- Status: accepted
- Date: 2026-09-09

## Context

The prototype proved that rebuilding rendering state from React causes camera resets, duplicated point-cloud nodes, and poor performance. Large IFC models also require IFC-Lite's WebGPU pipeline rather than a general Three.js renderer.

## Decision

IFC-Lite WebGPU owns the main canvas. A long-lived `ViewerController` owns renderer, camera, loaded layers, selection, and GPU resources. React creates the controller once and sends typed commands when application state changes.
The controller is the public scene facade, not a monolithic implementation:
IFC loading, BIM layer visibility, point-cloud handles/LOD, and canvas gestures
have focused collaborators. React's scene hook owns access URLs and load/retry
effects; the viewer widget composes UI and never owns GPU handles.

IFC models use current IFC-Lite streaming and cache mechanisms. Large point clouds use an octree, camera-dependent LOD, and a configurable point budget. IFC and point-cloud layers share scene coordinates through persisted transforms, not by mutating source data.

Framing the camera occurs only after an explicit model load or user command. Selecting an IFC element may update the orbit target without rebuilding or reframing the scene.

## Consequences

- UI rerenders do not recreate GPU state.
- Viewer behavior can be unit-tested against a controller port.
- Each layer has explicit load, update, visibility, and disposal lifecycles.
- Any bridge library must integrate with the IFC-Lite render loop rather than introduce a competing renderer.
