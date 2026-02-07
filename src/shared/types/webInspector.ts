/**
 * Component source information extracted from DOM element
 * Currently supports Vue and React, extensible for other frameworks (Svelte, Solid, etc.)
 */
export interface ComponentSource {
  framework: 'vue' | 'react' | string; // string allows future framework extensions
  file: string;
  line?: number;
  column?: number;
}

export interface InspectPayload {
  element: string;
  path: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  position: { top: string; left: string; width: string; height: string };
  innerText: string;
  url: string;
  timestamp: number;
  component?: ComponentSource;
}

export interface WebInspectorStatus {
  running: boolean;
  port: number;
}
