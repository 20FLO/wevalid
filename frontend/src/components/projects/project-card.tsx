'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Project } from '@/types';
import { FileText, Users, ArrowRight } from 'lucide-react';

interface ProjectCardProps {
  project: Project;
}

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  in_progress: 'En cours',
  bat: 'BAT',
  completed: 'Terminé',
  archived: 'Archivé',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  bat: 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  archived: 'bg-slate-100 text-slate-800',
};

export function ProjectCard({ project }: ProjectCardProps) {
  const totalPages = parseInt(project.total_pages_count || String(project.total_pages)) || 0;
  const validatedPages = parseInt(project.validated_pages_count || '0');
  const progress = totalPages > 0 ? Math.round((validatedPages / totalPages) * 100) : 0;

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg leading-tight">{project.title}</CardTitle>
            {project.isbn && (
              <p className="text-sm text-muted-foreground">ISBN: {project.isbn}</p>
            )}
          </div>
          <Badge className={statusColors[project.status]}>
            {statusLabels[project.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-medium">{validatedPages} / {totalPages} pages</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              <span>{totalPages} pages</span>
            </div>
            {project.members && (
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{project.members.length}</span>
              </div>
            )}
          </div>

          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${project.id}`}>
              Ouvrir
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
