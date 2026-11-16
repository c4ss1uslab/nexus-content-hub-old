export interface ParsedBookmark {
  title: string;
  url: string;
  tags: string[];
  folderPath: string[];
  createdAt?: Date;
  description?: string;
}

export interface BookmarkParseResult {
  bookmarks: ParsedBookmark[];
  allFolders: string[];
  totalCount: number;
}

/**
 * Standard browser bookmarks (Chrome, Firefox, Safari, Edge, Brave, Opera)
 * are exported as Netscape Bookmark Format HTML files.
 * This parser extracts all bookmarks, preserves hierarchy as tags,
 * extracts ADD_DATE attributes when present, and skips invalid/javascript links.
 */
export function parseBookmarksHtml(htmlContent: string): BookmarkParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  const bookmarks: ParsedBookmark[] = [];
  const allFoldersSet = new Set<string>();

  // Browser generic root folder names to ignore or sanitize
  const genericRootFolders = new Set([
    'bookmarks',
    'bookmarks bar',
    'bookmarks toolbar',
    'bookmarks menu',
    'other bookmarks',
    'mobile bookmarks',
    'imported',
    'quick access',
    'unfiled bookmarks',
    'favorites bar',
    'favorites'
  ]);

  function sanitizeFolderName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[/\\#?&]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function traverse(container: Element, folderStack: string[]) {
    // DL contains children elements
    const children = Array.from(container.children);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tagName = child.tagName.toUpperCase();

      if (tagName === 'DT') {
        // A <DT> can contain an <H3> (Folder) or an <A> (Bookmark)
        const h3 = child.querySelector(':scope > h3, :scope > H3');
        const a = child.querySelector(':scope > a, :scope > A');
        const nextDl = child.querySelector(':scope > dl, :scope > DL');

        if (h3) {
          const rawFolderName = h3.textContent || '';
          const cleanName = sanitizeFolderName(rawFolderName);

          let newStack = [...folderStack];
          if (cleanName && !genericRootFolders.has(cleanName)) {
            newStack.push(cleanName);
            allFoldersSet.add(cleanName);
          }

          if (nextDl) {
            traverse(nextDl, newStack);
          } else {
            // Sometimes <DL> is sibling to <DT> in malformed Netscape HTML
            const sibling = children[i + 1];
            if (sibling && sibling.tagName.toUpperCase() === 'DL') {
              traverse(sibling, newStack);
            }
          }
        } else if (a) {
          const href = a.getAttribute('href') || a.getAttribute('HREF') || '';
          const title = a.textContent?.trim() || href;

          // Ignore javascript: bookmarklets, empty links, or non-http/https links
          if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
            // Extract ADD_DATE if present
            const addDateAttr = a.getAttribute('add_date') || a.getAttribute('ADD_DATE');
            let createdAt: Date | undefined;
            if (addDateAttr) {
              const seconds = parseInt(addDateAttr, 10);
              if (!isNaN(seconds) && seconds > 0) {
                // If timestamp is in seconds, convert to ms; if already in ms/microseconds, handle accordingly
                const ms = seconds > 10000000000 ? Math.floor(seconds / 1000) : seconds * 1000;
                const d = new Date(ms);
                if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
                  createdAt = d;
                }
              }
            }

            // Optional description from sibling DD
            let description = '';
            const nextSibling = children[i + 1];
            if (nextSibling && nextSibling.tagName.toUpperCase() === 'DD') {
              description = nextSibling.textContent?.trim() || '';
            }

            // Tags are formed from the folder hierarchy
            const tags = Array.from(new Set(folderStack.filter(Boolean)));

            bookmarks.push({
              title,
              url: href,
              tags,
              folderPath: [...folderStack],
              createdAt,
              description: description || undefined,
            });
          }
        }
      } else if (tagName === 'DL') {
        traverse(child, folderStack);
      }
    }
  }

  // Find root DL or body
  const rootDl = doc.querySelector('dl, DL');
  if (rootDl) {
    traverse(rootDl, []);
  } else {
    // Fallback: search for all <a> tags directly
    const allLinks = Array.from(doc.querySelectorAll('a, A'));
    for (const a of allLinks) {
      const href = a.getAttribute('href') || a.getAttribute('HREF') || '';
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        const title = a.textContent?.trim() || href;
        const addDateAttr = a.getAttribute('add_date') || a.getAttribute('ADD_DATE');
        let createdAt: Date | undefined;
        if (addDateAttr) {
          const seconds = parseInt(addDateAttr, 10);
          if (!isNaN(seconds) && seconds > 0) {
            createdAt = new Date(seconds * 1000);
          }
        }

        bookmarks.push({
          title,
          url: href,
          tags: [],
          folderPath: [],
          createdAt,
        });
      }
    }
  }

  return {
    bookmarks,
    allFolders: Array.from(allFoldersSet).sort(),
    totalCount: bookmarks.length
  };
}
