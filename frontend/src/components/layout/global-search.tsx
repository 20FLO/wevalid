'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { searchApi, SearchResults } from '@/lib/api/search';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, FolderOpen, Building2, File, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await searchApi.search(query);
        setResults(data);
        setIsOpen(true);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResultClick = (type: string, id: number, projectId?: number) => {
    setIsOpen(false);
    setQuery('');

    switch (type) {
      case 'project':
        router.push(`/projects/${id}`);
        break;
      case 'project_file':
        router.push(`/projects/${projectId}?tab=files`);
        break;
      case 'page_file':
        router.push(`/projects/${projectId}`);
        break;
      case 'publisher':
        router.push(`/publishers`);
        break;
    }
  };

  const hasResults = results && results.total > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Rechercher... (⌘K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          className="pl-10 pr-10"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {query && !isLoading && (
          <button
            onClick={() => {
              setQuery('');
              setResults(null);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
          {!hasResults && !isLoading && (
            <div className="p-4 text-center text-muted-foreground">
              Aucun résultat pour &quot;{query}&quot;
            </div>
          )}

          {hasResults && (
            <div className="p-2 space-y-2">
              {/* Projects */}
              {results.results.projects.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Projets</p>
                  {results.results.projects.map((item) => (
                    <button
                      key={`project-${item.id}`}
                      onClick={() => handleResultClick('project', item.id)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md text-left"
                    >
                      <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        {item.isbn && (
                          <p className="text-xs text-muted-foreground">ISBN: {item.isbn}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {item.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              {/* Project files */}
              {results.results.project_files.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Fichiers projet</p>
                  {results.results.project_files.map((item) => (
                    <button
                      key={`pf-${item.id}`}
                      onClick={() => handleResultClick('project_file', item.id, item.project_id)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md text-left"
                    >
                      <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.project_title}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {item.category}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              {/* Page files */}
              {results.results.page_files.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Fichiers pages</p>
                  {results.results.page_files.map((item) => (
                    <button
                      key={`pgf-${item.id}`}
                      onClick={() => handleResultClick('page_file', item.id, item.project_id)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md text-left"
                    >
                      <File className="h-4 w-4 text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.project_title} - Page {item.page_number}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Publishers */}
              {results.results.publishers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Maisons d&apos;édition</p>
                  {results.results.publishers.map((item) => (
                    <button
                      key={`pub-${item.id}`}
                      onClick={() => handleResultClick('publisher', item.id)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md text-left"
                    >
                      <Building2 className="h-4 w-4 text-purple-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
