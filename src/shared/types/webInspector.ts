export interface InspectPayload {
  element: string;
  path: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  position: { top: string; left: string; width: string; height: string };
  innerText: string;
  url: string;
  timestamp: number;
}

export interface WebInspectorStatus {
  running: boolean;
  port: number;
}
