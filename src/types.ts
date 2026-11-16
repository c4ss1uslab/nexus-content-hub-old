import { Timestamp } from 'firebase/firestore';

export interface ContentItem {
  id: string;
  userId: string;
  title: string;
  url: string;
  description: string;
  imageUrl: string;
  siteName: string | null;
  author?: string | null;
  type:
    | 'course'
    | 'book'
    | 'audiobook'
    | 'paper'
    | 'highlights'
    | 'notes'
    | 'website'
    | 'page'
    | 'article'
    | 'podcast'
    | 'video'
    | 'pdf'
    | 'social post'
    | 'social profile'
    | 'screenshot'
    | 'other';
  tags: string[];
  folderPath?: string[];
  relevanceScore: number; // (0–100)
  alivenessScore: number; // (0–100)
  manualRelevanceScore?: boolean;
  manualAlivenessScore?: boolean;
  progress: number; // (0–100)
  notes: string;
  source: string | null;
  location?: string | null;
  status: 'inbox' | 'to be purchased' | 'someday maybe' | 'ready' | 'soon' | 'active' | 'passive' | 'ongoing' | 'on hold' | 'done' | 'reviewing' | 'reference' | null;
  archived: boolean;
  price?: string;
  length?: string;
  canvasPosition?: { x: number; y: number } | null;
  canvasDimensions?: { width: number; height: number };
  onCanvas?: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface TagSubCluster {
  id: string;
  name: string;
  tags: string[];
  color?: string | null;
  order?: number;
}

export interface Supertag {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  tags: string[];
  subClusters?: TagSubCluster[];
  order?: number;
  createdAt: any;
  updatedAt: any;
}

export interface TagScore {
  relevanceScore?: number | null;
  alivenessScore?: number | null;
  updatedAt?: any;
}

export type TagScoreMap = Record<string, TagScore>;
