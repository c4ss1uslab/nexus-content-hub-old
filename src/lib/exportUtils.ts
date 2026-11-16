import { ContentItem } from '../types';
import JSZip from 'jszip';

export const generateMarkdownContent = (item: ContentItem): string => {
  const createdRaw = item.createdAt;
  const createdDate = createdRaw && typeof createdRaw.toDate === 'function' 
    ? createdRaw.toDate().toISOString() 
    : new Date().toISOString();

  return `---
title: ${item.title || ''}
author: ${item.author || ''}
url: ${item.url || ''}
type: ${item.type || 'website'}
tags: ${item.tags?.join(', ') || ''}
relevance: ${item.relevanceScore ?? 50}
progress: ${item.progress ?? 0}%
archived: ${item.archived ?? false}
created: ${createdDate}
---

# ${item.title || 'Untitled Node'}

${item.author ? `**Author**: ${item.author}\n\n` : ''}
> ${item.description || ''}

## Notes
${item.notes || 'No extended metadata captured.'}
`;
};

export const exportToMarkdown = (item: ContentItem) => {
  const content = generateMarkdownContent(item);
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = (item.title || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `${fileName}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportAllToZip = async (items: ContentItem[]) => {
  const zip = new JSZip();
  const titleCounts = new Map<string, number>();

  for (const item of items) {
    const rawFileName = (item.title || 'untitled')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .slice(0, 50); // limit name length
    
    let baseName = rawFileName || 'untitled';
    let fileName = `${baseName}.md`;
    if (titleCounts.has(baseName)) {
      const count = titleCounts.get(baseName)! + 1;
      titleCounts.set(baseName, count);
      fileName = `${baseName}_${count}.md`;
    } else {
      titleCounts.set(baseName, 1);
    }

    const content = generateMarkdownContent(item);
    zip.file(fileName, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resources_index_export_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
