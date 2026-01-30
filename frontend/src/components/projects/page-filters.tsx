'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PAGE_STATUS_LABELS, PAGE_STATUS_COLORS, PageStatus, Page } from '@/types';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortField = 'page_number' | 'status' | 'updated_at';
export type SortDirection = 'asc' | 'desc';

interface PageFiltersProps {
  pages: Page[];
  statusFilter: PageStatus | 'all';
  onStatusFilterChange: (status: PageStatus | 'all') => void;
  sortField: SortField;
  onSortFieldChange: (field: SortField) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (direction: SortDirection) => void;
}

// Status order for sorting
const STATUS_ORDER: PageStatus[] = [
  'attente_elements',
  'elements_recus',
  'en_maquette',
  'maquette_a_valider',
  'maquette_validee_photogravure',
  'en_peaufinage',
  'en_corrections',
  'en_bat',
  'bat_valide',
  'envoye_imprimeur',
];

export function PageFilters({
  pages,
  statusFilter,
  onStatusFilterChange,
  sortField,
  onSortFieldChange,
  sortDirection,
  onSortDirectionChange,
}: PageFiltersProps) {
  // Count pages per status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: pages.length };
    pages.forEach((page) => {
      counts[page.status] = (counts[page.status] || 0) + 1;
    });
    return counts;
  }, [pages]);

  // Get unique statuses that have pages
  const activeStatuses = useMemo(() => {
    return STATUS_ORDER.filter((status) => statusCounts[status] > 0);
  }, [statusCounts]);

  const toggleSortDirection = () => {
    onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="space-y-4">
      {/* Status filter buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onStatusFilterChange('all')}
          className="h-7"
        >
          Toutes
          <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
            {statusCounts.all}
          </Badge>
        </Button>
        {activeStatuses.map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => onStatusFilterChange(status)}
            className={cn(
              'h-7',
              statusFilter === status && PAGE_STATUS_COLORS[status]
            )}
          >
            {PAGE_STATUS_LABELS[status].split(' ').slice(0, 2).join(' ')}
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
              {statusCounts[status]}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Trier par:</span>
        <Select value={sortField} onValueChange={(v) => onSortFieldChange(v as SortField)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="page_number">Numéro de page</SelectItem>
            <SelectItem value="status">Statut</SelectItem>
            <SelectItem value="updated_at">Date de modification</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 px-2" onClick={toggleSortDirection}>
          <SortIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Hook for filtering and sorting pages
export function useFilteredPages(
  pages: Page[],
  statusFilter: PageStatus | 'all',
  sortField: SortField,
  sortDirection: SortDirection
): Page[] {
  return useMemo(() => {
    // Filter
    let filtered = pages;
    if (statusFilter !== 'all') {
      filtered = pages.filter((page) => page.status === statusFilter);
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'page_number':
          comparison = a.page_number - b.page_number;
          break;
        case 'status':
          comparison = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
          break;
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [pages, statusFilter, sortField, sortDirection]);
}
