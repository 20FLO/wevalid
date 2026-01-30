'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useProject, useProjectPages, useWorkflowStats } from '@/hooks/use-projects';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { PageStatus, PAGE_STATUS_LABELS, PAGE_STATUS_COLORS } from '@/types';
import { ArrowLeft, Users, FileText, Settings, Building2 } from 'lucide-react';
import { PageThumbnail } from '@/components/projects/page-thumbnail';
import {
  PageFilters,
  useFilteredPages,
  SortField,
  SortDirection,
} from '@/components/projects/page-filters';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const projectId = parseInt(id);

  const { project, isLoading: projectLoading } = useProject(projectId);
  const { pages, isLoading: pagesLoading } = useProjectPages(projectId);
  const { stats } = useWorkflowStats(projectId);

  // Page filtering/sorting state
  const [statusFilter, setStatusFilter] = useState<PageStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('page_number');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Apply filters and sorting
  const filteredPages = useFilteredPages(pages, statusFilter, sortField, sortDirection);

  if (projectLoading) {
    return (
      <>
        <Header title="Chargement..." />
        <main className="p-6">
          <Skeleton className="h-48 w-full" />
        </main>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <Header title="Projet non trouvé" />
        <main className="flex flex-col items-center justify-center p-6">
          <p className="text-muted-foreground">Ce projet n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
          <Button asChild className="mt-4">
            <Link href="/projects">Retour aux projets</Link>
          </Button>
        </main>
      </>
    );
  }

  const totalPages = parseInt(project.total_pages_count || String(project.total_pages)) || 0;
  const validatedPages = parseInt(project.validated_pages_count || '0');
  const progress = totalPages > 0 ? Math.round((validatedPages / totalPages) * 100) : 0;

  // Format display string
  const formatDisplay = project.width_mm && project.height_mm
    ? `${project.width_mm} × ${project.height_mm} mm`
    : null;

  return (
    <>
      <Header title={project.title} description={project.isbn ? `ISBN: ${project.isbn}` : undefined}>
        <Button variant="outline" asChild>
          <Link href="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
        </Button>
      </Header>

      <main className="flex-1 space-y-6 p-6">
        {/* Project Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Progression</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{progress}%</div>
              <Progress value={progress} className="mt-2 h-2" />
              <p className="mt-2 text-xs text-muted-foreground">
                {validatedPages} / {totalPages} pages validées
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Équipe</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="text-2xl font-bold">{project.members?.length || 0}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">membres sur le projet</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Statut</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge
                className={`text-sm ${
                  project.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-800'
                    : project.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {project.status === 'draft' && 'Brouillon'}
                {project.status === 'in_progress' && 'En cours'}
                {project.status === 'bat' && 'BAT'}
                {project.status === 'completed' && 'Terminé'}
                {project.status === 'archived' && 'Archivé'}
              </Badge>
              {project.description && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Format</CardTitle>
            </CardHeader>
            <CardContent>
              {formatDisplay ? (
                <>
                  <div className="text-lg font-bold">{formatDisplay}</div>
                  {project.publisher_name && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {project.publisher_name}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-lg font-medium text-muted-foreground">Non défini</div>
                  {project.publisher_name && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {project.publisher_name}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Workflow Stats */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Répartition par statut</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.stats.map((stat) => (
                  <div
                    key={stat.status}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <Badge className={PAGE_STATUS_COLORS[stat.status as PageStatus]}>
                      {stat.count}
                    </Badge>
                    <span className="text-sm">{PAGE_STATUS_LABELS[stat.status as PageStatus]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">
              <FileText className="mr-2 h-4 w-4" />
              Pages ({pages.length})
            </TabsTrigger>
            <TabsTrigger value="members">
              <Users className="mr-2 h-4 w-4" />
              Équipe ({project.members?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="mr-2 h-4 w-4" />
              Paramètres
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="mt-4 space-y-4">
            {/* Filters */}
            {pages.length > 0 && (
              <PageFilters
                pages={pages}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                sortField={sortField}
                onSortFieldChange={setSortField}
                sortDirection={sortDirection}
                onSortDirectionChange={setSortDirection}
              />
            )}

            {/* Pages Grid with Thumbnails */}
            {pagesLoading ? (
              <div className="grid gap-4 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="aspect-[210/297] w-full" />
                ))}
              </div>
            ) : filteredPages.length > 0 ? (
              <div className="grid gap-4 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {filteredPages.map((page) => (
                  <Link
                    key={page.id}
                    href={`/projects/${project.id}/pages/${page.id}`}
                    className="block"
                  >
                    <PageThumbnail
                      pageNumber={page.page_number}
                      status={page.status}
                      fileId={page.latest_file_id}
                      widthMm={project.width_mm}
                      heightMm={project.height_mm}
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {statusFilter !== 'all'
                    ? 'Aucune page ne correspond au filtre sélectionné'
                    : 'Aucune page dans ce projet'}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <Card>
              <CardContent className="p-4">
                {project.members && project.members.length > 0 ? (
                  <div className="space-y-3">
                    {project.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">
                            {member.first_name} {member.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {member.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">Aucun membre</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardContent className="p-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Informations du projet</h3>
                    <dl className="mt-2 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Titre</dt>
                        <dd>{project.title}</dd>
                      </div>
                      {project.isbn && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">ISBN</dt>
                          <dd>{project.isbn}</dd>
                        </div>
                      )}
                      {project.publisher_name && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Maison d&apos;édition</dt>
                          <dd>{project.publisher_name}</dd>
                        </div>
                      )}
                      {formatDisplay && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Format</dt>
                          <dd>{formatDisplay}</dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Nombre de pages</dt>
                        <dd>{project.total_pages}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Créé par</dt>
                        <dd>{project.creator_name}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Créé le</dt>
                        <dd>{new Date(project.created_at).toLocaleDateString('fr-FR')}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
