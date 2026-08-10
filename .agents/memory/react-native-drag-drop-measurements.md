---
name: React Native drag/drop measurements
description: Timing rule for measuring conditionally rendered drop targets in React Native and web.
---

For drag-and-drop targets that appear only after a drag starts, do not rely on a measurement taken in the drag-start handler. The state update renders the target later, so its ref may be null or its bounds may be stale. Measure after the target mounts and await a final measurement during release before hit-testing.

**Why:** The root character-list drop zone was rendered in response to the drag state, which made its initial measurement unavailable and caused drops to be cancelled even when the pointer was visibly over the zone.

**How to apply:** Keep bounds in a ref, remeasure in an effect after the conditional target becomes visible, and make the release handler await measurement callbacks before deciding which target received the drop.