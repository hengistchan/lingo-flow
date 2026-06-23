# LingoFlow SVG Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Language Flow SVG icon for LingoFlow.

**Architecture:** Create one SVG asset under the extension package. The asset uses the current light and dark design token colors as static CSS variable fallbacks, with simple line geometry for small-size recognition.

**Tech Stack:** SVG, WXT extension asset folder, shell XML validation.

---

### Task 1: Add SVG Icon Asset

**Files:**
- Create: `apps/extension/assets/lingoflow-icon.svg`

- [ ] **Step 1: Create the asset directory**

Run: `mkdir -p apps/extension/assets`

- [ ] **Step 2: Add the SVG**

Create `apps/extension/assets/lingoflow-icon.svg` with a `128x128` viewBox, paper background, source and target text lines, an accent flow arrow, and a `prefers-color-scheme: dark` token override.

- [ ] **Step 3: Validate XML structure**

Run: `python3 - <<'PY'
from xml.etree import ElementTree as ET
ET.parse("apps/extension/assets/lingoflow-icon.svg")
print("svg xml ok")
PY`

Expected: `svg xml ok`


