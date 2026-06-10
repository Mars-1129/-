import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageLoading } from './components/PageLoading';

const AppShell = React.lazy(() => import('./layouts/AppShell').then((m) => ({ default: m.AppShell })));
const MaterialsPage = React.lazy(() => import('../features/materials/MaterialsPage').then((m) => ({ default: m.MaterialsPage })));
const ScriptsPage = React.lazy(() => import('../features/scripts/ScriptsPage').then((m) => ({ default: m.ScriptsPage })));
const TemplatesPage = React.lazy(() => import('../features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const CreatePage = React.lazy(() => import('../features/create/CreatePage').then((m) => ({ default: m.CreatePage })));
const TasksPage = React.lazy(() => import('../features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const AnalyticsPage = React.lazy(() => import('../features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const CompliancePage = React.lazy(() => import('../features/compliance/CompliancePage').then((m) => ({ default: m.CompliancePage })));
const CommentsPage = React.lazy(() => import('../features/comments/CommentsPage').then((m) => ({ default: m.CommentsPage })));
const PostingTimePage = React.lazy(() => import('../features/posting-time/PostingTimePage').then((m) => ({ default: m.PostingTimePage })));
const ColdStartPage = React.lazy(() => import('../features/cold-start/ColdStartPage').then((m) => ({ default: m.ColdStartPage })));
const DnaManagementPage = React.lazy(() => import('../features/dna/DnaManagementPage').then((m) => ({ default: m.DnaManagementPage })));
const TrendTrackerPage = React.lazy(() => import('../features/trend-tracker/TrendTrackerPage').then((m) => ({ default: m.TrendTrackerPage })));
const AutocutPage = React.lazy(() => import('../features/autocut/AutocutPage').then((m) => ({ default: m.AutocutPage })));

function Lazy({ children }: { children: React.ReactNode }): JSX.Element {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}

export function AppRouter(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Lazy>
              <AppShell />
            </Lazy>
          }
        >
          <Route index element={<Navigate to="/materials" replace />} />
          <Route path="materials" element={<Lazy><MaterialsPage /></Lazy>} />
          <Route path="scripts" element={<Lazy><ScriptsPage /></Lazy>} />
          <Route path="templates" element={<Lazy><TemplatesPage /></Lazy>} />
          <Route path="create" element={<Lazy><CreatePage /></Lazy>} />
          <Route path="tasks" element={<Lazy><TasksPage /></Lazy>} />
          <Route path="analytics" element={<Lazy><AnalyticsPage /></Lazy>} />
          <Route path="compliance" element={<Lazy><CompliancePage /></Lazy>} />
          <Route path="comments" element={<Lazy><CommentsPage /></Lazy>} />
          <Route path="posting-time" element={<Lazy><PostingTimePage /></Lazy>} />
          <Route path="cold-start" element={<Lazy><ColdStartPage /></Lazy>} />
          <Route path="dna" element={<Lazy><DnaManagementPage /></Lazy>} />
          <Route path="trend-tracker" element={<Lazy><TrendTrackerPage /></Lazy>} />
          <Route path="autocut" element={<Lazy><AutocutPage /></Lazy>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
