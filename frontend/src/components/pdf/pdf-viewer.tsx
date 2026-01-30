'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react';
import type { Annotation, AnnotationPosition } from '@/types';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface AnnotationData {
  x: number;
  y: number;
  width?: number;
  height?: number;
  pageNumber: number;
  selectedText?: string;
  type: 'click' | 'highlight';
}

interface PDFViewerProps {
  url: string;
  annotations?: Annotation[];
  onAnnotationClick?: (annotation: Annotation) => void;
  onAnnotate?: (data: AnnotationData) => void;
  className?: string;
}

export function PDFViewer({
  url,
  annotations = [],
  onAnnotationClick,
  onAnnotate,
  className,
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
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

  // Handle click for comment annotation (auto-detect: no text selected = click)
  const handlePageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onAnnotate) return;

      // Check if there's a text selection - if so, don't create click annotation
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        return;
      }

      const pageElement = pageContainerRef.current?.querySelector('.react-pdf__Page__canvas');
      if (!pageElement) return;

      const rect = pageElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      onAnnotate({ x, y, pageNumber, type: 'click' });
    },
    [onAnnotate, pageNumber]
  );

  // Handle text selection for highlight annotation (auto-detect: text selected = highlight)
  const handleMouseUp = useCallback(() => {
    if (!onAnnotate) return;

    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) return;

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();

    if (rects.length === 0) return;

    const pageElement = pageContainerRef.current?.querySelector('.react-pdf__Page__canvas');
    if (!pageElement) return;

    const pageRect = pageElement.getBoundingClientRect();

    // Get bounding box of all selection rects
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const rect of rects) {
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
      maxY = Math.max(maxY, rect.bottom);
    }

    // Convert to percentages relative to page
    const x = ((minX - pageRect.left) / pageRect.width) * 100;
    const y = ((minY - pageRect.top) / pageRect.height) * 100;
    const width = ((maxX - minX) / pageRect.width) * 100;
    const height = ((maxY - minY) / pageRect.height) * 100;

    onAnnotate({
      x,
      y,
      width,
      height,
      pageNumber,
      selectedText,
      type: 'highlight',
    });

    // Clear selection
    selection.removeAllRanges();
  }, [onAnnotate, pageNumber]);

  const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages));
  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const rotate = () => setRotation((prev) => (prev + 90) % 360);

  // Parse position helper
  const parsePosition = (pos: AnnotationPosition | string | undefined): AnnotationPosition | null => {
    if (!pos) return null;
    return typeof pos === 'string' ? JSON.parse(pos) : pos;
  };

  // Filter annotations for current page
  const pageAnnotations = annotations.filter((a) => {
    const pos = parsePosition(a.position);
    if (!pos) return false;
    return !pos.page_number || pos.page_number === pageNumber;
  });

  // Memoize file object to prevent unnecessary reloads
  const file = useMemo(() => pdfData ? { data: pdfData } : null, [pdfData]);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar - zoom and rotate only */}
      <div className="flex items-center justify-center gap-2 border-b bg-muted/50 p-2">
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

        {file && !error && (
          <div
            className="flex justify-center p-4 cursor-crosshair"
            onClick={handlePageClick}
            onMouseUp={handleMouseUp}
          >
            <div ref={pageContainerRef} className="relative inline-block">
              <Document
                file={file}
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

              {/* Custom Annotation Markers - positioned over the PDF page */}
              <div className="absolute inset-0 pointer-events-none">
                {!isLoading && pageAnnotations.map((annotation, index) => {
                  const pos = parsePosition(annotation.position);
                  if (!pos) return null;

                  // Check if it's a highlight with dimensions
                  const isHighlight = annotation.type === 'highlight' &&
                    pos.width !== undefined && pos.width > 0 &&
                    pos.height !== undefined && pos.height > 0;

                  // Highlight annotation (rectangle overlay)
                  if (isHighlight) {
                    return (
                      <div
                        key={annotation.id}
                        className={cn(
                          'absolute pointer-events-auto cursor-pointer',
                          annotation.resolved ? 'opacity-30' : 'opacity-60 hover:opacity-80'
                        )}
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          width: `${pos.width}%`,
                          height: `${pos.height}%`,
                          backgroundColor: annotation.color || '#FFFF00',
                          zIndex: 50,
                          mixBlendMode: 'multiply',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnnotationClick?.(annotation);
                        }}
                        title={annotation.content}
                      />
                    );
                  }

                  // Comment annotation (point marker)
                  return (
                    <div
                      key={annotation.id}
                      className={cn(
                        'absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer hover:scale-125 transition-transform shadow-lg border-2 border-white pointer-events-auto',
                        annotation.resolved
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                      )}
                      style={{
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        zIndex: 100,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnnotationClick?.(annotation);
                      }}
                      title={annotation.content}
                    >
                      {annotation.resolved ? '✓' : index + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="border-t bg-muted/50 p-2 text-center text-xs text-muted-foreground">
        Cliquez pour ajouter un commentaire ou sélectionnez du texte pour surligner
      </div>
    </div>
  );
}
