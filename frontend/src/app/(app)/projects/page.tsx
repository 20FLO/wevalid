'use client';

import { useState, useEffect } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { publishersApi } from '@/lib/api/publishers';
import { Header } from '@/components/layout/header';
import { ProjectCard } from '@/components/projects/project-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, FolderKanban, Building2 } from 'lucide-react';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import type { Publisher } from '@/types';

export default function ProjectsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [publisherFilter, setPublisherFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loadingPublishers, setLoadingPublishers] = useState(false);

  const { projects, isLoading, refetch } = useProjects({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    publisher_id: publisherFilter !== 'all' ? parseInt(publisherFilter) : undefined,
  });

  const canCreateProject = user?.role === 'admin' || user?.role === 'editeur' || user?.role === 'fabricant';
  const showPublisherFilter = user?.role === 'admin' || user?.role === 'fabricant';

  // Load publishers for filter
  useEffect(() => {
    if (showPublisherFilter) {
      setLoadingPublishers(true);
      publishersApi
        .getAll()
        .then((response) => setPublishers(response.publishers))
        .catch((error) => console.error('Failed to load publishers:', error))
        .finally(() => setLoadingPublishers(false));
    }
  }, [showPublisherFilter]);

  return (
    <>
      <Header title="Projets" description="Gérez vos projets de production éditoriale">
        {canCreateProject && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau projet
          </Button>
        )}
      </Header>

      <main className="flex-1 space-y-6 p-6">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un projet..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {showPublisherFilter && publishers.length > 0 && (
            <Select value={publisherFilter} onValueChange={setPublisherFilter} disabled={loadingPublishers}>
              <SelectTrigger className="w-full sm:w-56">
                <Building2 className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Toutes les maisons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les maisons</SelectItem>
                {publishers.map((publisher) => (
                  <SelectItem key={publisher.id} value={String(publisher.id)}>
                    {publisher.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="draft">Brouillon</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="bat">BAT</SelectItem>
              <SelectItem value="completed">Terminé</SelectItem>
              <SelectItem value="archived">Archivé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                  <Skeleton className="mt-4 h-4 w-full" />
                  <Skeleton className="mt-2 h-2 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderKanban className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Aucun projet trouvé</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || statusFilter !== 'all' || publisherFilter !== 'all'
                  ? 'Essayez de modifier vos filtres'
                  : 'Créez votre premier projet pour commencer'}
              </p>
              {canCreateProject && !search && statusFilter === 'all' && publisherFilter === 'all' && (
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Créer un projet
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          setShowCreateDialog(false);
          refetch();
        }}
      />
    </>
  );
}
