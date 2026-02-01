'use client';

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  users: User[];
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  ({ value, onChange, users, placeholder, rows = 4, className, disabled }, ref) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [mentionQuery, setMentionQuery] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Combine refs
    const combinedRef = (node: HTMLTextAreaElement) => {
      textareaRef.current = node;
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
        ).slice(0, 5); // Limit to 5 suggestions
        setFilteredUsers(filtered);
        setSuggestionIndex(0);
      } else {
        setFilteredUsers(users.slice(0, 5));
        setSuggestionIndex(0);
      }
    }, [mentionQuery, users]);

    // Detect @ mentions while typing
    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart || 0;

      onChange(newValue);

      // Check if we're in a mention context
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        // Check if @ is at start or after a space/newline
        const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
        if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
          const query = textBeforeCursor.slice(lastAtIndex + 1);
          // Only show suggestions if no space after @
          if (!query.includes(' ') && !query.includes('\n')) {
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

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSuggestions || filteredUsers.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSuggestionIndex((prev) => (prev + 1) % filteredUsers.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSuggestionIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
          break;
        case 'Enter':
          if (showSuggestions) {
            e.preventDefault();
            insertMention(filteredUsers[suggestionIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowSuggestions(false);
          break;
        case 'Tab':
          if (showSuggestions) {
            e.preventDefault();
            insertMention(filteredUsers[suggestionIndex]);
          }
          break;
      }
    }, [showSuggestions, filteredUsers, suggestionIndex]);

    // Insert mention at cursor position
    const insertMention = useCallback((user: User) => {
      if (mentionStart === null || !textareaRef.current) return;

      const fullName = `${user.first_name} ${user.last_name}`;
      const mentionText = `@${fullName} `;

      const before = value.slice(0, mentionStart);
      const cursorPos = textareaRef.current.selectionStart || mentionStart;
      const after = value.slice(cursorPos);

      const newValue = before + mentionText + after;
      onChange(newValue);

      // Reset state
      setShowSuggestions(false);
      setMentionStart(null);
      setMentionQuery('');

      // Set cursor position after mention
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = mentionStart + mentionText.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
          textareaRef.current.focus();
        }
      }, 0);
    }, [mentionStart, value, onChange]);

    // Close suggestions when clicking outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          suggestionsRef.current &&
          !suggestionsRef.current.contains(e.target as Node) &&
          textareaRef.current &&
          !textareaRef.current.contains(e.target as Node)
        ) {
          setShowSuggestions(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative">
        <Textarea
          ref={combinedRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className={className}
          disabled={disabled}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && filteredUsers.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-popover border rounded-md shadow-lg"
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
                <div className="flex-1">
                  <span className="font-medium">{user.first_name} {user.last_name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{user.email}</span>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
              </button>
            ))}
          </div>
        )}

        {showSuggestions && filteredUsers.length === 0 && mentionQuery && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg p-3 text-sm text-muted-foreground"
          >
            Aucun utilisateur trouvé
          </div>
        )}
      </div>
    );
  }
);

MentionTextarea.displayName = 'MentionTextarea';
