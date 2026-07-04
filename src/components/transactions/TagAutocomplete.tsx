'use client';

import { useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import type { Tag } from '@/types/database';

type TagOption = Pick<Tag, 'id' | 'name' | 'color'>;

interface TagAutocompleteProps {
  tags: TagOption[];
  selectedTagIds: string[];
  newTagNames: string[];
  onChange: (next: { tagIds: string[]; tagNames: string[] }) => void;
}

export default function TagAutocomplete({ tags, selectedTagIds, newTagNames, onChange }: TagAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const selectedTags = [
    ...selectedTagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is TagOption => Boolean(tag)),
    ...newTagNames.map((tagName) => ({ id: `new:${tagName}`, name: tagName, color: null })),
  ];

  function commitTypedTag(typedTagName: string) {
    const matchingExistingTag = tags.find((tag) => tag.name.toLowerCase().startsWith(typedTagName.toLowerCase()));

    if (matchingExistingTag) {
      onChange({
        tagIds: Array.from(new Set([...selectedTagIds, matchingExistingTag.id])),
        tagNames: newTagNames,
      });
      return;
    }

    onChange({
      tagIds: selectedTagIds,
      tagNames: Array.from(new Set([...newTagNames, typedTagName])),
    });
  }

  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={tags}
      value={selectedTags}
      inputValue={inputValue}
      onInputChange={(_, nextInputValue) => setInputValue(nextInputValue)}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
      isOptionEqualToValue={(option, value) =>
        typeof option !== 'string' && typeof value !== 'string' && option.id === value.id
      }
      onChange={(_, nextTags) => {
        const nextTagIds: string[] = [];
        const nextTagNames: string[] = [];

        nextTags.forEach((tag) => {
          if (typeof tag === 'string') {
            const trimmed = tag.trim();
            if (trimmed) {
              nextTagNames.push(trimmed);
            }
            return;
          }

          if (tag.id.startsWith('new:')) {
            nextTagNames.push(tag.name);
          } else {
            nextTagIds.push(tag.id);
          }
        });

        onChange({
          tagIds: Array.from(new Set(nextTagIds)),
          tagNames: Array.from(new Set(nextTagNames)),
        });
        setInputValue('');
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={selectedTags.length === 0 ? 'Tags' : undefined}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') {
              return;
            }

            const input = event.currentTarget.querySelector('input');
            const typedTagName = input?.value.trim();

            if (!typedTagName) {
              return;
            }

            event.preventDefault();
            commitTypedTag(typedTagName);
            setInputValue('');
          }}
        />
      )}
    />
  );
}
