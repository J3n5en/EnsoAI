/**
 * Z-Index Token System
 * Defines the stacking order for various UI components in the application.
 * Values are chosen to provide enough gaps for potential sub-layers while keeping the hierarchy clear.
 *
 * See docs/z-index-system.md for detailed usage guide.
 */
export const Z_INDEX = {
  /** Base level for standard content (main window) */
  BASE: 0,
  /** Settings floating window - just above main window */
  SETTINGS_WINDOW: 10,
  /** Dropdowns, menus, and popovers */
  DROPDOWN: 40,
  /** Background overlay for modal dialogs */
  MODAL_BACKDROP: 50,
  /** Main content area of modal dialogs */
  MODAL_CONTENT: 51,
  /** Background overlay for nested (second-level) modals */
  NESTED_MODAL_BACKDROP: 70,
  /** Main content area for nested (second-level) modals */
  NESTED_MODAL_CONTENT: 71,
  /** Tooltips and informational hover elements */
  TOOLTIP: 100,
  /** Toast notifications and system-level alerts */
  TOAST: 110,
} as const;

export type ZIndex = keyof typeof Z_INDEX;
