'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Users,
  FolderOpen,
} from 'lucide-react';
import type { ProjectDashboard as DashboardData, PageStatus } from '@/types';
import { PAGE_STATUS_LABELS, PAGE_STATUS_COLORS } from '@/types';

interface ProjectDashboardProps {
  data: DashboardData | null;
  isLoading?: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectDashboard({ data, isLoading }: ProjectDashboardProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[120px]" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Impossible de charger les statistiques
      </div>
    );
  }

  // Calculate status distribution for visualization
  const statusEntries = Object.entries(data.pages_by_status).sort((a, b) => b[1] - a[1]);
  const totalPagesCreated = statusEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pages créées</p>
                <p className="text-2xl font-bold">
                  {data.pages_created} / {data.total_pages}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">En maquette</p>
                <p className="text-2xl font-bold">
                  {data.progress.maquette_count}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    ({data.progress.maquette_percent}%)
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Validées (BAT)</p>
                <p className="text-2xl font-bold">
                  {data.progress.validation_count}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    ({data.progress.validation_percent}%)
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-full">
                <FolderOpen className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fichiers projet</p>
                <p className="text-2xl font-bold">{data.files_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progression maquettes</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={data.progress.maquette_percent} className="h-3" />
            <p className="text-sm text-muted-foreground mt-2">
              {data.progress.maquette_count} pages en cours ou terminées sur {data.total_pages}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progression validation</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={data.progress.validation_percent} className="h-3 bg-green-100" />
            <p className="text-sm text-muted-foreground mt-2">
              {data.progress.validation_count} pages validées (BAT) sur {data.total_pages}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par statut</CardTitle>
          </CardHeader>
          <CardContent>
            {statusEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune page créée</p>
            ) : (
              <div className="space-y-3">
                {statusEntries.map(([status, count]) => {
                  const percent = totalPagesCreated > 0
                    ? Math.round((count / totalPagesCreated) * 100)
                    : 0;
                  const colorClass = PAGE_STATUS_COLORS[status as PageStatus] || 'bg-gray-100 text-gray-800';

                  return (
                    <div key={status} className="flex items-center gap-3">
                      <Badge className={colorClass} variant="outline">
                        {PAGE_STATUS_LABELS[status as PageStatus] || status}
                      </Badge>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">
                        {count} ({percent}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activité récente</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent_activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune activité récente</p>
            ) : (
              <div className="space-y-3 max-h-[250px] overflow-y-auto">
                {data.recent_activity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 text-sm border-b pb-3 last:border-0"
                  >
                    <div className="p-1.5 bg-muted rounded-full mt-0.5">
                      <ArrowRight className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        Page {activity.page_number}
                      </p>
                      <p className="text-muted-foreground">
                        {activity.from_status_label} → {activity.to_status_label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {activity.changed_by_name} • {formatDate(activity.changed_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
