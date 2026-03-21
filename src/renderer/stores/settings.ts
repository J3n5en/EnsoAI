/**
 * Settings Store - Main Entry Point
 *
 * This file re-exports all types, defaults, and the store from the modularized settings/ directory.
 * Maintained for backward compatibility - all existing imports continue to work.
 */

export * from './settings/defaults';
export { useSettingsStore } from './settings/index';
// Re-export everything from the modularized settings store
export * from './settings/types';
