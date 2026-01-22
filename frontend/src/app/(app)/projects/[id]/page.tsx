'use client';

import { use } from 'react';
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
import { ArrowLeft, Users, FileText, Settings } from 'lucide-react';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const projectId = parseInt(id);

  const { project, isLoading: projectLoading } = useProject(projectId);
  const { pages, isLoading: pagesLoading } = useProjectPages(projectId);
  const { stats } = useWorkflowStats(projectId);

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
        <div className="grid gap-4 md:grid-cols-3">
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

          <TabsContent value="pages" className="mt-4">
            {pagesLoading ? (
              <div className="grid gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {pages.map((page) => (
                  <Link
                    key={page.id}
                    href={`/projects/${project.id}/pages/${page.id}`}
                    className="group"
                  >
                    <Card className="transition-shadow hover:shadow-md">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Page {page.page_number}</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${PAGE_STATUS_COLORS[page.status]}`}
                          >
                            {PAGE_STATUS_LABELS[page.status].split(' ')[0]}
                          </Badge>
                        </div>
                        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                          {page.files_count && <span>{page.files_count} fichiers</span>}
                          {page.annotations_count && <span>{page.annotations_count} annot.</span>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
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
                <p className="text-muted-foreground">
                  Paramètres du projet (à implémenter)
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
