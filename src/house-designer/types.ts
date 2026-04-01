export interface GridPoint {
  col: number;
  row: number;
}

export interface Wall {
  id: string;
  start: GridPoint;
  end: GridPoint;
  label?: string;
  roomName?: string;   // e.g. 'Kitchen' — shown as room label in 2D
  color?: string;      // hex, e.g. '#5a85d4' — room tint
  height?: number;     // metres, default 2.8
  thickness?: number;  // metres, default 0.18
}

export type Tool = 'draw' | 'select';
