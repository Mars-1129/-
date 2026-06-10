import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiSuccessResponse, HealthCheckResponse } from '@tikstream/shared-types';

type HealthState = {
  loading: boolean;
  response?: ApiSuccessResponse<HealthCheckResponse>;
  error?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const serviceLabels: Record<keyof HealthCheckResponse['services'], string> = {
  postgres: 'PostgreSQL 16',
  redis: 'Redis 7',
  qdrant: 'Qdrant',
  minio: 'MinIO',
};

export function App(): JSX.Element {
  const { t } = useTranslation();
  const [healthState, setHealthState] = useState<HealthState>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth(): Promise<void> {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as ApiSuccessResponse<HealthCheckResponse>;
        setHealthState({ loading: false, response: payload });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setHealthState({
          loading: false,
          error: error instanceof Error ? error.message : t('common.unknownError'),
        });
      }
    }

    void loadHealth();

    return () => controller.abort();
  }, [t]);

  const serviceEntries = useMemo(() => {
    const services = healthState.response?.data.services;
    if (!services) {
      return [];
    }
    return Object.entries(services) as Array<[keyof HealthCheckResponse['services'], 'ok' | 'error']>;
  }, [healthState.response]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">{t('app.title')}</p>
            <h1 className="mt-3 text-4xl font-bold">{t('app.healthDashboard')}</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              {t('app.healthDesc')}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 px-5 py-4 text-sm text-slate-300">
            {t('app.apiBase')} <span className="font-mono text-cyan-200">{API_BASE_URL}</span>
          </div>
        </div>

        <div className="mt-8 rounded-2xl bg-slate-900/80 p-6">
          {healthState.loading && <p className="text-slate-300">{t('app.checkingHealth')}</p>}
          {healthState.error && (
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-red-100">
              {t('app.gatewayUnreachable')}{healthState.error}
            </div>
          )}
          {healthState.response && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">{t('app.overallStatus')}</p>
                  <p className="mt-1 text-3xl font-semibold uppercase text-cyan-200">{healthState.response.data.status}</p>
                </div>
                <div className="text-right text-sm text-slate-400">
                  <p>Trace: {healthState.response.trace_id}</p>
                  <p>{healthState.response.data.timestamp}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                {serviceEntries.map(([service, status]) => (
                  <div key={service} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{serviceLabels[service]}</p>
                    <p className={status === 'ok' ? 'mt-2 text-2xl font-semibold text-emerald-300' : 'mt-2 text-2xl font-semibold text-red-300'}>
                      {status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
