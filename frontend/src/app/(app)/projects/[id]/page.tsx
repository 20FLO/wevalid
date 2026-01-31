'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProject, useProjectPages } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
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
import { Checkbox } from '@/components/ui/checkbox';
import { PageStatus, ProjectFile, ProjectDashboard as DashboardData } from '@/types';
import { ArrowLeft, Users, FileText, Settings, Building2, LayoutDashboard, FolderOpen, Upload, Loader2, Save, Download } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const { user } = useAuth();

  const { project, isLoading: projectLoading, refetch: refreshProject } = useProject(projectId);
  const { pages, isLoading: pagesLoading, refetch: refreshPages } = useProjectPages(projectId);

  // PDF upload state - use user preference as default
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [uploadStartPage, setUploadStartPage] = useState<string>('');
  const [sanitizeFilename, setSanitizeFilename] = useState(user?.sanitize_filenames ?? false);

  // State for files that couldn't be auto-assigned
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; filename: string; reason: string }>>([]);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedPageForAssign, setSelectedPageForAssign] = useState<string>('');

  // Update sanitizeFilename when user loads
  useEffect(() => {
    setSanitizeFilename(user?.sanitize_filenames ?? false);
  }, [user?.sanitize_filenames]);

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

  // Project settings form state
  const [editTitle, setEditTitle] = useState('');
  const [editIsbn, setEditIsbn] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWidthMm, setEditWidthMm] = useState('');
  const [editHeightMm, setEditHeightMm] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Initialize form when project loads
  useEffect(() => {
    if (project) {
      setEditTitle(project.title || '');
      setEditIsbn(project.isbn || '');
      setEditDescription(project.description || '');
      setEditWidthMm(project.width_mm?.toString() || '');
      setEditHeightMm(project.height_mm?.toString() || '');
      setEditStatus(project.status || 'draft');
    }
  }, [project]);

  // Save project settings
  const handleSaveSettings = async () => {
    if (!editTitle.trim()) {
      toast.error('Le titre est requis');
      return;
    }

    setIsSavingSettings(true);
    try {
      await projectsApi.update(projectId, {
        title: editTitle.trim(),
        isbn: editIsbn.trim() || undefined,
        description: editDescription.trim() || undefined,
        width_mm: editWidthMm ? parseInt(editWidthMm) : undefined,
        height_mm: editHeightMm ? parseInt(editHeightMm) : undefined,
        status: editStatus,
      });
      toast.success('Projet mis à jour avec succès');
      refreshProject();
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la mise à jour');
    } finally {
      setIsSavingSettings(false);
    }
  };

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
      const result = await filesApi.uploadCompletePdf(projectId, file, startPage, {
        sanitizeFilename,
      });
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

  // Store original files for re-upload if needed
  const pendingFilesMapRef = useRef<Map<string, File>>(new Map());

  // Handle smart upload with automatic page label detection
  const handleSmartUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // Store files for potential manual assignment
    pendingFilesMapRef.current.clear();
    fileArray.forEach(f => pendingFilesMapRef.current.set(f.name, f));

    setIsUploadingPdf(true);
    try {
      const result = await filesApi.uploadWithLabels(projectId, fileArray, {
        sanitizeFilename,
      });

      const successCount = result.assignments.filter(a => a.status === 'success').length;
      const skippedAssignments = result.assignments.filter(a => a.status === 'skipped');

      if (skippedAssignments.length > 0) {
        // Store skipped files for manual assignment
        const skippedFilesList = skippedAssignments.map(a => ({
          file: pendingFilesMapRef.current.get(a.filename)!,
          filename: a.filename,
          reason: a.reason || 'Page non trouvée'
        })).filter(f => f.file);

        setPendingFiles(skippedFilesList);
        setShowAssignDialog(true);

        if (successCount > 0) {
          toast.success(`${successCount} fichier(s) placé(s) automatiquement`);
        }
      } else {
        toast.success(`${successCount} fichier(s) importé(s) aux bonnes positions`);
      }

      // Refresh even if some are pending
      refreshPages();
      refreshProject();
      fetchDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'upload');
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  // Handle manual assignment of a pending file
  const handleManualAssign = async () => {
    if (pendingFiles.length === 0 || !selectedPageForAssign) return;

    const currentFile = pendingFiles[0];
    const pageId = parseInt(selectedPageForAssign);

    try {
      await filesApi.upload(pageId, [currentFile.file], { sanitizeFilename });
      toast.success(`${currentFile.filename} assigné à la page`);

      // Remove from pending and continue
      const remaining = pendingFiles.slice(1);
      setPendingFiles(remaining);
      setSelectedPageForAssign('');

      if (remaining.length === 0) {
        setShowAssignDialog(false);
        refreshPages();
        refreshProject();
        fetchDashboard();
      }
    } catch (error) {
      toast.error('Erreur lors de l\'assignation');
    }
  };

  // Skip current pending file
  const handleSkipFile = () => {
    const remaining = pendingFiles.slice(1);
    setPendingFiles(remaining);
    setSelectedPageForAssign('');

    if (remaining.length === 0) {
      setShowAssignDialog(false);
      refreshPages();
      refreshProject();
      fetchDashboard();
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const blob = await filesApi.downloadProject(projectId, true);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${project.title.replace(/[^a-zA-Z0-9-_]/g, '_')}_complet.pdf`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Téléchargement en cours...');
              } catch (error) {
                toast.error('Erreur lors du téléchargement');
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Télécharger PDF
          </Button>
          <Button variant="outline" asChild>
            <Link href="/projects">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
        </div>
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
              defaultSanitizeFilename={user?.sanitize_filenames ?? false}
            />
          </TabsContent>

          <TabsContent value="pages" className="mt-4 space-y-4">
            {/* Upload PDF */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="space-y-4">
                  {/* Import intelligent (détection automatique) */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="pdf-upload" className="text-sm font-medium">
                        Importer des PDFs
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Les fichiers sont automatiquement placés selon leurs Page Labels ou le numéro dans le nom. Si la page cible n&apos;est pas trouvée, vous pourrez choisir où les placer.
                      </p>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex items-center gap-2 pb-1">
                        <Checkbox
                          id="sanitize-filename"
                          checked={sanitizeFilename}
                          onCheckedChange={(checked) => setSanitizeFilename(checked === true)}
                        />
                        <Label htmlFor="sanitize-filename" className="text-xs cursor-pointer">
                          Simplifier noms
                        </Label>
                      </div>
                      <Button
                        variant="default"
                        disabled={isUploadingPdf}
                        onClick={() => pdfInputRef.current?.click()}
                      >
                        {isUploadingPdf ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Import...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Importer PDF(s)
                          </>
                        )}
                      </Button>
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={handleSmartUpload}
                      />
                    </div>
                  </div>

                  {/* Option alternative : PDF complet */}
                  <div className="border-t pt-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                      <div className="flex-1 space-y-2">
                        <p className="text-sm font-medium">Upload PDF complet (découpage)</p>
                        <p className="text-xs text-muted-foreground">
                          Découpez un PDF multi-pages et assignez-le séquentiellement à partir d&apos;une page de départ
                        </p>
                      </div>
                      <div className="flex items-end gap-3">
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
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.pdf';
                            input.onchange = (e) => handlePdfUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
                            input.click();
                          }}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Découper PDF
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dialog for manual page assignment */}
            <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assignation manuelle</DialogTitle>
                  <DialogDescription>
                    Le fichier suivant n&apos;a pas pu être placé automatiquement. Veuillez sélectionner la page cible.
                  </DialogDescription>
                </DialogHeader>
                {pendingFiles.length > 0 && (
                  <div className="space-y-4 py-4">
                    <div className="rounded-lg border p-3 bg-muted/50">
                      <p className="font-medium text-sm">{pendingFiles[0].filename}</p>
                      <p className="text-xs text-muted-foreground mt-1">{pendingFiles[0].reason}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="page-select">Sélectionner la page cible</Label>
                      <Select value={selectedPageForAssign} onValueChange={setSelectedPageForAssign}>
                        <SelectTrigger id="page-select">
                          <SelectValue placeholder="Choisir une page..." />
                        </SelectTrigger>
                        <SelectContent>
                          {pages.map((page) => (
                            <SelectItem key={page.id} value={String(page.id)}>
                              Page {page.page_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {pendingFiles.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        {pendingFiles.length - 1} autre(s) fichier(s) en attente
                      </p>
                    )}
                  </div>
                )}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="ghost" onClick={handleSkipFile}>
                    Ignorer ce fichier
                  </Button>
                  <Button onClick={handleManualAssign} disabled={!selectedPageForAssign}>
                    Assigner à cette page
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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
              <CardHeader>
                <CardTitle className="text-lg">Paramètres du projet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Editable fields */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Titre *</Label>
                    <Input
                      id="edit-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titre du projet"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-isbn">ISBN</Label>
                    <Input
                      id="edit-isbn"
                      value={editIsbn}
                      onChange={(e) => setEditIsbn(e.target.value)}
                      placeholder="978-2-1234-5678-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description du projet..."
                    rows={3}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-width">Largeur (mm)</Label>
                    <Input
                      id="edit-width"
                      type="number"
                      min="50"
                      max="1000"
                      value={editWidthMm}
                      onChange={(e) => setEditWidthMm(e.target.value)}
                      placeholder="210"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-height">Hauteur (mm)</Label>
                    <Input
                      id="edit-height"
                      type="number"
                      min="50"
                      max="1000"
                      value={editHeightMm}
                      onChange={(e) => setEditHeightMm(e.target.value)}
                      placeholder="297"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-status">Statut</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger id="edit-status">
                        <SelectValue placeholder="Sélectionner un statut" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Brouillon</SelectItem>
                        <SelectItem value="in_progress">En cours</SelectItem>
                        <SelectItem value="bat">BAT</SelectItem>
                        <SelectItem value="completed">Terminé</SelectItem>
                        <SelectItem value="archived">Archivé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Read-only info */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">Informations non modifiables</h4>
                  <dl className="grid gap-2 text-sm md:grid-cols-2">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Nombre de pages</dt>
                      <dd className="font-medium">{project.total_pages}</dd>
                    </div>
                    {project.publisher_name && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Maison d&apos;édition</dt>
                        <dd className="font-medium">{project.publisher_name}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Créé par</dt>
                      <dd className="font-medium">{project.creator_name}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Créé le</dt>
                      <dd className="font-medium">{new Date(project.created_at).toLocaleDateString('fr-FR')}</dd>
                    </div>
                  </dl>
                </div>

                {/* Save button */}
                <div className="flex justify-end">
                  <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                    {isSavingSettings ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Enregistrer les modifications
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
