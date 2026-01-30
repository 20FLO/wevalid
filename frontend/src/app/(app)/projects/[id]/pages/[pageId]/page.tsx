'use client';

import { use, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectsApi } from '@/lib/api/projects';
import { annotationsApi, CreateAnnotationData } from '@/lib/api/annotations';
import { filesApi } from '@/lib/api/files';
import { useAuth } from '@/hooks/use-auth';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  History,
  Upload,
  CheckCircle2,
  Clock,
  Loader2,
  FileText,
  Download,
  Trash2,
  Plus,
} from 'lucide-react';
import type { Page, Annotation, WorkflowHistory, FileItem, PageStatus } from '@/types';
import { PAGE_STATUS_LABELS, PAGE_STATUS_COLORS } from '@/types';

interface PageDetailProps {
  params: Promise<{ id: string; pageId: string }>;
}

export default function PageDetailPage({ params }: PageDetailProps) {
  const { id, pageId } = use(params);
  const projectId = parseInt(id);
  const pageIdNum = parseInt(pageId);
  const router = useRouter();
  const { user } = useAuth();

  // State
  const [page, setPage] = useState<Page | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<WorkflowHistory[]>([]);
  const [allowedTransitions, setAllowedTransitions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Annotation state
  const [showAnnotationDialog, setShowAnnotationDialog] = useState(false);
  const [annotationContent, setAnnotationContent] = useState('');
  const [annotationType, setAnnotationType] = useState<'comment' | 'highlight'>('comment');
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [isSubmittingAnnotation, setIsSubmittingAnnotation] = useState(false);

  // Navigation state
  const [allPages, setAllPages] = useState<Page[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Fetch page data
  const fetchPageData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pageRes, annotationsRes, historyRes, pagesRes] = await Promise.all([
        projectsApi.getPage(pageIdNum),
        annotationsApi.getByPage(pageIdNum),
        projectsApi.getPageHistory(pageIdNum),
        projectsApi.getPages(projectId),
      ]);

      setPage(pageRes.page);
      setAnnotations(annotationsRes.annotations);
      setHistory(historyRes.history);
      setAllPages(pagesRes.pages);

      // Find current page index
      const idx = pagesRes.pages.findIndex((p) => p.id === pageIdNum);
      setCurrentIndex(idx);

      // Get allowed transitions
      if (pageRes.page.status) {
        const transitionsRes = await projectsApi.getAllowedTransitions(pageRes.page.status);
        setAllowedTransitions(transitionsRes.allowed_transitions || []);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement de la page');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [pageIdNum, projectId]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  // Handle image click for annotation
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setClickPosition({ x, y });
    setShowAnnotationDialog(true);
  };

  // Submit annotation
  const handleSubmitAnnotation = async () => {
    if (!annotationContent.trim() || !clickPosition) return;

    setIsSubmittingAnnotation(true);
    try {
      const data: CreateAnnotationData = {
        page_id: pageIdNum,
        type: annotationType,
        content: annotationContent,
        position: {
          x: clickPosition.x,
          y: clickPosition.y,
        },
      };

      await annotationsApi.create(data);
      toast.success('Annotation ajoutée');
      setShowAnnotationDialog(false);
      setAnnotationContent('');
      setClickPosition(null);
      fetchPageData();
    } catch (error) {
      toast.error('Erreur lors de l\'ajout de l\'annotation');
    } finally {
      setIsSubmittingAnnotation(false);
    }
  };

  // Delete annotation
  const handleDeleteAnnotation = async (annotationId: number) => {
    try {
      await annotationsApi.delete(annotationId);
      toast.success('Annotation supprimée');
      fetchPageData();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  // Resolve annotation
  const handleResolveAnnotation = async (annotationId: number) => {
    try {
      await annotationsApi.resolve(annotationId);
      toast.success('Annotation résolue');
      fetchPageData();
    } catch (error) {
      toast.error('Erreur lors de la résolution');
    }
  };

  // Change status
  const handleStatusChange = async (newStatus: string) => {
    setIsChangingStatus(true);
    try {
      await projectsApi.updatePageStatus(pageIdNum, newStatus);
      toast.success('Statut mis à jour');
      fetchPageData();
    } catch (error) {
      toast.error('Erreur lors du changement de statut');
    } finally {
      setIsChangingStatus(false);
    }
  };

  // Upload file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      await filesApi.upload(pageIdNum, Array.from(files));
      toast.success('Fichier uploadé');
      fetchPageData();
    } catch (error) {
      toast.error('Erreur lors de l\'upload');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Navigation
  const goToPage = (index: number) => {
    if (index >= 0 && index < allPages.length) {
      router.push(`/projects/${projectId}/pages/${allPages[index].id}`);
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Chargement..." />
        <main className="p-6">
          <Skeleton className="h-[600px] w-full" />
        </main>
      </>
    );
  }

  if (!page) {
    return (
      <>
        <Header title="Page non trouvée" />
        <main className="flex flex-col items-center justify-center p-6">
          <p className="text-muted-foreground">Cette page n&apos;existe pas.</p>
          <Button asChild className="mt-4">
            <Link href={`/projects/${projectId}`}>Retour au projet</Link>
          </Button>
        </main>
      </>
    );
  }

  const currentFile = page.files?.[0];
  const thumbnailUrl = page.latest_file_id
    ? filesApi.getThumbnailUrl(page.latest_file_id)
    : currentFile
    ? filesApi.getThumbnailUrl(currentFile.id)
    : null;

  return (
    <>
      <Header
        title={`Page ${page.page_number}`}
        description={PAGE_STATUS_LABELS[page.status]}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={currentIndex <= 0}
            onClick={() => goToPage(currentIndex - 1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} / {allPages.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={currentIndex >= allPages.length - 1}
            onClick={() => goToPage(currentIndex + 1)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/projects/${projectId}`}>Retour au projet</Link>
          </Button>
        </div>
      </Header>

      <main className="flex-1 p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main viewer */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-4">
                {/* Image viewer with click-to-annotate */}
                <div
                  className="relative cursor-crosshair bg-muted rounded-lg overflow-hidden"
                  style={{ minHeight: '500px' }}
                  onClick={handleImageClick}
                >
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={`Page ${page.page_number}`}
                      className="w-full h-auto"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[500px]">
                      <FileText className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}

                  {/* Annotation markers */}
                  {annotations.map((annotation) =>
                    annotation.position ? (
                      <div
                        key={annotation.id}
                        className="absolute w-6 h-6 -ml-3 -mt-3 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold cursor-pointer hover:scale-110 transition-transform"
                        style={{
                          left: `${annotation.position.x}%`,
                          top: `${annotation.position.y}%`,
                        }}
                        title={annotation.content}
                      >
                        {annotation.resolved ? '✓' : annotations.indexOf(annotation) + 1}
                      </div>
                    ) : null
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Cliquez sur l&apos;image pour ajouter une annotation
                </p>
              </CardContent>
            </Card>

            {/* File actions */}
            <div className="flex gap-2">
              <Button variant="outline" asChild disabled={!currentFile}>
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  {isUploading ? 'Upload...' : 'Uploader un fichier'}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff,.psd"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </label>
              </Button>
              {currentFile && (
                <Button variant="outline" asChild>
                  <a
                    href={filesApi.getDownloadUrl(currentFile.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Télécharger
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Statut</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge className={PAGE_STATUS_COLORS[page.status]}>
                  {PAGE_STATUS_LABELS[page.status]}
                </Badge>

                {allowedTransitions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Changer le statut</Label>
                    <Select
                      onValueChange={handleStatusChange}
                      disabled={isChangingStatus}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un statut" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedTransitions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {PAGE_STATUS_LABELS[status as PageStatus] || status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs for annotations and history */}
            <Tabs defaultValue="annotations">
              <TabsList className="w-full">
                <TabsTrigger value="annotations" className="flex-1">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Annotations ({annotations.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1">
                  <History className="mr-2 h-4 w-4" />
                  Historique
                </TabsTrigger>
              </TabsList>

              <TabsContent value="annotations" className="mt-4 space-y-3">
                {annotations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aucune annotation
                  </p>
                ) : (
                  annotations.map((annotation, index) => (
                    <Card key={annotation.id} className={annotation.resolved ? 'opacity-60' : ''}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                              {index + 1}
                            </span>
                            <div>
                              <p className="text-sm font-medium">
                                {annotation.author_name || 'Utilisateur'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(annotation.created_at).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {!annotation.resolved && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleResolveAnnotation(annotation.id)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleDeleteAnnotation(annotation.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm">{annotation.content}</p>
                        {annotation.resolved && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            Résolu
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setClickPosition({ x: 50, y: 50 });
                    setShowAnnotationDialog(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter une annotation
                </Button>
              </TabsContent>

              <TabsContent value="history" className="mt-4 space-y-3">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aucun historique
                  </p>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p>
                          <span className="font-medium">{item.changed_by_name}</span>
                          {' a changé le statut de '}
                          <Badge variant="outline" className="mx-1 text-xs">
                            {PAGE_STATUS_LABELS[item.from_status] || item.from_status}
                          </Badge>
                          {' à '}
                          <Badge variant="outline" className="mx-1 text-xs">
                            {PAGE_STATUS_LABELS[item.to_status] || item.to_status}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.changed_at).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Annotation Dialog */}
      <Dialog open={showAnnotationDialog} onOpenChange={setShowAnnotationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une annotation</DialogTitle>
            <DialogDescription>
              Ajoutez un commentaire ou une remarque sur cette page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={annotationType}
                onValueChange={(v) => setAnnotationType(v as 'comment' | 'highlight')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comment">Commentaire</SelectItem>
                  <SelectItem value="highlight">Surlignage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contenu</Label>
              <Textarea
                placeholder="Votre annotation..."
                value={annotationContent}
                onChange={(e) => setAnnotationContent(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnnotationDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmitAnnotation}
              disabled={!annotationContent.trim() || isSubmittingAnnotation}
            >
              {isSubmittingAnnotation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
