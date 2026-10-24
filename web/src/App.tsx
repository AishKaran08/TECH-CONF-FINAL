import { useEffect } from 'react';
import { Button, ErrorNote, Skeleton } from './components/ui';
import { connectEvents, refresh, useApp } from './lib/store';
import { AgentPalette } from './panels/AgentPalette';
import { AiNoticeModal } from './panels/AiNotice';
import { ConnectionsModal } from './panels/ConnectionsModal';
import { Header } from './panels/Header';
import { openAgent } from './panels/panelState';
import { SortModal } from './panels/SortModal';
import { Toasts } from './panels/Toasts';
import { ActivityRadar } from './widgets/ActivityRadar';
import { CourseSchedule } from './widgets/CourseSchedule';
import { ExamTimetable } from './widgets/ExamTimetable';
import { FocusTimer } from './widgets/FocusTimer';
import { GithubActivity } from './widgets/GithubActivity';
import { LeetcodeProgress } from './widgets/LeetcodeProgress';
import { ProjectPortfolio } from './widgets/ProjectPortfolio';
import { RecentSubmissions } from './widgets/RecentSubmissions';
import { TasksPanel } from './widgets/TasksPanel';
import { TodayBriefing } from './widgets/TodayBriefing';

function LoadingGrid() {
  const spans = ['lg:col-span-8', 'lg:col-span-4', 'lg:col-span-6', 'lg:col-span-3', 'lg:col-span-3', 'lg:col-span-8', 'lg:col-span-4'];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12" aria-busy="true" aria-label="Loading dashboard">
      {spans.map((s, i) => (
        <div key={i} className={`glass rounded-2xl p-5 md:col-span-6 ${s}`}>
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="h-28 w-full" />
        </div>
      ))}
    </div>
  );
}

export function App() {
  const d = useApp((s) => s.dashboard);
  const loadError = useApp((s) => s.loadError);

  useEffect(() => {
    void refresh();
    return connectEvents();
  }, []);

  // Cmd/Ctrl+K opens the agent from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openAgent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Header d={d} />
      <main id="main" className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 sm:pt-6">
        {loadError && !d ? (
          <div className="mx-auto mt-16 flex max-w-md flex-col gap-3">
            <ErrorNote>{loadError}</ErrorNote>
            <Button onClick={() => void refresh()} icon="sync" className="self-start">
              Try again
            </Button>
          </div>
        ) : !d ? (
          <LoadingGrid />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
            <TodayBriefing d={d} index={0} />
            <TasksPanel d={d} index={1} />
            <GithubActivity d={d} index={2} />
            <ActivityRadar d={d} index={3} />
            <LeetcodeProgress d={d} index={4} />
            <ProjectPortfolio d={d} index={5} />
            <ExamTimetable d={d} index={6} />
            <CourseSchedule d={d} index={7} />
            <RecentSubmissions d={d} index={8} />
            <FocusTimer index={9} />
          </div>
        )}
      </main>
      <ConnectionsModal d={d} />
      <SortModal />
      <AgentPalette />
      <AiNoticeModal />
      <Toasts />
    </>
  );
}
