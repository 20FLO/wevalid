'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Custom styles for text selection
const textLayerStyles = `
  .react-pdf__Page__textContent {
    user-select: text !important;
    cursor: text !important;
  }
  .react-pdf__Page__textContent span {
    user-select: text !important;
  }
  .react-pdf__Page__textContent::selection,
  .react-pdf__Page__textContent span::selection {
    background: rgba(0, 100, 255, 0.3) !important;
  }
`;
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, RotateCw, Loader2, Pencil, MousePointer, Eraser } from 'lucide-react';
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
  type: 'click' | 'highlight' | 'ink';
  inkPath?: string; // SVG path for ink annotations
}

interface PDFViewerProps {
  url: string;
  annotations?: Annotation[];
  onAnnotationClick?: (annotation: Annotation) => void;
  onAnnotate?: (data: AnnotationData) => void;
  className?: string;
  highlightedAnnotationId?: number | null;
  readOnly?: boolean; // Disable annotations
}

type DrawingMode = 'select' | 'draw' | 'erase';

interface Point {
  x: number;
  y: number;
}

const DRAW_COLORS = [
  '#FF0000', // Red
  '#0000FF', // Blue
  '#00AA00', // Green
  '#FF6600', // Orange
  '#9900FF', // Purple
  '#000000', // Black
];

export function PDFViewer({
  url,
  annotations = [],
  onAnnotationClick,
  onAnnotate,
  className,
  highlightedAnnotationId,
  readOnly = false,
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawing state
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('select');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Fetch PDF with authentication token
  useEffect(() => {
    // Reset state when URL changes to avoid "Buffer already detached" error
    setPdfData(null);
    setIsLoading(true);

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
        // Create a copy of the ArrayBuffer to prevent "Buffer already detached" errors
        const copy = arrayBuffer.slice(0);
        setPdfData(copy);
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

  // Update canvas size when PDF page loads
  useEffect(() => {
    const updateCanvasSize = () => {
      const pageElement = pageContainerRef.current?.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement;
      if (pageElement) {
        setCanvasSize({
          width: pageElement.width,
          height: pageElement.height,
        });
      }
    };

    // Small delay to ensure PDF is rendered
    const timer = setTimeout(updateCanvasSize, 100);
    return () => clearTimeout(timer);
  }, [isLoading, scale, rotation, pageNumber]);

  // Draw existing ink annotations on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw ink annotations for current page
    const inkAnnotations = annotations.filter(a => {
      const pos = parsePosition(a.position);
      if (!pos || a.type !== 'ink') return false;
      return !pos.page_number || pos.page_number === pageNumber;
    });

    inkAnnotations.forEach(annotation => {
      const pos = parsePosition(annotation.position);
      if (!pos?.ink_path) return;

      ctx.strokeStyle = annotation.color || '#FF0000';
      ctx.lineWidth = 2 * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const path = new Path2D(pos.ink_path);
      ctx.stroke(path);
    });
  }, [annotations, pageNumber, canvasSize, scale]);

  // Track if mouse was dragged (for text selection in select mode)
  const isDraggingRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  const getCanvasCoordinates = (e: React.MouseEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;

    if (drawingMode === 'draw' && !readOnly) {
      const coords = getCanvasCoordinates(e);
      if (coords) {
        setIsDrawing(true);
        setCurrentPath([coords]);
      }
    }
  }, [drawingMode, readOnly]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;

    if (isDrawing && drawingMode === 'draw') {
      const coords = getCanvasCoordinates(e);
      if (coords) {
        setCurrentPath(prev => [...prev, coords]);

        // Draw current stroke
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && currentPath.length > 0) {
          const lastPoint = currentPath[currentPath.length - 1];
          ctx.strokeStyle = drawColor;
          ctx.lineWidth = 2 * scale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(coords.x, coords.y);
          ctx.stroke();
        }
      }
    }
  }, [isDrawing, drawingMode, currentPath, drawColor, scale]);

  const handleMouseUp = useCallback(() => {
    if (isDrawing && drawingMode === 'draw' && currentPath.length > 1 && onAnnotate) {
      // Convert path to SVG path string (relative to canvas)
      const pathString = currentPath.reduce((acc, point, i) => {
        if (i === 0) return `M ${point.x} ${point.y}`;
        return `${acc} L ${point.x} ${point.y}`;
      }, '');

      // Calculate bounding box
      const xs = currentPath.map(p => p.x);
      const ys = currentPath.map(p => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      // Convert to percentages
      const canvas = canvasRef.current;
      if (canvas) {
        const x = (minX / canvas.width) * 100;
        const y = (minY / canvas.height) * 100;
        const width = ((maxX - minX) / canvas.width) * 100;
        const height = ((maxY - minY) / canvas.height) * 100;

        onAnnotate({
          x,
          y,
          width,
          height,
          pageNumber,
          type: 'ink',
          inkPath: pathString,
        });
      }
    }

    setIsDrawing(false);
    setCurrentPath([]);
  }, [isDrawing, drawingMode, currentPath, pageNumber, onAnnotate]);

  // Handle click for comment annotation (select mode only)
  const handlePageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onAnnotate || readOnly || drawingMode !== 'select') return;

      // If we were dragging (selecting text), don't create click annotation
      if (isDraggingRef.current) {
        const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
        const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
        if (dx > 5 || dy > 5) {
          return;
        }
      }

      // Check if there's a text selection
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
    [onAnnotate, pageNumber, readOnly, drawingMode]
  );

  // Handle text selection for highlight annotation (select mode only)
  const handleTextSelectionEnd = useCallback(() => {
    if (!onAnnotate || readOnly || drawingMode !== 'select') return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || !selection.toString().trim()) return;

      const selectedText = selection.toString().trim();
      if (selectedText.length < 1) return;

      let range;
      try {
        range = selection.getRangeAt(0);
      } catch {
        return;
      }

      const rects = range.getClientRects();
      if (rects.length === 0) return;

      const pageElement = pageContainerRef.current?.querySelector('.react-pdf__Page__canvas');
      if (!pageElement) return;

      const pageRect = pageElement.getBoundingClientRect();

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const rect of rects) {
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
      }

      const x = ((minX - pageRect.left) / pageRect.width) * 100;
      const y = ((minY - pageRect.top) / pageRect.height) * 100;
      const width = ((maxX - minX) / pageRect.width) * 100;
      const height = ((maxY - minY) / pageRect.height) * 100;

      if (width > 0 && height > 0) {
        onAnnotate({
          x,
          y,
          width,
          height,
          pageNumber,
          selectedText,
          type: 'highlight',
        });
      }

      setTimeout(() => selection.removeAllRanges(), 100);
    }, 10);
  }, [onAnnotate, pageNumber, readOnly, drawingMode]);

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const rotate = () => setRotation((prev) => (prev + 90) % 360);

  // Parse position helper
  const parsePosition = (pos: AnnotationPosition | string | undefined): AnnotationPosition | null => {
    if (!pos) return null;
    return typeof pos === 'string' ? JSON.parse(pos) : pos;
  };

  // Filter annotations for current page (excluding ink which is drawn on canvas)
  const pageAnnotations = annotations.filter((a) => {
    const pos = parsePosition(a.position);
    if (!pos || a.type === 'ink') return false;
    return !pos.page_number || pos.page_number === pageNumber;
  });

  // Memoize file object to prevent unnecessary reloads
  const file = useMemo(() => pdfData ? { data: pdfData } : null, [pdfData]);

  // Inject custom styles for text selection
  useEffect(() => {
    const styleId = 'pdf-text-layer-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = textLayerStyles;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 p-2">
        {/* Zoom controls */}
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

        {/* Drawing tools */}
        {!readOnly && (
          <div className="flex items-center gap-1">
            <Button
              variant={drawingMode === 'select' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setDrawingMode('select')}
              title="Mode sélection"
            >
              <MousePointer className="h-4 w-4" />
            </Button>
            <Button
              variant={drawingMode === 'draw' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setDrawingMode('draw')}
              title="Mode dessin"
            >
              <Pencil className="h-4 w-4" />
            </Button>

            {/* Color picker */}
            {drawingMode === 'draw' && (
              <div className="flex items-center gap-1 ml-2">
                {DRAW_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-transform',
                      drawColor === color ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setDrawColor(color)}
                    title={color}
                  />
                ))}
              </div>
            )}
          </div>
        )}
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
            className={cn(
              'flex justify-center p-4',
              drawingMode === 'select' ? 'cursor-crosshair' : 'cursor-crosshair'
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onClick={handlePageClick}
            onMouseUp={(e) => {
              handleMouseUp();
              handleTextSelectionEnd();
            }}
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
                  renderTextLayer={drawingMode === 'select'}
                  renderAnnotationLayer={true}
                  className="shadow-lg"
                />
              </Document>

              {/* Drawing canvas overlay */}
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                className={cn(
                  'absolute top-0 left-0',
                  drawingMode === 'draw' ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
                )}
                style={{
                  width: canvasSize.width / (window.devicePixelRatio || 1),
                  height: canvasSize.height / (window.devicePixelRatio || 1),
                }}
              />

              {/* Custom Annotation Markers - positioned over the PDF page */}
              <div className="absolute inset-0 pointer-events-none">
                {!isLoading && pageAnnotations.map((annotation) => {
                  const pos = parsePosition(annotation.position);
                  if (!pos) return null;

                  // Global index: number ALL annotations in order (1, 2, 3...)
                  const globalIndex = annotations.findIndex(a => a.id === annotation.id) + 1;

                  const isHighlight = annotation.type === 'highlight' &&
                    pos.width !== undefined && pos.width > 0 &&
                    pos.height !== undefined && pos.height > 0;

                  const isHighlighted = highlightedAnnotationId === annotation.id;

                  if (isHighlight) {
                    return (
                      <div
                        key={annotation.id}
                        className="absolute"
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          width: `${pos.width}%`,
                          height: `${pos.height}%`,
                          zIndex: isHighlighted ? 150 : 50,
                        }}
                      >
                        {/* Highlight overlay */}
                        <div
                          className={cn(
                            'w-full h-full pointer-events-auto cursor-pointer transition-all duration-300',
                            annotation.resolved ? 'opacity-30' : 'opacity-60 hover:opacity-80',
                            isHighlighted && 'animate-pulse ring-4 ring-blue-500 ring-offset-2'
                          )}
                          style={{
                            backgroundColor: annotation.color || '#FFFF00',
                            mixBlendMode: 'multiply',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAnnotationClick?.(annotation);
                          }}
                          title={annotation.content}
                        />
                        {/* Number badge on highlight */}
                        <div
                          className={cn(
                            'absolute -top-3 -left-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-all shadow-lg border-2 pointer-events-auto',
                            annotation.resolved
                              ? 'bg-green-500 text-white border-white'
                              : 'bg-yellow-500 text-white border-white',
                            isHighlighted && 'scale-125'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAnnotationClick?.(annotation);
                          }}
                        >
                          {annotation.resolved ? '✓' : globalIndex}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={annotation.id}
                      data-annotation-id={annotation.id}
                      className={cn(
                        'absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer transition-all shadow-lg border-2 pointer-events-auto',
                        annotation.resolved
                          ? 'bg-green-500 text-white border-white'
                          : annotation.type === 'ink'
                            ? 'bg-purple-500 text-white border-white'
                            : 'bg-red-500 text-white border-white',
                        isHighlighted
                          ? 'scale-150 ring-4 ring-blue-500 ring-offset-2 animate-bounce z-[200]'
                          : 'hover:scale-125'
                      )}
                      style={{
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        zIndex: isHighlighted ? 200 : 100,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnnotationClick?.(annotation);
                      }}
                      title={annotation.content}
                    >
                      {annotation.resolved ? '✓' : globalIndex}
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
        {drawingMode === 'select'
          ? 'Cliquez pour ajouter un commentaire ou sélectionnez du texte pour surligner'
          : 'Dessinez sur le PDF - le trait sera enregistré comme annotation'}
      </div>
    </div>
  );
}
