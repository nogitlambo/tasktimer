# User Onboarding Page Implementation Plan

## Overview
Build a multi-step user onboarding experience that guides new users through key features and setup after signup, with a progress indicator and completion flow.

## Requirements
- **Trigger**: Show after new user signup (required for first-time users only)
- **Steps**: Welcome → Feature tour → Create task → Choose appearance → Enable notifications
- **Progress Indicator**: Visual indicator showing step progress (e.g., 1/5, 2/5, etc.)
- **Completion Flow**: Return to Tasks screen with Add Task button highlighted and background dimmed
- **Styling**: Match existing TaskTimer design system (dark theme, CSS custom properties, modal patterns)

## Architecture & Key Decisions

### 1. New Route & Page
- **Route**: `/onboarding` (new authenticated page)
- **Layout**: Use existing `TaskLaunchAuthGuard` pattern for auth protection
- **Styling**: Create new CSS file `src/app/tasktimer/styles/11-onboarding.css` following existing split-file pattern

### 2. Persistent State Tracking
- **Key**: `${STORAGE_KEY}:onboardingCompleted` in localStorage to track if user has finished
- **Alternative**: Could store in Firestore (cloud-based), but localStorage is simpler and consistent with existing preferences
- **Flow**: 
  - New users redirect to `/onboarding` on first app load
  - After completion, set flag and redirect to `/tasklaunch` (Tasks page)
  - Existing users skip onboarding entirely

### 3. Multi-Step Component Architecture
Create `/src/app/tasktimer/components/OnboardingScreen.tsx` with:
- State management for current step (0-4)
- Step data structure (title, description, action, optional UI elements)
- Navigation handlers (next/back/skip)
- Progress indicator component

### 4. Step Implementation Details

**Step 0: Welcome**
- Hero message: "Welcome to TaskTimer" or similar
- Brief value proposition statement
- Visual element (logo/icon)
- Call-to-action button: "Get Started"

**Step 1: Feature Tour**
- 3-5 feature highlights with icons (similar to landing.tsx feature cards)
- Core features: Focus modes, Task organization, Progress tracking
- Brief description per feature
- Progress indicator shows "Step 2 of 5"

**Step 2: Create Task**
- Embedded mini "Add Task" interface (can reuse AddTaskOverlay logic or simplified version)
- Guide text: "Let's create your first task"
- Pre-filled example task or empty input for user
- Next button only enabled after task created

**Step 3: Choose Appearance**
- Theme selector (Purple/Cyan toggle)
- Preview of selected theme
- Option to return and change later
- Control style selector (if applicable)

**Step 4: Enable Notifications**
- Explanation of notification benefits
- Toggle switches for:
  - Web push alerts (if web platform)
  - Mobile push alerts (if native platform)
- Can be skipped ("Maybe later")
- Final "Complete" button

### 5. Completion & Redirect Flow
- After final step, set `${STORAGE_KEY}:onboardingCompleted = true`
- Redirect to `/tasklaunch?page=tasks&highlight=addTask`
- On TaskLaunchAuthGuard/TaskTimerMainAppClient, accept `highlight` param
- In Tasks page (or Add Task button container):
  - Apply overlay/backdrop effect dimming other elements
  - Add highlight class/animation to Add Task button
  - Include subtle instructional text "Add your first task"
  - Clicking Add Task or closing the highlight takes user to normal flow

### 6. New User Detection
- **Option A**: Check for new account (created < 5 minutes ago) - requires new user metadata in auth
- **Option B**: Check localStorage flag on first route load - simpler, requires middleware redirect
- **Recommended**: Check `onboardingCompleted` flag in localStorage
  - If not set and user is authenticated → redirect to `/onboarding`
  - Add check in `TaskLaunchAuthGuard` or dedicated middleware

## File Changes Summary

### New Files
1. `/src/app/onboarding/layout.tsx` - Route layout with auth guard
2. `/src/app/onboarding/page.tsx` - Route page
3. `/src/app/tasktimer/components/OnboardingScreen.tsx` - Main multi-step component
4. `/src/app/tasktimer/styles/11-onboarding.css` - Styling (import in tasktimer.css)

### Modified Files
1. `src/app/tasktimer/tasktimer.css` - Add import for 11-onboarding.css
2. `src/app/tasktimer/TaskLaunchAuthGuard.tsx` - Add onboarding redirect logic
3. `src/app/tasktimer/TaskTimerMainAppClient.tsx` - Handle highlight parameter and dim effect
4. `src/app/tasktimer/components/TaskTimerAppFrame.tsx` or task list - Add highlighting for Add Task button

### Considerations
- Reuse existing overlays/modals CSS classes where possible
- Follow modal contract (overlay container + modal child + button classes)
- Ensure purple/cyan theme parity in new CSS
- Preserve existing ID/data-attribute hooks for delegated handlers
- Add validation: only show onboarding to authenticated users

## Design System Compliance
- Use existing color tokens: `--bg`, `--panel`, `--accent`, `--text`, `--muted`
- Use existing button classes: `btn`, `btn-accent`, `btn-ghost`
- Follow slanted/parallelogram control language (if applicable)
- Match font system: use `var(--font)` and `displayFont` class where needed
- Progress indicator: simple dots or numbered indicators (Step N/5)
- Modal styling: follow ConfirmOverlay pattern

## Testing Checklist
- [ ] New users see onboarding after signup
- [ ] Existing users skip onboarding
- [ ] Progress indicator updates correctly
- [ ] All 5 steps display correctly
- [ ] Theme selection works and persists
- [ ] Notifications toggle works (web & mobile)
- [ ] Completion flag sets correctly in localStorage
- [ ] Redirect to Tasks with highlight works
- [ ] Add Task button highlight/dimming effect visible
- [ ] Can navigate back through steps
- [ ] Can skip optional steps (e.g., notifications)
- [ ] Purple/cyan theme both work correctly
- [ ] Mobile responsive layout
- [ ] Closing during onboarding (if allowed) clears state appropriately

## Notes
- Leverage existing `AddTaskOverlay` component logic for task creation step
- Check existing notification permission patterns in `syncTaskTimerPushNotificationsEnabled`
- Theme selection should use existing localStorage key pattern
- Progress indicator can be simple CSS dots with active state
- Consider smooth transitions between steps (fade/slide animations)
