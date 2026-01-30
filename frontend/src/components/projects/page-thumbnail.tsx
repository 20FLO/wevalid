'use client';

import { useState } from 'react';
import { filesApi } from '@/lib/api/files';
import { Badge } from '@/components/ui/badge';
import { PAGE_STATUS_COLORS, PAGE_STATUS_LABELS, PageStatus } from '@/types';
import { FileText, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageThumbnailProps {
  pageNumber: number;
  status: PageStatus;
  fileId?: number;
  widthMm?: number;
  heightMm?: number;
  onClick?: () => void;
  className?: string;
}

export function PageThumbnail({
  pageNumber,
  status,
  fileId,
  widthMm = 210,
  heightMm = 297,
  onClick,
  className,
}: PageThumbnailProps) {
  const [imageError, setImageError] = useState(false);

  // Calculate aspect ratio based on dimensions
  const aspectRatio = widthMm / heightMm;

  // Container width is fixed, height adjusts based on ratio
  const containerStyle = {
    aspectRatio: `${widthMm} / ${heightMm}`,
  };

  const thumbnailUrl = fileId ? filesApi.getThumbnailUrl(fileId) : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border bg-muted transition-all hover:shadow-lg hover:border-primary/50',
        className
      )}
      style={containerStyle}
    >
      {/* Thumbnail image or placeholder */}
      {thumbnailUrl && !imageError ? (
        <img
          src={thumbnailUrl}
          alt={`Page ${pageNumber}`}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          {fileId && imageError ? (
            <ImageOff className="h-8 w-8 text-muted-foreground/50" />
          ) : (
            <FileText className="h-8 w-8 text-muted-foreground/50" />
          )}
        </div>
      )}

      {/* Overlay with page number and status */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      {/* Page number - always visible */}
      <div className="absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
        {pageNumber}
      </div>

      {/* Status badge - bottom */}
      <div className="absolute bottom-2 left-2 right-2">
        <Badge
          variant="outline"
          className={cn(
            'w-full justify-center truncate text-xs',
            PAGE_STATUS_COLORS[status]
          )}
        >
          {PAGE_STATUS_LABELS[status].split(' ').slice(0, 2).join(' ')}
        </Badge>
      </div>
    </div>
  );
}
