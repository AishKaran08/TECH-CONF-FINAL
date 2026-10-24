import type { Dashboard } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, SourceLine, SourceTag } from '../components/ui';
import { clsx, timeAgo } from '../lib/format';
import { syncAll } from '../lib/store';
import { openConnections } from '../panels/panelState';
import { PendingSource } from './GithubActivity';

export function RecentSubmissions({ d, index }: { d: Dashboard; index: number }) {
  const cf = d.sources.find((s) => s.source === 'codeforces');
  const items = d.submissions.slice(0, 12);
  const user = d.codeforces.user;

  return (
    <Card
      title="Recent submissions"
      icon="code"
      index={index}
      className="md:col-span-3 lg:col-span-3"
      actions={user?.rating != null && (
        <span className="text-xs text-zinc-400">
          Rating <span className="num text-zinc-100">{user.rating}</span>
        </span>
      )}
      footer={items.length > 0 && <SourceLine origins={[...new Set(items.map((s) => s.origin))]} syncedAt={cf?.lastSyncedAt ?? null} />}
    >
      {items.length === 0 && !user && d.settings.codeforcesHandle && d.mode === 'real' ? (
        <PendingSource name="Codeforces" who={d.settings.codeforcesHandle} error={cf?.state === 'error' ? cf.lastError : null} onRetry={() => void syncAll(['codeforces'])} />
      ) : items.length === 0 ? (
        <Empty icon="code" title="No submissions yet" action={<Button size="sm" icon="plug" onClick={() => openConnections('codeforces')}>Connect Codeforces</Button>}>
          Add your Codeforces handle to see accepted and failed submissions here as they happen.
        </Empty>
      ) : (
        <ul className="scrollbar-thin -mr-2 flex max-h-[22rem] flex-col gap-1 overflow-y-auto pr-2">
          {items.map((s, i) => (
            <li key={s.id} className="rise flex items-start gap-2.5 rounded-lg px-1 py-1.5" style={{ '--i': Math.min(i, 6) } as React.CSSProperties}>
              <Icon name={s.accepted ? 'checkCircle' : 'xCircle'} size={16} className={clsx('mt-0.5 shrink-0', s.accepted ? 'text-emerald-300' : 'text-red-300')} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {s.problemName}
                    </a>
                  ) : (
                    s.problemName
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className={s.accepted ? 'text-emerald-200' : 'text-red-200'}>{s.accepted ? (s.verdict === 'OK' ? 'Accepted' : s.verdictText) : `Failed: ${s.verdictText}`}</span>
                  <span className="text-zinc-400">{timeAgo(s.time)}</span>
                  {s.origin === 'manual' && <SourceTag origin="manual" />}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
