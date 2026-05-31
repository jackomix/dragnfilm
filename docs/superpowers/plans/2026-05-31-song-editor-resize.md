# Song Editor Panel UI Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resize the song editor panel and move it from a centered fixed overlay to the bottom-left UI area, aligning it with other panels.

**Architecture:** Remove fixed/absolute positioning overrides in `style.css` and rely on existing `.panel` class styling.

**Tech Stack:** Vanilla CSS.

---

### Task 1: Update `style.css`

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Remove fixed overrides from `#song-editor-panel`**

Modify the `#song-editor-panel` selector to remove fixed position/size properties:

```css
/* Replace this: */
#song-editor-panel {
    width: 96%;
    height: 90%;
    top: 2%;
    left: 2%;
    display: flex;
    flex-direction: column;
    position: fixed; /* Ensure it stays in place */
    z-index: 1000;
}

/* With this: */
#song-editor-panel {
    width: 600px;
    max-height: 400px;
}
```

- [ ] **Step 2: Commit changes**

```bash
git add style.css
git commit -m "style: move and resize song editor panel"
```

### Task 2: Verify UI

- [ ] **Step 1: Open `index.html` in browser**

Verify the panel now appears in the bottom-left when toggled and is smaller.
