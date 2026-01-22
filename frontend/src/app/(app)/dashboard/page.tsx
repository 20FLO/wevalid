'use client';

import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { Header } from '@/components/layout/header';
import { ProjectCard } from '@/components/projects/project-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderKanban, FileText, CheckCircle, Clock } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const { projects, isLoading } = useProjects({ limit: 6 });

  // Calculer les statistiques
  const stats = {
    totalProjects: projects.length,
    inProgress: projects.filter((p) => p.status === 'in_progress').length,
    totalPages: projects.reduce(
      (acc, p) => acc + (parseInt(p.total_pages_count || String(p.total_pages)) || 0),
      0
    ),
    validatedPages: projects.reduce(
      (acc, p) => acc + (parseInt(p.validated_pages_count || '0') || 0),
      0
    ),
  };

  return (
    <>
      <Header
        title={`Bonjour, ${user?.first_name} 👋`}
        description="Voici un aperçu de votre activité"
      />

      <main className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projets</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProjects}</div>
              <p className="text-xs text-muted-foreground">
                {stats.inProgress} en cours
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pages totales</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPages}</div>
              <p className="text-xs text-muted-foreground">
                Sur tous les projets
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pages validées</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.validatedPages}</div>
              <p className="text-xs text-muted-foreground">
                BAT validés
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.totalPages - stats.validatedPages}
              </div>
              <p className="text-xs text-muted-foreground">
                Pages à traiter
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Projects */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Projets récents</h2>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
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
              <CardContent className="flex flex-col items-center justify-center py-10">
                <FolderKanban className="h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Aucun projet pour le moment</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
