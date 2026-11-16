export interface Zone {
  name: string;
  color: string;
  row: number;
  col: number;
}

export const ZONES: Zone[] = [
  { name: 'ALCHEMY', color: '#A855F7', row: 0, col: 0 },
  { name: 'PLAYER', color: '#EC4899', row: 0, col: 1 },
  { name: 'RESEARCH', color: '#9CA3AF', row: 0, col: 2 },
  { name: 'DESIGN', color: '#06B6D4', row: 0, col: 3 },
  { name: 'HOST', color: '#EAB308', row: 1, col: 0 },
  { name: 'ATHLETE', color: '#EF4444', row: 1, col: 1 },
  { name: 'LOG', color: '#FFFFFF', row: 1, col: 2 },
  { name: 'AI', color: '#94A3B8', row: 1, col: 3 },
  { name: 'MUSIC', color: '#3B82F6', row: 2, col: 0 },
  { name: 'ART', color: '#F97316', row: 2, col: 1 },
  { name: 'REGEN', color: '#22C55E', row: 2, col: 2 },
  { name: 'LAB', color: '#BFDBFE', row: 2, col: 3 },
];

export const ZONE_W = 3000;
export const ZONE_H = 2000;
