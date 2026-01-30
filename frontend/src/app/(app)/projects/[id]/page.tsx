'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProject, useProjectPages } from '@/hooks/use-projects';
import { projectsApi } from '@/lib/api/projects';
import { projectFilesApi } from '@/lib/api/project-files';
import { filesApi } from '@/lib/api/files';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageStatus, ProjectFile, ProjectDashboard as DashboardData } from '@/types';
import { ArrowLeft, Users, FileText, Settings, Building2, LayoutDashboard, FolderOpen, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageThumbnail } from '@/components/projects/page-thumbnail';
import { ProjectFilesTab } from '@/components/projects/project-files-tab';
import { ProjectDashboard } from '@/components/projects/project-dashboard';
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
  const router = useRouter();
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const { project, isLoading: projectLoading, refetch: refreshProject } = useProject(projectId);
  const { pages, isLoading: pagesLoading, refetch: refreshPages } = useProjectPages(projectId);

  // PDF upload state
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [uploadStartPage, setUploadStartPage] = useState<string>('');

  // Page filtering/sorting state
  const [statusFilter, setStatusFilter] = useState<PageStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('page_number');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Dashboard and files state
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const data = await projectsApi.getDashboard(projectId);
      setDashboard(data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setDashboardLoading(false);
    }
  }, [projectId]);

  // Fetch project files
  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const data = await projectFilesApi.getAll(projectId);
      setProjectFiles(data.files);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setFilesLoading(false);
    }
  }, [projectId]);

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'dashboard' && !dashboard && !dashboardLoading) {
      fetchDashboard();
    }
    if (activeTab === 'files' && projectFiles.length === 0 && !filesLoading) {
      fetchFiles();
    }
  }, [activeTab, dashboard, dashboardLoading, projectFiles.length, filesLoading, fetchDashboard, fetchFiles]);

  // Initial load dashboard
  useEffect(() => {
    if (project && !dashboard) {
      fetchDashboard();
    }
  }, [project, dashboard, fetchDashboard]);

  // Apply filters and sorting
  const filteredPages = useFilteredPages(pages, statusFilter, sortField, sortDirection);

  // Handle complete PDF upload
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Veuillez sélectionner un fichier PDF');
      return;
    }

    setIsUploadingPdf(true);
    try {
      const startPage = uploadStartPage ? parseInt(uploadStartPage) : undefined;
      const result = await filesApi.uploadCompletePdf(projectId, file, startPage);
      toast.success(`PDF découpé en ${result.stats.files_created} pages`);
      // Refresh pages list
      refreshPages();
      refreshProject();
      fetchDashboard();
      // Reset
      setUploadStartPage('');
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'upload');
    } finally {
      setIsUploadingPdf(false);
    }
  };

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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Vue d&apos;ensemble
            </TabsTrigger>
            <TabsTrigger value="files">
              <FolderOpen className="mr-2 h-4 w-4" />
              Fichiers ({projectFiles.length})
            </TabsTrigger>
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

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="mt-4">
            <ProjectDashboard data={dashboard} isLoading={dashboardLoading} />
          </TabsContent>

          {/* Files Tab */}
          <TabsContent value="files" className="mt-4">
            <ProjectFilesTab
              projectId={projectId}
              files={projectFiles}
              onRefresh={fetchFiles}
              isLoading={filesLoading}
            />
          </TabsContent>

          <TabsContent value="pages" className="mt-4 space-y-4">
            {/* Upload PDF complet */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="pdf-upload" className="text-sm font-medium">
                      Upload PDF complet
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Le PDF sera découpé page par page et assigné aux pages du projet
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-24">
                      <Label htmlFor="start-page" className="text-xs">Page départ</Label>
                      <Input
                        id="start-page"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={uploadStartPage}
                        onChange={(e) => setUploadStartPage(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <Button
                      variant="outline"
                      disabled={isUploadingPdf}
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      {isUploadingPdf ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Découpage...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Sélectionner PDF
                        </>
                      )}
                    </Button>
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handlePdfUpload}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

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
