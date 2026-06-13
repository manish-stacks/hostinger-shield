'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Loader2, Filter } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { notificationsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const TYPE_BADGE: Record<string, string> = {
  threat:     'badge-danger',
  ssl:        'badge-warning',
  dns:        'badge-warning',
  down:       'badge-danger',
  backup:     'badge-info',
  restore:    'badge-info',
  info:       'badge-neutral',
  warning:    'badge-warning',
  hack:       'badge-danger',
  ssl_expiry: 'badge-warning',
  site_down:  'badge-danger',
  dns_change: 'badge-warning',
};

const LIMIT = 20;

export default function AlertsPage() {
  const qc = useQueryClient();
  const [page, setPage]           = useState(1);
  const [readFilter, setReadFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page, readFilter, typeFilter],
    queryFn: () =>
      notificationsApi.list({
        page, limit: LIMIT,
        isRead: readFilter === '' ? undefined : readFilter === 'read' ? 'true' : 'false',
        type: typeFilter || undefined,
      }).then((r) => r.data),
    keepPreviousData: true,
  });

  const notifications = data?.data       || [];
  const pagination    = data?.pagination || { total: 0 };
  const hasUnread     = notifications.some((n: Record<string, unknown>) => !n.isRead);

  const readAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      toast.success('All marked as read');
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
    onError: () => toast.error('Failed'),
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const resetPage = () => setPage(1);

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Alerts</h1>
        {hasUnread && (
          <button
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
            className="btn-secondary"
          >
            {readAllMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
            Mark All Read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#8b949e]" />
          <select value={readFilter} onChange={(e) => { setReadFilter(e.target.value); resetPage(); }} className="input w-32 py-1.5 text-sm">
            <option value="">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); resetPage(); }} className="input w-36 py-1.5 text-sm">
          <option value="">All Types</option>
          <option value="threat">Threat</option>
          <option value="ssl">SSL</option>
          <option value="dns">DNS</option>
          <option value="down">Site Down</option>
          <option value="backup">Backup</option>
          <option value="restore">Restore</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
        </select>
        {(readFilter || typeFilter) && (
          <button onClick={() => { setReadFilter(''); setTypeFilter(''); resetPage(); }} className="text-xs text-[#8b949e] hover:text-red-400">
            Clear filters
          </button>
        )}
        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-[#8b949e]">{pagination.total} notifications</span>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-10"><Loader2 size={20} className="animate-spin mx-auto text-[#8b949e]" /></div>
        ) : notifications.length === 0 ? (
          <div className="card text-center py-10 text-[#8b949e]">
            <Bell size={32} className="mx-auto mb-2 opacity-30" />
            {readFilter || typeFilter ? 'No notifications match filters' : 'No notifications'}
          </div>
        ) : notifications.map((n: Record<string, unknown>) => {
          const site    = n.website as { domain?: string; hostingerAccount?: { accountName?: string } } | null;
          const account = site?.hostingerAccount?.accountName;

          return (
            <div
              key={n._id as string}
              onClick={() => !n.isRead && readMutation.mutate(n._id as string)}
              className={`card-sm flex items-start gap-3 transition-all ${
                n.isRead ? 'opacity-60' : 'cursor-pointer hover:bg-[#1c2128]'
              }`}
            >
              {/* Unread dot */}
              <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${n.isRead ? 'bg-[#3d4451]' : 'bg-[#3b5bdb]'}`} />

              <div className="flex-1 min-w-0">
                {/* Top row — type badge + severity + time + NEW */}
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className={TYPE_BADGE[n.type as string] || 'badge-neutral'}>
                    {(n.type as string)?.replace(/_/g, ' ')}
                  </span>
                  {(n.severity as string) && (
                    <span className={`badge ${
                      n.severity === 'critical' || n.severity === 'high' ? 'badge-danger'
                      : n.severity === 'medium' ? 'badge-warning' : 'badge-info'
                    }`}>
                      {n.severity as string}
                    </span>
                  )}
                  <span className="text-[10px] text-[#8b949e]">
                    {n.createdAt ? formatDistanceToNow(new Date(n.createdAt as string), { addSuffix: true }) : ''}
                  </span>
                  {!n.isRead && <span className="ml-auto text-[10px] text-[#3b5bdb] font-medium">NEW</span>}
                </div>

                {/* Title + message */}
                <p className="text-sm font-medium text-[#e6edf3]">{n.title as string}</p>
                <p className="text-xs text-[#8b949e] mt-0.5">{n.message as string}</p>

                {/* Domain + Account — same row */}
                {site?.domain && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs text-[#8b949e]">🌐 {site.domain}</span>
                    {account && (
                      <span className="px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb] text-[10px] font-medium">
                        {account}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Pagination page={page} total={pagination.total} limit={LIMIT} onChange={setPage} />
    </DashboardLayout>
  );
}