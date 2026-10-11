# Accessibility: Driftless Web 0.2.0

This documents what was tested, what was fixed, and what has **not** been verified. It is not a
formal WCAG conformance statement: automated and scripted checks find many problems but not all, and
no manual testing with assistive technology has been done yet.

## What is checked on every CI run (`tests/e2e/a11y.spec.ts`, `keyboard.spec.ts`)

- **axe-core** with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice` on:
  start (empty, list, dialogs), dashboard, editor (filled, with validation errors, foreign-currency
  row), rebalance (plan, warnings, invalid amount), data & privacy (import error), privacy policy,
  demo mode and the Polish interface. Each in light and dark mode, on a desktop viewport and a phone
  (Pixel 7). Zero violations.
- **Keyboard only:** skip link; creating a portfolio and navigating without a mouse; Escape closes
  dialogs and focus returns to the control that opened them; focus is trapped inside open dialogs;
  after navigating, focus lands on the new screen's heading; language and theme controls work from
  the keyboard.
- **Screen-reader semantics:** invalid fields expose `aria-invalid` and a described error message;
  warnings are `role="alert"`; the "saved" toast sits in a live region; the `<html lang>` attribute
  follows the interface language.
- **Reflow and text size:** no page-level horizontal scrolling at 320 px on any screen (tables scroll
  inside a focusable, named region), and the rebalance screen works at 200% text size.

## Problems found and fixed in this project

- Heading levels skipped (cards used `h3` under the page `h1`).
- Low-contrast navigation group label (4.44:1).
- Horizontally scrollable tables could not be reached by keyboard.
- `<html lang>` stayed `en` after loading the Polish interface.
- Closing a dialog lost focus; the "Create" button was disabled while empty, which also broke the
  dialog's focus trap.
- After choosing an item in the mobile menu, the drawer stayed open over the new screen.
- Quiet buttons (outline/ghost) were nearly invisible, especially in dark mode.

## Known issues in the UI kit (`@kjaniec-dev/ui`), worked around here

1. `Modal` stays mounted when closed (hidden with CSS only), leaving its controls focusable and
   exposed to assistive technology. Dialogs are mounted only while open.
2. `Modal`'s focus trap counts disabled buttons as focusable, so it can let focus escape. We avoid
   disabled buttons in dialogs.
3. `Modal` moves initial focus to the close button instead of the first field. We hide that button on
   the one dialog with a text field.
4. `DashboardShell` offers no way to close the mobile drawer on navigation, and hard-codes the English
   `aria-label` "Open navigation" on its menu button. The shell is remounted on navigation, and the
   label remains English in the Polish interface.
5. `SidebarNav` group titles are 10 px at reduced opacity and fail contrast; we omit the title.

## Not verified

- Manual testing with NVDA, JAWS, VoiceOver or TalkBack.
- Real devices, other browsers (the suite runs on Chromium), and forced-colours / high-contrast mode.
- Voice control, switch access, and reduced-motion preferences.
- The DonutChart is exposed through the kit's hidden data table; its usefulness to screen-reader users
  has not been judged by hand.
- Cognitive aspects (plain language, error recovery) were considered but not user-tested.
