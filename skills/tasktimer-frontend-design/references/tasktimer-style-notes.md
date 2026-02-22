# TaskTimer Style Notes (Reference)

Use this reference for quick copy-adapt patterns when building new UI in the TaskTimer app.

## 1) Modal / Overlay Pattern

### JSX pattern

```tsx
<div className="overlay" id="exampleOverlay">
  <div className="modal" role="dialog" aria-modal="true" aria-label="Example">
    <h2>Example</h2>
    <div>Content...</div>
    <div className="footerBtns">
      <button className="btn btn-accent" type="button">Save</button>
      <button className="btn btn-ghost closePopup" type="button">Close</button>
    </div>
  </div>
</div>
```

### CSS pattern (match app style)

```css
#exampleOverlay .modal{
  background: #0d0f13;
  border-radius: 0;
  clip-path: polygon(var(--control-slant) 0, 100% 0, calc(100% - var(--control-slant)) 100%, 0 100%);
}
```

Notes:
- Reuse `.overlay`, `.modal`, `.footerBtns`, `btn` classes.
- Add light-theme overrides if new content-specific styles are introduced.

## 2) Toggle Row Pattern

```tsx
<div className="toggleRow" id="exampleToggleRow">
  <span>Example Toggle</span>
  <button className="switch" id="exampleToggle" type="button" role="switch" aria-checked="false" />
</div>
```

Notes:
- Prefer the existing `.switch` interaction styling and behavior.
- If disabled/inactive, use opacity and non-destructive affordances (do not change layout).

## 3) Icon Action Buttons (History-style)

### JSX pattern

```tsx
<button
  className="iconBtn historyActionIconBtn historyTopIconBtn"
  type="button"
  title="Analysis"
  aria-label="Analysis"
>
  &#128269;
</button>
```

### Disabled/inactive state

```css
.historyActionIconBtn.isDisabled{
  opacity: .4;
  cursor: not-allowed;
}
```

Notes:
- Keep icon buttons visually aligned with existing top-chart actions.
- Use `title`/`aria-label` for desktop tooltip + accessibility.

## 4) Panel / Surface Pattern

Use existing panel treatment before creating new variants:
- `background: #0d0f13`
- borders in existing cyan/white low-opacity range
- slanted/parallelogram shape where surrounding UI uses it

Examples in app:
- `.historyInline`
- `.historyCanvasWrap`
- `.dashboardCard`
- `.userGuideWindow`
- `#editOverlay .modal`

## 5) Light Theme Override Pattern

When adding dark-theme styles for a new component, add targeted light overrides if needed:

```css
body[data-theme="light"] #exampleOverlay .modal{
  background: rgba(255,255,255,.78);
  border-color: rgba(0,0,0,.15);
}

body[data-theme="light"] #exampleElement{
  color: #111111;
}
```

Notes:
- Keep overrides scoped and minimal.
- Match existing light-theme conventions in `tasktimer.css`.

## 6) Typography Pattern

- Reuse current font tokens (`var(--font-tight)`, etc.) rather than adding new stacks.
- Use small uppercase headings for compact labels/kickers:

```css
.exampleKicker{
  font-family: var(--font-tight);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
```

## 7) Mobile Safety Checks

Before finalizing a new UI:
- Check for clipped text when labels are magnified or animated.
- Check fixed/sticky controls against safe-area insets.
- Ensure touch hit areas remain usable.
- Ensure modal content scrolls if content grows.
