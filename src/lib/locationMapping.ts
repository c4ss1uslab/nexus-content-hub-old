export const LOCATION_MAPPING: Record<string, string[]> = {
  course: ['raindrop', 'browser bookmarks', 'domestika', 'edx', 'coursera', 'hotmart'],
  book: ['goodreads', 'kindle', 'folders', 'tagstudio', 'fabric'],
  audiobook: ['audible', 'phone storage'],
  paper: ['folders', 'tagstudio', 'fabric'],
  highlights: ['kindle', 'memex', 'hypothesis', 'obsidian', 'glasp', 'sublime'],
  notes: ['telegram + obsidian', 'heptabase', 'mymind'],
  website: ['raindrop', 'browser bookmarks'],
  page: ['raindrop', 'browser bookmarks'],
  article: ['raindrop', 'browser bookmarks', 'email storage', 'RSS reader', 'feedly', 'telegram'],
  podcast: ['castbox'],
  video: ['youtube playlists', 'bookmarks', 'telegram'],
  pdf: ['phone storage', 'folders', 'tagstudio', 'fabric', 'zotero'],
  'social post': ['social media imports'],
  'social profile': ['social media imports'],
  screenshot: ['phone storage'],
  other: ['PC', 'phone']
};

export const getLocationsForType = (type: string): string[] => {
  return LOCATION_MAPPING[type.toLowerCase()] || [];
};
