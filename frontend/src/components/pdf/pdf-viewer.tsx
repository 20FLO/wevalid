'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { Annotation } from '@/types';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  annotations?: Annotation[];
  onAnnotationClick?: (annotation: Annotation) => void;
  onPageClick?: (position: { x: number; y: number; pageNumber: number }) => void;
  className?: string;
}

export function PDFViewer({
  url,
  annotations = [],
  onAnnotationClick,
  onPageClick,
  className,
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch PDF with authentication token
  useEffect(() => {
    const fetchPDF = async () => {
      setIsFetching(true);
      setError(null);
      try {
        // Get token from localStorage
        const token = localStorage.getItem('accessToken');

        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        setPdfData(arrayBuffer);
      } catch (err) {
        console.error('PDF fetch error:', err);
        setError('Impossible de charger le PDF');
      } finally {
        setIsFetching(false);
      }
    };

    if (url) {
      fetchPDF();
    }
  }, [url]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error:', err);
    setError('Impossible de charger le PDF');
    setIsLoading(false);
  }, []);

  const handlePageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onPageClick || !containerRef.current) return;

      const pageElement = e.currentTarget.querySelector('.react-pdf__Page__canvas');
      if (!pageElement) return;

      const rect = pageElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      onPageClick({ x, y, pageNumber });
    },
    [onPageClick, pageNumber]
  );

  const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages));
  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const rotate = () => setRotation((prev) => (prev + 90) % 360);

  // Filter annotations for current page
  const pageAnnotations = annotations.filter(
    (a) => !a.position?.page_number || a.position.page_number === pageNumber
  );

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 p-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={goToPrevPage} disabled={pageNumber <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[80px] text-center text-sm">
            {pageNumber} / {numPages || '?'}
          </span>
          <Button variant="outline" size="icon" onClick={goToNextPage} disabled={pageNumber >= numPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={zoomOut} disabled={scale <= 0.5}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[50px] text-center text-sm">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="icon" onClick={zoomIn} disabled={scale >= 3}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={rotate}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Container */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto bg-muted/30"
        style={{ minHeight: '500px' }}
      >
        {(isFetching || isLoading) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Chargement du PDF...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-destructive">{error}</p>
          </div>
        )}

        {pdfData && !error && (
          <div
            className="flex justify-center p-4 cursor-crosshair"
            onClick={handlePageClick}
          >
            <div className="relative">
              <Document
                file={{ data: pdfData }}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-lg"
                />
              </Document>

              {/* Custom Annotation Markers */}
              {!isLoading && pageAnnotations.map((annotation) =>
                annotation.position ? (
                  <div
                    key={annotation.id}
                    className={cn(
                      'absolute w-6 h-6 -ml-3 -mt-3 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer hover:scale-110 transition-transform z-10',
                      annotation.resolved
                        ? 'bg-green-500 text-white'
                        : 'bg-primary text-primary-foreground'
                    )}
                    style={{
                      left: `${annotation.position.x}%`,
                      top: `${annotation.position.y}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnnotationClick?.(annotation);
                    }}
                    title={annotation.content}
                  >
                    {annotation.resolved ? '✓' : annotations.indexOf(annotation) + 1}
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="border-t bg-muted/50 p-2 text-center text-xs text-muted-foreground">
        Cliquez sur le document pour ajouter une annotation
      </div>
    </div>
  );
}
