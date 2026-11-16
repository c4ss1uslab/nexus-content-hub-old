import React from 'react';
import EditTagModal, { EditTagModalProps } from './EditTagModal';
import { ContentItem, Supertag, TagScoreMap } from '../types';

export interface RenameTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagToRename: string | null;
  items: ContentItem[];
  supertags: Supertag[];
  userId?: string;
  tagScores?: TagScoreMap;
  onRenamed?: (oldTag: string, newTag: string) => void;
}

export default function RenameTagModal({
  isOpen,
  onClose,
  tagToRename,
  items,
  supertags,
  userId = '',
  tagScores,
  onRenamed
}: RenameTagModalProps) {
  return (
    <EditTagModal
      isOpen={isOpen}
      onClose={onClose}
      tagToEdit={tagToRename}
      items={items}
      supertags={supertags}
      userId={userId}
      tagScores={tagScores}
      onUpdated={(oldTag, newTag) => {
        if (onRenamed) onRenamed(oldTag, newTag);
      }}
    />
  );
}
