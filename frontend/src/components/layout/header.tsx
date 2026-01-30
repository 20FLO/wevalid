'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { GlobalSearch } from './global-search';

interface HeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  hideSearch?: boolean;
}

export function Header({ title, description, children, hideSearch }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex flex-1 items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-lg font-semibold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {!hideSearch && (
          <div className="hidden md:block flex-1 max-w-md">
            <GlobalSearch />
          </div>
        )}
        {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
      </div>
    </header>
  );
}
