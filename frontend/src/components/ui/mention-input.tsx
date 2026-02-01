'use client';

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  users: User[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const MentionInput = forwardRef<HTMLInputElement, MentionInputProps>(
  ({ value, onChange, users, placeholder, className, disabled, onKeyDown: externalOnKeyDown }, ref) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [mentionQuery, setMentionQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Combine refs
    const combinedRef = (node: HTMLInputElement) => {
      inputRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    // Filter users based on query
    useEffect(() => {
      if (mentionQuery) {
        const query = mentionQuery.toLowerCase();
        const filtered = users.filter(
          (user) =>
            user.first_name?.toLowerCase().includes(query) ||
            user.last_name?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query)
        ).slice(0, 5);
        setFilteredUsers(filtered);
        setSuggestionIndex(0);
      } else {
        setFilteredUsers(users.slice(0, 5));
        setSuggestionIndex(0);
      }
    }, [mentionQuery, users]);

    // Detect @ mentions while typing
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart || 0;

      onChange(newValue);

      const textBeforeCursor = newValue.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
        if (charBefore === ' ' || lastAtIndex === 0) {
          const query = textBeforeCursor.slice(lastAtIndex + 1);
          if (!query.includes(' ')) {
            setMentionStart(lastAtIndex);
            setMentionQuery(query);
            setShowSuggestions(true);
            return;
          }
        }
      }

      setShowSuggestions(false);
      setMentionStart(null);
      setMentionQuery('');
    }, [onChange]);

    // Insert mention
    const insertMention = useCallback((user: User) => {
      if (mentionStart === null || !inputRef.current) return;

      const fullName = `${user.first_name} ${user.last_name}`;
      const mentionText = `@${fullName} `;

      const before = value.slice(0, mentionStart);
      const cursorPos = inputRef.current.selectionStart || mentionStart;
      const after = value.slice(cursorPos);

      const newValue = before + mentionText + after;
      onChange(newValue);

      setShowSuggestions(false);
      setMentionStart(null);
      setMentionQuery('');

      setTimeout(() => {
        if (inputRef.current) {
          const newPos = mentionStart + mentionText.length;
          inputRef.current.setSelectionRange(newPos, newPos);
          inputRef.current.focus();
        }
      }, 0);
    }, [mentionStart, value, onChange]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (showSuggestions && filteredUsers.length > 0) {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setSuggestionIndex((prev) => (prev + 1) % filteredUsers.length);
            return;
          case 'ArrowUp':
            e.preventDefault();
            setSuggestionIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
            return;
          case 'Enter':
            e.preventDefault();
            insertMention(filteredUsers[suggestionIndex]);
            return;
          case 'Escape':
            e.preventDefault();
            setShowSuggestions(false);
            return;
          case 'Tab':
            e.preventDefault();
            insertMention(filteredUsers[suggestionIndex]);
            return;
        }
      }

      // Pass to external handler if not handled
      externalOnKeyDown?.(e);
    }, [showSuggestions, filteredUsers, suggestionIndex, insertMention, externalOnKeyDown]);

    // Close suggestions when clicking outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          suggestionsRef.current &&
          !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current &&
          !inputRef.current.contains(e.target as Node)
        ) {
          setShowSuggestions(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative flex-1">
        <Input
          ref={combinedRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
          disabled={disabled}
        />

        {showSuggestions && filteredUsers.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 bottom-full mb-1 w-full max-h-48 overflow-y-auto bg-popover border rounded-md shadow-lg"
          >
            {filteredUsers.map((user, index) => (
              <button
                key={user.id}
                type="button"
                className={cn(
                  'w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2',
                  index === suggestionIndex && 'bg-muted'
                )}
                onClick={() => insertMention(user)}
                onMouseEnter={() => setSuggestionIndex(index)}
              >
                <span className="font-medium">{user.first_name} {user.last_name}</span>
                <span className="text-muted-foreground text-xs">{user.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

MentionInput.displayName = 'MentionInput';
