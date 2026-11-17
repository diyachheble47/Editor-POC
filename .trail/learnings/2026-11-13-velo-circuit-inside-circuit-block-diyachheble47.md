---
title: velo-circuit inside circuit block
author: Diyachheble47
date: 2026-11-13
branch: main
cost: { minutes: 1, tokens: 1404 }
touches:
  - src/editor/nodes/circuit/CircuitNode.tsx
  - src/App.css
---

velo-circuit's mountCircuitEditor/useCircuitEditor adds the class ce-editor to the container it is given and applies display:flex. A fixed height set on that same element (our .circuit-dsl) computed to 0px, so the editor rendered blank. Fix: put the height on an outer wrapper (.circuit-dsl-frame) and let the editor's container fill it with height:100%. The 'lite' preset gives the full element picker without export, diagnostics or the DSL side panel; 'extended' adds those, and 'minimal' has no element picker.
