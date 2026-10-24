import { useState } from 'react';
import type { Dashboard, PortfolioProject } from '@runway/shared';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, SourceLine, SourceTag } from '../components/ui';
import { timeAgo } from '../lib/format';
import { useFlip } from '../lib/motion';
import { openConnections } from '../panels/panelState';

const LANG_COLOR: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Go: '#00add8',
  'C++': '#f34b7d',
  C: '#8d8d8d',
  Rust: '#dea584',
  Java: '#b07219',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#663399',
  'Jupyter Notebook': '#da5b0b',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
};

function ProjectItem({ p, reason }: { p: PortfolioProject; reason?: string }) {
  return (
    <li data-flip-key={p.id} className="tr flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 hover:border-zinc-700">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
          {p.url ? (
            <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
              {p.name}
            </a>
          ) : (
            p.name
          )}
        </h3>
        {p.stars !== null && p.stars > 0 && (
          <span className="num flex shrink-0 items-center gap-1 text-xs text-zinc-400" aria-label={`${p.stars} stars`}>
            <Icon name="star" size={12} />
            {p.stars}
          </span>
        )}
      </div>
      {p.description && <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">{p.description}</p>}
      {reason && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-teal-200">
          <Icon name="target" size={12} className="mt-0.5 shrink-0" />
          {reason}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-zinc-400">
        {p.language && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: LANG_COLOR[p.language] ?? '#a1a1aa' }} aria-hidden="true" />
            {p.language}
          </span>
        )}
        {p.pushedAt && <span>pushed {timeAgo(p.pushedAt)}</span>}
        <span className="ml-auto flex gap-1">
          {p.origins.map((o) => (
            <SourceTag key={o} origin={o} />
          ))}
        </span>
      </div>
    </li>
  );
}

export function ProjectPortfolio({ d, index }: { d: Dashboard; index: number }) {
  const [all, setAll] = useState(false);
  const list = all ? d.projects : d.projects.slice(0, 6);
  const flipRef = useFlip<HTMLUListElement>(list.map((p) => p.id).join('|'));
  const gh = d.sources.find((s) => s.source === 'github');
  const origins = d.mode === 'demo' ? (['demo'] as const) : ([...(d.github.repos.length ? ['github' as const] : []), ...(d.resume ? ['resume' as const] : [])]);
  const role = d.settings.targetRole;

  return (
    <Card
      title="Project portfolio"
      icon="file"
      index={index}
      className="md:col-span-6 lg:col-span-8"
      actions={d.orders.sortedAt && role ? <span className="hidden text-xs text-zinc-400 sm:inline">Ranked for {role}</span> : undefined}
      footer={d.projects.length > 0 && <SourceLine origins={[...origins]} syncedAt={gh?.lastSyncedAt ?? null} />}
    >
      {d.projects.length === 0 ? (
        <Empty icon="file" title="No projects yet" action={<Button size="sm" icon="plug" onClick={() => openConnections('github')}>Connect GitHub or upload a resume</Button>}>
          Projects come from your public repositories and your resume. Matching ones are merged, so nothing shows up twice.
        </Empty>
      ) : (
        <>
          <ul ref={flipRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => (
              <ProjectItem key={p.id} p={p} reason={d.orders.reasons[p.id]} />
            ))}
          </ul>
          {d.projects.length > 6 && (
            <Button size="sm" variant="ghost" className="mt-3 self-start" onClick={() => setAll((v) => !v)} aria-expanded={all}>
              {all ? 'Show fewer' : `Show all ${d.projects.length}`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
