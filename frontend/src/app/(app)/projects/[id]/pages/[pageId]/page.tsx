'use client';

import { use, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { projectsApi } from '@/lib/api/projects';
import { annotationsApi, CreateAnnotationData } from '@/lib/api/annotations';
import { filesApi } from '@/lib/api/files';
import { usersApi } from '@/lib/api/users';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  Highlighter,
  Lock,
  ShieldAlert,
  GitCompareArrows,
  X,
  Layers,
  MessageCircle,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { MentionInput } from '@/components/ui/mention-input';
import type { Page, Annotation, WorkflowHistory, FileItem, PageStatus, AnnotationReply, User } from '@/types';
import { PAGE_STATUS_LABELS, PAGE_STATUS_COLORS, LOCKED_STATUSES } from '@/types';

// Import PDF viewer dynamically to avoid SSR issues
const PDFViewer = dynamic(() => import('@/components/pdf/pdf-viewer').then(mod => ({ default: mod.PDFViewer })), {
  ssr: false,
  loading: () => <Skeleton className="h-[500px] w-full" />,
});

// Import ViewState type for synchronized viewing
import type { ViewState } from '@/components/pdf/pdf-viewer';

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
  const [allowedTransitions, setAllowedTransitions] = useState<Array<{ status: string; label: string } | string>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [sanitizeFilename, setSanitizeFilename] = useState(user?.sanitize_filenames ?? false);

  // Update sanitizeFilename when user loads
  useEffect(() => {
    setSanitizeFilename(user?.sanitize_filenames ?? false);
  }, [user?.sanitize_filenames]);

  // Annotation state
  const [showAnnotationDialog, setShowAnnotationDialog] = useState(false);
  const [annotationContent, setAnnotationContent] = useState('');
  const [annotationType, setAnnotationType] = useState<'comment' | 'highlight'>('comment');
  const [annotationData, setAnnotationData] = useState<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    pageNumber: number;
    selectedText?: string;
    type: 'click' | 'highlight' | 'ink';
    inkPath?: string;
  } | null>(null);
  const [isSubmittingAnnotation, setIsSubmittingAnnotation] = useState(false);

  // Navigation state
  const [allPages, setAllPages] = useState<Page[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Annotation highlighting state (for syncing PDF markers with list)
  const [highlightedAnnotationId, setHighlightedAnnotationId] = useState<number | null>(null);

  // Version history state
  const [fileVersions, setFileVersions] = useState<FileItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<FileItem | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersion, setCompareVersion] = useState<FileItem | null>(null);

  // Synchronized view state for comparison mode
  const [sharedViewState, setSharedViewState] = useState<ViewState>({
    scale: 1,
    panX: 0,
    panY: 0,
    containerHeight: typeof window !== 'undefined' ? window.innerHeight - 280 : 500
  });

  // Reply state
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
  const [repliesCache, setRepliesCache] = useState<Record<number, AnnotationReply[]>>({});
  const [replyInputs, setReplyInputs] = useState<Record<number, string>>({});
  const [loadingReplies, setLoadingReplies] = useState<Set<number>>(new Set());
  const [submittingReply, setSubmittingReply] = useState<number | null>(null);

  // Users for mentions
  const [mentionUsers, setMentionUsers] = useState<User[]>([]);

  // Fetch page data
  const fetchPageData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pageRes, annotationsRes, historyRes, pagesRes, versionsRes] = await Promise.all([
        projectsApi.getPage(pageIdNum),
        annotationsApi.getByPage(pageIdNum),
        projectsApi.getPageHistory(pageIdNum),
        projectsApi.getPages(projectId),
        filesApi.getVersionHistory(pageIdNum),
      ]);

      setPage(pageRes.page);
      setAnnotations(annotationsRes.annotations);
      setHistory(historyRes.history);
      setAllPages(pagesRes.pages);
      setFileVersions(versionsRes.versions || []);

      // Set current version (latest) as selected
      const currentVersion = versionsRes.versions?.find((v: FileItem) => v.is_current) || versionsRes.versions?.[0];
      setSelectedVersion(currentVersion || null);

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

  // Load project members for mentions
  useEffect(() => {
    const loadProjectMembers = async () => {
      try {
        const { project } = await projectsApi.getById(projectId);
        if (project.members && project.members.length > 0) {
          // Use project members for mentions (cast to User[] as they share essential fields)
          setMentionUsers(project.members as unknown as User[]);
        } else {
          // Fallback to all users if no members defined
          const { users } = await usersApi.getAll();
          setMentionUsers(users);
        }
      } catch (error) {
        // Silently fail - mentions will just not have autocomplete
        console.warn('Could not load project members for mentions:', error);
      }
    };
    loadProjectMembers();
  }, [projectId]);

  // Handle image click for annotation
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!page) return;
    // Block annotations on locked pages (unless admin)
    if (LOCKED_STATUSES.includes(page.status) && user?.role !== 'admin') {
      toast.error('Cette page est verrouillée. Annotations désactivées.');
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setAnnotationData({ x, y, pageNumber: page.page_number, type: 'click' });
    setAnnotationType('comment');
    setShowAnnotationDialog(true);
  };

  // Submit annotation
  const handleSubmitAnnotation = async () => {
    if (!annotationData || !page) return;
    // For ink annotations, content is optional
    if (annotationData.type !== 'ink' && !annotationContent.trim()) return;

    setIsSubmittingAnnotation(true);
    try {
      // Determine annotation type
      let annotType: 'comment' | 'highlight' | 'ink' = 'comment';
      if (annotationData.type === 'highlight') annotType = 'highlight';
      else if (annotationData.type === 'ink') annotType = 'ink';

      const data: CreateAnnotationData = {
        page_id: pageIdNum,
        type: annotType,
        content: annotationContent || (annotType === 'ink' ? 'Dessin' : ''),
        position: {
          x: annotationData.x,
          y: annotationData.y,
          width: annotationData.width,
          height: annotationData.height,
          page_number: annotationData.pageNumber || page.page_number,
          ink_path: annotationData.inkPath,
        },
        color: annotationData.type === 'highlight' ? '#FFFF00' :
               annotationData.type === 'ink' ? '#FF0000' : undefined,
      };

      await annotationsApi.create(data);
      toast.success('Annotation ajoutée');
      setShowAnnotationDialog(false);
      setAnnotationContent('');
      setAnnotationData(null);
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

  // Toggle replies visibility and load them
  const toggleReplies = async (annotationId: number) => {
    const isExpanded = expandedReplies.has(annotationId);

    if (isExpanded) {
      // Collapse
      setExpandedReplies(prev => {
        const next = new Set(prev);
        next.delete(annotationId);
        return next;
      });
    } else {
      // Expand and load replies if not cached
      setExpandedReplies(prev => new Set(prev).add(annotationId));

      if (!repliesCache[annotationId]) {
        setLoadingReplies(prev => new Set(prev).add(annotationId));
        try {
          const { replies } = await annotationsApi.getReplies(annotationId);
          setRepliesCache(prev => ({ ...prev, [annotationId]: replies }));
        } catch (error) {
          toast.error('Erreur lors du chargement des réponses');
        } finally {
          setLoadingReplies(prev => {
            const next = new Set(prev);
            next.delete(annotationId);
            return next;
          });
        }
      }
    }
  };

  // Submit a reply
  const handleSubmitReply = async (annotationId: number) => {
    const content = replyInputs[annotationId]?.trim();
    if (!content) return;

    setSubmittingReply(annotationId);
    try {
      const { reply } = await annotationsApi.addReply(annotationId, content);
      // Add to cache
      setRepliesCache(prev => ({
        ...prev,
        [annotationId]: [...(prev[annotationId] || []), reply],
      }));
      // Clear input
      setReplyInputs(prev => ({ ...prev, [annotationId]: '' }));
      // Update annotation reply count in main list
      fetchPageData();
      toast.success('Réponse ajoutée');
    } catch (error) {
      toast.error('Erreur lors de l\'ajout de la réponse');
    } finally {
      setSubmittingReply(null);
    }
  };

  // Delete a reply
  const handleDeleteReply = async (annotationId: number, replyId: number) => {
    try {
      await annotationsApi.deleteReply(annotationId, replyId);
      // Remove from cache
      setRepliesCache(prev => ({
        ...prev,
        [annotationId]: (prev[annotationId] || []).filter(r => r.id !== replyId),
      }));
      fetchPageData();
      toast.success('Réponse supprimée');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
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
      await filesApi.upload(pageIdNum, Array.from(files), { sanitizeFilename });
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

  // Use selectedVersion if available, otherwise latest_file_id
  const currentFile = selectedVersion || (page.latest_file_id
    ? page.files?.find(f => f.id === page.latest_file_id) || page.files?.[0]
    : page.files?.[0]);

  const thumbnailUrl = currentFile
    ? filesApi.getThumbnailUrl(currentFile.id)
    : null;

  // Check if current file is a PDF
  const fileIdForPdf = currentFile?.id;
  const isPDF = currentFile?.file_type === 'application/pdf' || currentFile?.original_filename?.endsWith('.pdf');
  const pdfUrl = fileIdForPdf ? filesApi.getDownloadUrl(fileIdForPdf) : null;

  // For comparison mode
  const comparePdfUrl = compareVersion?.id ? filesApi.getDownloadUrl(compareVersion.id) : null;
  const hasMultipleVersions = fileVersions.length > 1;

  // Check if page is locked (BAT validé or sent to printer)
  const isLocked = LOCKED_STATUSES.includes(page.status);
  const isAdmin = user?.role === 'admin';

  return (
    <>
      <Header
        title={`Page ${page.page_number}`}
        description={PAGE_STATUS_LABELS[page.status]}
      >
        <Button variant="outline" asChild>
          <Link href={`/projects/${projectId}`}>Retour au projet</Link>
        </Button>
      </Header>

      <main className="flex-1 p-6">
        <div className="flex gap-4">
          {/* Thumbnail navigation sidebar */}
          <div className="hidden lg:block w-32 shrink-0">
            <div className="sticky top-6 space-y-2 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Pages</p>
              {allPages.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => goToPage(idx)}
                  className={cn(
                    'w-full rounded-md border overflow-hidden transition-all hover:ring-2 hover:ring-primary',
                    p.id === pageIdNum ? 'ring-2 ring-primary' : 'opacity-70 hover:opacity-100'
                  )}
                >
                  <div className="aspect-[3/4] bg-muted relative">
                    {p.latest_file_id ? (
                      <img
                        src={filesApi.getThumbnailUrl(p.latest_file_id)}
                        alt={`Page ${p.page_number}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 text-center">
                      {p.page_number}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 grid gap-6 lg:grid-cols-3">
            {/* Main viewer */}
            <div className="lg:col-span-2 space-y-4">

            {/* Version controls */}
            {hasMultipleVersions && (
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Version</span>
                      <Select
                        value={selectedVersion?.id?.toString() || ''}
                        onValueChange={(value) => {
                          const version = fileVersions.find(v => v.id === parseInt(value));
                          setSelectedVersion(version || null);
                        }}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Sélectionner une version" />
                        </SelectTrigger>
                        <SelectContent>
                          {fileVersions.map((v) => (
                            <SelectItem key={v.id} value={v.id.toString()}>
                              v{v.version} - {new Date(v.uploaded_at).toLocaleDateString('fr-FR')}
                              {v.is_current && ' (actuelle)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {!compareMode ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCompareMode(true);
                          // Reset view state when entering compare mode
                          setSharedViewState({ scale: 1, panX: 0, panY: 0, containerHeight: window.innerHeight - 280 });
                          // Default to previous version for comparison
                          const currentIndex = fileVersions.findIndex(v => v.id === selectedVersion?.id);
                          const prevVersion = fileVersions[currentIndex + 1] || fileVersions[0];
                          setCompareVersion(prevVersion);
                        }}
                      >
                        <GitCompareArrows className="mr-2 h-4 w-4" />
                        Comparer
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">vs</span>
                        <Select
                          value={compareVersion?.id?.toString() || ''}
                          onValueChange={(value) => {
                            const version = fileVersions.find(v => v.id === parseInt(value));
                            setCompareVersion(version || null);
                          }}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Version à comparer" />
                          </SelectTrigger>
                          <SelectContent>
                            {fileVersions.filter(v => v.id !== selectedVersion?.id).map((v) => (
                              <SelectItem key={v.id} value={v.id.toString()}>
                                v{v.version} - {new Date(v.uploaded_at).toLocaleDateString('fr-FR')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCompareMode(false);
                            setCompareVersion(null);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Comparison view - side by side with synchronized zoom/pan */}
            {compareMode && comparePdfUrl && isPDF ? (
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm">
                      v{selectedVersion?.version} - {selectedVersion?.uploaded_by_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-hidden">
                    <PDFViewer
                      url={pdfUrl!}
                      annotations={annotations.filter(a =>
                        !a.created_in_file_id || a.created_in_file_id <= (selectedVersion?.id || 0)
                      )}
                      highlightedAnnotationId={highlightedAnnotationId}
                      readOnly={true}
                      className="min-h-[500px]"
                      viewState={sharedViewState}
                      onViewStateChange={setSharedViewState}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm">
                      v{compareVersion?.version} - {compareVersion?.uploaded_by_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-hidden">
                    <PDFViewer
                      url={comparePdfUrl}
                      annotations={annotations.filter(a =>
                        !a.created_in_file_id || a.created_in_file_id <= (compareVersion?.id || 0)
                      )}
                      highlightedAnnotationId={highlightedAnnotationId}
                      readOnly={true}
                      className="min-h-[500px]"
                      viewState={sharedViewState}
                      onViewStateChange={setSharedViewState}
                    />
                  </CardContent>
                </Card>
              </div>
            ) : (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                {/* PDF Viewer or Image viewer */}
                {isPDF && pdfUrl ? (
                  <PDFViewer
                    url={pdfUrl}
                    annotations={annotations}
                    highlightedAnnotationId={highlightedAnnotationId}
                    onAnnotate={async (data) => {
                      // Block annotations on locked pages
                      if (isLocked && !isAdmin) {
                        toast.error('Cette page est verrouillée. Annotations désactivées.');
                        return;
                      }

                      // Store annotation data and open dialog for all types (including ink/drawings)
                      setAnnotationData(data);
                      setAnnotationType(data.type === 'highlight' ? 'highlight' : data.type === 'ink' ? 'comment' : 'comment');
                      if (data.selectedText) {
                        setAnnotationContent(data.selectedText);
                      } else {
                        setAnnotationContent('');
                      }
                      setShowAnnotationDialog(true);
                    }}
                    onAnnotationClick={(annotation) => {
                      // Highlight the clicked annotation in the list
                      setHighlightedAnnotationId(annotation.id);
                      // Auto-clear after 2 seconds
                      setTimeout(() => setHighlightedAnnotationId(null), 2000);
                    }}
                    className="min-h-[600px]"
                  />
                ) : (
                  <>
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
                      {annotations.map((annotation, index) => {
                        const pos = typeof annotation.position === 'string'
                          ? JSON.parse(annotation.position)
                          : annotation.position;
                        if (!pos) return null;

                        // Global index: number ALL annotations in order (1, 2, 3...)
                        const globalIndex = index + 1;
                        const isHighlighted = highlightedAnnotationId === annotation.id;

                        // Determine color based on type
                        const getBgColor = () => {
                          if (annotation.resolved) return 'bg-green-500';
                          switch (annotation.type) {
                            case 'highlight': return 'bg-yellow-500';
                            case 'ink': return 'bg-purple-500';
                            default: return 'bg-red-500';
                          }
                        };

                        return (
                          <div
                            key={annotation.id}
                            className={cn(
                              'absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer transition-all shadow-lg border-2 border-white z-50 text-white',
                              getBgColor(),
                              isHighlighted ? 'scale-150 ring-4 ring-blue-500 animate-bounce' : 'hover:scale-125'
                            )}
                            style={{
                              left: `${pos.x}%`,
                              top: `${pos.y}%`,
                            }}
                            title={annotation.content}
                            onClick={(e) => {
                              e.stopPropagation();
                              setHighlightedAnnotationId(annotation.id);
                              setTimeout(() => setHighlightedAnnotationId(null), 2000);
                            }}
                          >
                            {annotation.resolved ? '✓' : globalIndex}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-muted-foreground p-2 text-center">
                      {isLocked && !isAdmin ? (
                        <span className="flex items-center justify-center gap-1 text-green-600">
                          <Lock className="h-3 w-3" />
                          Page verrouillée - Annotations désactivées
                        </span>
                      ) : (
                        'Cliquez sur l\'image pour ajouter une annotation'
                      )}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            )}

            {/* Navigation between project pages */}
            <Card className="bg-muted/50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => goToPage(currentIndex - 1)}
                    disabled={currentIndex <= 0}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Page précédente
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Page {page.page_number} sur {allPages.length}
                    </span>
                    <Select
                      value={pageIdNum.toString()}
                      onValueChange={(value) => {
                        const idx = allPages.findIndex((p) => p.id === parseInt(value));
                        if (idx >= 0) goToPage(idx);
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allPages.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            Page {p.page_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => goToPage(currentIndex + 1)}
                    disabled={currentIndex >= allPages.length - 1}
                  >
                    Page suivante
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* File actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={isUploading || (isLocked && !isAdmin)}
                asChild={!(isLocked && !isAdmin)}
              >
                {isLocked && !isAdmin ? (
                  <span className="flex items-center">
                    <Lock className="mr-2 h-4 w-4" />
                    Upload verrouillé
                  </span>
                ) : (
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
                )}
              </Button>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="sanitize-page-filename"
                  checked={sanitizeFilename}
                  onCheckedChange={(checked) => setSanitizeFilename(checked === true)}
                />
                <Label htmlFor="sanitize-page-filename" className="text-xs cursor-pointer">
                  Simplifier noms
                </Label>
              </div>
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
              {/* XFDF Export/Import for Acrobat compatibility */}
              {annotations.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const token = localStorage.getItem('accessToken');
                    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7801/api'}/annotations/page/${pageIdNum}/export-xfdf`;
                    // Download via fetch with auth
                    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                      .then(res => res.text())
                      .then(xfdf => {
                        const blob = new Blob([xfdf], { type: 'application/vnd.adobe.xfdf' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `annotations_page_${page.page_number}.xfdf`;
                        a.click();
                      })
                      .catch(() => toast.error('Erreur export XFDF'));
                  }}
                  title="Exporter pour Acrobat"
                >
                  <FileText className="mr-1 h-3 w-3" />
                  Export XFDF
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.xfdf';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    try {
                      const xfdf = await file.text();
                      await annotationsApi.importXfdf(pageIdNum, xfdf);
                      toast.success('Annotations importées');
                      fetchPageData();
                    } catch {
                      toast.error('Erreur import XFDF');
                    }
                  };
                  input.click();
                }}
                title="Importer depuis Acrobat"
              >
                <Upload className="mr-1 h-3 w-3" />
                Import XFDF
              </Button>
              {/* Download PDF with embedded annotations */}
              {currentFile && isPDF && annotations.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    const token = localStorage.getItem('accessToken');
                    const url = filesApi.getAnnotatedDownloadUrl(currentFile.id);
                    // Download with auth
                    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                      .then(res => {
                        if (!res.ok) throw new Error('Erreur');
                        return res.blob();
                      })
                      .then(blob => {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        const baseName = currentFile.original_filename?.replace(/\.pdf$/i, '') || 'page';
                        a.download = `${baseName}_annote.pdf`;
                        a.click();
                        toast.success('PDF annoté téléchargé');
                      })
                      .catch(() => toast.error('Erreur téléchargement'));
                  }}
                  title="PDF avec annotations incrustées"
                >
                  <Download className="mr-1 h-3 w-3" />
                  PDF Annoté
                </Button>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status card */}
            <Card className={isLocked ? 'border-green-500' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Statut
                  {isLocked && <Lock className="h-4 w-4 text-green-600" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge className={PAGE_STATUS_COLORS[page.status]}>
                  {PAGE_STATUS_LABELS[page.status]}
                </Badge>

                {isLocked && (
                  <div className="flex items-start gap-2 p-2 bg-green-50 border border-green-200 rounded-md">
                    <ShieldAlert className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-green-700">
                      Cette page est verrouillée. Les annotations et uploads sont désactivés.
                      {isAdmin && ' En tant qu\'admin, vous pouvez changer le statut pour débloquer.'}
                    </p>
                  </div>
                )}

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
                        {allowedTransitions.map((transition) => {
                          // Handle both object format {status, label} and string format
                          const statusKey = typeof transition === 'string' ? transition : transition.status;
                          const statusLabel = typeof transition === 'string'
                            ? (PAGE_STATUS_LABELS[transition as PageStatus] || transition)
                            : transition.label;
                          return (
                            <SelectItem key={statusKey} value={statusKey}>
                              {statusLabel}
                            </SelectItem>
                          );
                        })}
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
                  annotations.map((annotation, index) => {
                    // Global index: number ALL annotations in order (1, 2, 3...)
                    const globalIndex = index + 1;
                    const isHighlighted = highlightedAnnotationId === annotation.id;

                    // Determine badge color based on type
                    const getBadgeClass = () => {
                      if (annotation.resolved) return 'bg-green-500 text-white';
                      switch (annotation.type) {
                        case 'highlight': return 'bg-yellow-500 text-white';
                        case 'ink': return 'bg-purple-500 text-white';
                        default: return 'bg-red-500 text-white';
                      }
                    };

                    // Type label
                    const getTypeLabel = () => {
                      switch (annotation.type) {
                        case 'highlight': return 'Surlignage';
                        case 'ink': return 'Dessin';
                        case 'comment': return 'Commentaire';
                        default: return annotation.type;
                      }
                    };

                    return (
                    <Card
                      key={annotation.id}
                      className={cn(
                        'cursor-pointer transition-all duration-300',
                        annotation.resolved ? 'opacity-60' : '',
                        isHighlighted && 'ring-2 ring-blue-500 bg-blue-50 animate-pulse'
                      )}
                      onClick={() => {
                        // Highlight the corresponding marker on the PDF
                        setHighlightedAnnotationId(annotation.id);
                        // Auto-clear after 2 seconds
                        setTimeout(() => setHighlightedAnnotationId(null), 2000);
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                              getBadgeClass()
                            )}>
                              {annotation.resolved ? '✓' : globalIndex}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResolveAnnotation(annotation.id);
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAnnotation(annotation.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm">{annotation.content}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="outline" className={cn(
                            'text-xs',
                            annotation.type === 'highlight' && 'bg-yellow-100',
                            annotation.type === 'ink' && 'bg-purple-100'
                          )}>
                            {getTypeLabel()}
                          </Badge>
                          {annotation.created_in_version && (
                            <Badge variant="secondary" className="text-xs">
                              v{annotation.created_in_version}
                            </Badge>
                          )}
                          {annotation.resolved && (
                            <Badge variant="outline" className="text-xs text-green-600">
                              Résolu
                              {annotation.resolved_in_version_number && ` (v${annotation.resolved_in_version_number})`}
                            </Badge>
                          )}
                          {/* Reply button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs ml-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReplies(annotation.id);
                            }}
                          >
                            <MessageCircle className="h-3 w-3 mr-1" />
                            {annotation.reply_count || 0}
                            {expandedReplies.has(annotation.id) ? (
                              <ChevronUp className="h-3 w-3 ml-1" />
                            ) : (
                              <ChevronDown className="h-3 w-3 ml-1" />
                            )}
                          </Button>
                        </div>

                        {/* Replies section */}
                        {expandedReplies.has(annotation.id) && (
                          <div className="mt-3 pt-3 border-t space-y-2" onClick={(e) => e.stopPropagation()}>
                            {loadingReplies.has(annotation.id) ? (
                              <div className="flex items-center justify-center py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : (
                              <>
                                {/* Existing replies */}
                                {(repliesCache[annotation.id] || []).map((reply) => (
                                  <div key={reply.id} className="bg-muted/50 rounded p-2 text-sm">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <span className="font-medium">{reply.author_name}</span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                          {new Date(reply.created_at).toLocaleDateString('fr-FR')}
                                        </span>
                                      </div>
                                      {(user?.role === 'admin' || user?.role === 'editeur' || user?.id === reply.created_by) && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 text-destructive"
                                          onClick={() => handleDeleteReply(annotation.id, reply.id)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                    <p className="mt-1">{reply.content}</p>
                                  </div>
                                ))}

                                {/* Reply input */}
                                <div className="flex gap-2">
                                  <MentionInput
                                    placeholder="Répondre... (@ pour mentionner)"
                                    value={replyInputs[annotation.id] || ''}
                                    onChange={(value) => setReplyInputs(prev => ({ ...prev, [annotation.id]: value }))}
                                    users={mentionUsers}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey && !document.querySelector('.mention-suggestions')) {
                                        e.preventDefault();
                                        handleSubmitReply(annotation.id);
                                      }
                                    }}
                                    className="h-8 text-sm"
                                  />
                                  <Button
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={!replyInputs[annotation.id]?.trim() || submittingReply === annotation.id}
                                    onClick={() => handleSubmitReply(annotation.id)}
                                  >
                                    {submittingReply === annotation.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Send className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                  })
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isLocked && !isAdmin}
                  onClick={() => {
                    if (!page) return;
                    if (isLocked && !isAdmin) {
                      toast.error('Cette page est verrouillée. Annotations désactivées.');
                      return;
                    }
                    setAnnotationData({ x: 50, y: 50, pageNumber: page.page_number, type: 'click' });
                    setAnnotationType('comment');
                    setShowAnnotationDialog(true);
                  }}
                >
                  {isLocked && !isAdmin ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Page verrouillée
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter une annotation
                    </>
                  )}
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
        </div>
      </main>

      {/* Annotation Dialog */}
      <Dialog open={showAnnotationDialog} onOpenChange={setShowAnnotationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {annotationData?.type === 'highlight' ? 'Ajouter un surlignage' :
               annotationData?.type === 'ink' ? 'Ajouter un dessin' : 'Ajouter un commentaire'}
            </DialogTitle>
            <DialogDescription>
              {annotationData?.type === 'highlight' && annotationData.selectedText
                ? `Texte sélectionné : "${annotationData.selectedText.substring(0, 100)}${annotationData.selectedText.length > 100 ? '...' : ''}"`
                : annotationData?.type === 'ink'
                ? 'Ajoutez une description à votre dessin.'
                : 'Ajoutez un commentaire sur cette page.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                {annotationData?.type === 'highlight' ? 'Note (optionnel)' :
                 annotationData?.type === 'ink' ? 'Description du dessin' : 'Commentaire'}
              </Label>
              <MentionTextarea
                placeholder={
                  annotationData?.type === 'highlight' ? 'Ajouter une note au surlignage... (@ pour mentionner)' :
                  annotationData?.type === 'ink' ? 'Décrivez ce dessin... (@ pour mentionner)' : 'Votre commentaire... (@ pour mentionner)'
                }
                value={annotationContent}
                onChange={setAnnotationContent}
                users={mentionUsers}
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
              disabled={(annotationData?.type !== 'ink' && !annotationContent.trim()) || isSubmittingAnnotation}
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
