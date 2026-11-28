import React, { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  Database,
  DoorOpen,
  Download,
  Mic,
  Music,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { AdminService } from '../../network/AdminService';

type RangeKey = 'today' | '7d' | '30d' | '90d';
type SubTabKey =
  | 'overview'
  | 'players'
  | 'rooms'
  | 'karaoke'
  | 'social'
  | 'tech'
  | 'moderation'
  | 'storage';

interface DashboardPayload {
  kpis?: {
    sessions: number;
    unique_devices: number;
    avg_active_s: number;
    songs: number;
    errors: number;
    peak_ccu: number;
    avg_ccu: number;
  };
  ccu?: Array<{ ts: string; total: number; lobby: number; cinema: number; tearoom: number }>;
  daily?: Array<{
    day: string;
    sessions: number;
    dau: number;
    new_users: number;
    songs: number;
    errors: number;
  }>;
  peak_matrix?: Array<{ dow: number; hr: number; avg_ccu: number }>;
  funnel?: Array<{ step: string; count: number }>;
  auth_mix?: Array<{ type: string; ok: number; fail: number }>;
  dur_hist?: Array<{ bucket: string; cnt: number }>;
  platforms?: Array<{ platform: string; cnt: number }>;
  avatars?: Array<{ model: string; cnt: number }>;
  top_players?: Array<{ name: string; device_id: string; room_joins: number; total_s: number }>;
  scenes?: {
    lobby_s: number;
    cinema_s: number;
    tearoom_s: number;
    switches: Array<{ from_scene: string; to_scene: string; cnt: number }>;
  };
  room_denied?: Array<{ reason: string; cnt: number }>;
  karaoke_songs?: Array<{
    vid: string;
    title: string;
    src: string;
    plays: number;
    avg_pct: number;
    mic_plays: number;
  }>;
  karaoke_queries?: Array<{ query: string; cnt: number; fallback_cnt: number }>;
  karaoke_ends?: Array<{ reason: string; cnt: number }>;
  karaoke_presets?: Array<{ preset: string; cnt: number }>;
  stage_media?: Array<{ vid: string; src: string; plays: number }>;
  social?: {
    chat: number;
    clap: number;
    sit: number;
    mic_s: number;
    spk_s: number;
    v_ok: number;
    v_fail: number;
    ice_relay: number;
    mic_perms: Array<{ result: string; cnt: number }>;
  };
  tech?: {
    avg_fps: number;
    p5_fps: number;
    avg_ping: number;
    p95_ping: number;
    avg_load_ms: number;
    reconnects: number;
    gpus: Array<{ gpu: string; sessions: number; avg_fps: number }>;
  };
  errors?: Array<{
    hash: string;
    src: string;
    sample_msg: string;
    first_seen: string;
    last_seen: string;
    total: number;
    sessions: number;
  }>;
  audit?: Array<{
    id: number;
    ts: string;
    actor: string;
    action: string;
    target: string;
    old_val: unknown;
    new_val: unknown;
  }>;
  ban_reasons?: Array<{ reason: string; cnt: number }>;
  cohort?: Array<{ cohort_day: string; d0: number; d1: number; d3: number; d7: number }>;
  monthly?: Array<{
    month: string;
    mau: number;
    new_users: number;
    sessions: number;
    total_active_s: number;
    avg_session_s: number;
    peak_ccu: number;
    avg_ccu: number;
    songs: number;
    errors: number;
    chat: number;
    clap: number;
  }>;
  settings?: {
    analytics_level: number;
    analytics_retention_days: number;
    max_total_players: number;
  };
}

const PIE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6'];
const DOW_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  onExport?: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onExport, children }) => (
  <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-5 flex flex-col gap-3">
    <div className="flex items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
      </div>
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] text-neutral-300 flex items-center gap-1 transition"
        >
          <Download className="w-3 h-3" />
          <span>CSV</span>
        </button>
      )}
    </div>
    <div className="w-full min-h-[220px]">{children}</div>
  </div>
);

const KpiCard: React.FC<{ label: string; value: string | number; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-4">
    <div className="text-[11px] text-neutral-400">{label}</div>
    <div className="text-xl font-bold text-white font-mono mt-1">{value}</div>
    {sub && <div className="text-[11px] text-neutral-500 mt-1">{sub}</div>}
  </div>
);

export const AdminAnalyticsPanel: React.FC<{ accountId: string }> = ({ accountId }) => {
  const [range, setRange] = useState<RangeKey>('7d');
  const [platformFilter, setPlatformFilter] = useState<string>('');
  const [guestFilter, setGuestFilter] = useState<string>('');
  const [subTab, setSubTab] = useState<SubTabKey>('overview');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<DashboardPayload>({});
  const [storage, setStorage] = useState<{
    db_bytes: number;
    db_limit_bytes: number;
    analytics_bytes: number;
    analytics_budget_bytes: number;
    tables: Array<{ table_name: string; bytes: number; rows: number }>;
  } | null>(null);

  const [analyticsLevel, setAnalyticsLevel] = useState(2);
  const [retentionDays, setRetentionDays] = useState(30);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    const now = new Date();
    const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const from =
      range === 'today'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : new Date(now.getTime() - days * 86400_000);

    const [dashRes, storRes] = await Promise.all([
      AdminService.fetchAnalyticsDashboard({
        fromIso: from.toISOString(),
        toIso: now.toISOString(),
        platform: platformFilter || null,
        guest: guestFilter || null,
      }),
      AdminService.fetchStorageStats(),
    ]);

    if (dashRes.error) {
      setErrorMsg(
        `Chưa tải được dữ liệu Analytics (${dashRes.error}). Hãy chạy file supabase/analytics.sql trên Supabase SQL Editor.`
      );
    } else if (dashRes.data) {
      const payload = dashRes.data as DashboardPayload;
      setData(payload);
      if (payload.settings) {
        setAnalyticsLevel(payload.settings.analytics_level);
        setRetentionDays(payload.settings.analytics_retention_days);
      }
    }
    if (storRes) setStorage(storRes);
    setLoading(false);
  }, [range, platformFilter, guestFilter]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigMsg('');
    const res = await AdminService.updateAnalyticsSettings(
      analyticsLevel,
      retentionDays,
      accountId
    );
    setSavingConfig(false);
    setConfigMsg(res.ok ? 'Đã lưu cấu hình Analytics.' : res.error || 'Lỗi khi lưu.');
  };

  const kpis = data.kpis;
  const analyticsMb = storage ? Number(formatMb(storage.analytics_bytes)) : 0;
  const dbMb = storage ? Number(formatMb(storage.db_bytes)) : 0;

  const navItems: Array<{ id: SubTabKey; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Tổng quan', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'players', label: 'Người chơi', icon: <Users className="w-4 h-4" /> },
    { id: 'rooms', label: 'Phòng & Scene', icon: <DoorOpen className="w-4 h-4" /> },
    { id: 'karaoke', label: 'Karaoke', icon: <Music className="w-4 h-4" /> },
    { id: 'social', label: 'Xã hội & Voice', icon: <Mic className="w-4 h-4" /> },
    { id: 'tech', label: 'Kỹ thuật & Lỗi', icon: <Cpu className="w-4 h-4" /> },
    { id: 'moderation', label: 'Kiểm duyệt', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'storage', label: 'Dung lượng', icon: <Database className="w-4 h-4" /> },
  ];

  const dailyRows = (data.daily ?? []).map((d) => ({
    ...d,
    returning_users: Math.max(0, (d.dau || 0) - (d.new_users || 0)),
  }));

  const sceneBarData = data.scenes
    ? [
        { name: 'Sảnh Chờ', minutes: Math.round(data.scenes.lobby_s / 60) },
        { name: 'Rạp Phim', minutes: Math.round(data.scenes.cinema_s / 60) },
        { name: 'Phòng Trà', minutes: Math.round(data.scenes.tearoom_s / 60) },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Top Filter & Budget Bar */}
      <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['today', '7d', '30d', '90d'] as RangeKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                range === k
                  ? 'bg-white text-neutral-950'
                  : 'bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08]'
              }`}
            >
              {k === 'today' ? 'Hôm nay' : k === '7d' ? '7 ngày' : k === '30d' ? '30 ngày' : '90 ngày'}
            </button>
          ))}

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[#0b0d12] border border-white/[0.08] text-xs text-neutral-200"
          >
            <option value="">Mọi thiết bị</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>

          <select
            value={guestFilter}
            onChange={(e) => setGuestFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[#0b0d12] border border-white/[0.08] text-xs text-neutral-200"
          >
            <option value="">Mọi người chơi</option>
            <option value="guest">Khách (Guest)</option>
            <option value="account">Tài khoản</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {storage && (
            <div className="px-3 py-1.5 rounded-lg bg-[#0b0d12] border border-white/[0.08] text-[11px] font-mono text-neutral-300 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Analytics: <strong className="text-white">{analyticsMb}</strong> / 100 MB
              </span>
              <span className="text-neutral-600">|</span>
              <span>
                DB: <strong className="text-white">{dbMb}</strong> / 500 MB
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs text-neutral-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Tải lại</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Layout: Left Sub-nav + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <aside className="lg:col-span-2 rounded-2xl bg-[#12151c] border border-white/[0.08] p-2 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                subTab === item.id
                  ? 'bg-white text-neutral-950'
                  : 'text-neutral-300 hover:bg-white/[0.06]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </aside>

        <div className="lg:col-span-10 space-y-5">
          {subTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Người chơi (DAU/Unique)" value={kpis?.unique_devices ?? 0} />
                <KpiCard label="Đỉnh Online (Peak CCU)" value={kpis?.peak_ccu ?? 0} sub={`TB: ${kpis?.avg_ccu ?? 0}`} />
                <KpiCard label="Tổng số phiên" value={kpis?.sessions ?? 0} />
                <KpiCard label="Thời lượng phiên TB" value={formatDuration(kpis?.avg_active_s ?? 0)} />
                <KpiCard label="Bài Karaoke đã hát" value={kpis?.songs ?? 0} />
                <KpiCard label="Số lỗi client" value={kpis?.errors ?? 0} />
                <KpiCard label="FPS trung bình" value={data.tech?.avg_fps ?? 0} sub={`p5: ${data.tech?.p5_fps ?? 0}`} />
                <KpiCard label="Ping trung bình" value={`${data.tech?.avg_ping ?? 0} ms`} sub={`p95: ${data.tech?.p95_ping ?? 0} ms`} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard
                  title="Số người online (CCU) theo thời gian"
                  subtitle="Kèm đường giới hạn max_total_players"
                  onExport={() => downloadCsv('ccu.csv', data.ccu ?? [])}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={data.ccu ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                      <XAxis dataKey="ts" stroke="#9ca3af" fontSize={10} tickFormatter={(v) => String(v).slice(11, 16)} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      {data.settings?.max_total_players && (
                        <ReferenceLine y={data.settings.max_total_players} stroke="#f87171" strokeDasharray="4 4" label={{ value: 'Max', fill: '#f87171', fontSize: 10 }} />
                      )}
                      <Line type="monotone" dataKey="total" name="Tổng online" stroke="#60a5fa" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Người mới vs Quay lại theo ngày"
                  onExport={() => downloadCsv('daily_users.csv', dailyRows)}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={dailyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                      <XAxis dataKey="day" stroke="#9ca3af" fontSize={10} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="new_users" name="Người mới" stackId="a" fill="#34d399" />
                      <Bar dataKey="returning_users" name="Quay lại" stackId="a" fill="#60a5fa" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* 24x7 Peak Hours Heatmap Matrix */}
              <ChartCard title="Giờ cao điểm (Thứ × Giờ trong ngày)" subtitle="Đậm hơn = nhiều người online hơn">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px] space-y-1">
                    {DOW_LABELS.map((label, dow) => (
                      <div key={label} className="grid grid-cols-[32px_repeat(24,minmax(0,1fr))] gap-1 items-center">
                        <span className="text-[11px] font-mono text-neutral-400">{label}</span>
                        {Array.from({ length: 24 }, (_, hr) => {
                          const cell = (data.peak_matrix ?? []).find((c) => c.dow === dow && c.hr === hr);
                          const val = cell?.avg_ccu ?? 0;
                          const alpha = Math.min(0.95, val > 0 ? 0.15 + val / Math.max(5, kpis?.peak_ccu || 10) : 0.04);
                          return (
                            <div
                              key={hr}
                              title={`${label} ${hr}h: TB ${val} người`}
                              className="h-5 rounded text-[9px] flex items-center justify-center text-white/80 font-mono"
                              style={{ backgroundColor: `rgba(52, 211, 153, ${alpha})` }}
                            >
                              {val > 0 ? Math.round(val) : ''}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>

              <ChartCard
                title="Tổng kết theo tháng (Monthly Overall - Lưu vĩnh viễn)"
                subtitle="Dữ liệu chi tiết ngày tự xóa sau 90 ngày, tổng kết tháng giữ lại mãi mãi"
                onExport={() => downloadCsv('monthly_overall.csv', data.monthly ?? [])}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-neutral-400 border-b border-white/[0.08]">
                      <tr>
                        <th className="py-2">Tháng</th>
                        <th className="py-2">MAU</th>
                        <th className="py-2">Mới</th>
                        <th className="py-2">Phiên</th>
                        <th className="py-2">TB phiên</th>
                        <th className="py-2">Peak CCU</th>
                        <th className="py-2">Bài hát</th>
                        <th className="py-2">Chat</th>
                        <th className="py-2">Lỗi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.monthly ?? []).map((m) => (
                        <tr key={m.month} className="border-b border-white/[0.04]">
                          <td className="py-2 font-mono text-white">{String(m.month).slice(0, 7)}</td>
                          <td className="py-2 font-mono text-emerald-300">{m.mau}</td>
                          <td className="py-2 font-mono text-sky-300">{m.new_users}</td>
                          <td className="py-2 font-mono">{m.sessions}</td>
                          <td className="py-2 font-mono">{formatDuration(m.avg_session_s)}</td>
                          <td className="py-2 font-mono text-amber-300">{m.peak_ccu}</td>
                          <td className="py-2 font-mono">{m.songs}</td>
                          <td className="py-2 font-mono">{m.chat}</td>
                          <td className="py-2 font-mono text-rose-400">{m.errors}</td>
                        </tr>
                      ))}
                      {(!data.monthly || data.monthly.length === 0) && (
                        <tr>
                          <td colSpan={9} className="py-3 text-neutral-500">
                            Chưa có tổng kết tháng (sẽ tự động tạo sau lần rollup đầu tiên).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}

          {subTab === 'players' && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="Funnel chuyển đổi người chơi">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data.funnel ?? []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                      <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                      <YAxis type="category" dataKey="step" width={110} stroke="#9ca3af" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Bar dataKey="count" name="Số phiên" fill="#60a5fa" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Phân bố thời lượng phiên">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data.dur_hist ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                      <XAxis dataKey="bucket" stroke="#9ca3af" fontSize={11} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Bar dataKey="cnt" name="Số phiên" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Thiết bị (Desktop vs Mobile)">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.platforms ?? []} dataKey="cnt" nameKey="platform" outerRadius={80} label>
                        {(data.platforms ?? []).map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Cohort Retention (D0 / D1 / D3 / D7)">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-neutral-400 border-b border-white/[0.08]">
                        <tr>
                          <th className="py-2">Ngày đầu</th>
                          <th className="py-2">D0</th>
                          <th className="py-2">D1</th>
                          <th className="py-2">D3</th>
                          <th className="py-2">D7</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.cohort ?? []).map((c) => (
                          <tr key={c.cohort_day} className="border-b border-white/[0.04]">
                            <td className="py-2 font-mono text-neutral-300">{c.cohort_day}</td>
                            <td className="py-2 font-mono">{c.d0}</td>
                            <td className="py-2 font-mono text-emerald-300">
                              {c.d0 ? `${Math.round((c.d1 / c.d0) * 100)}%` : '-'}
                            </td>
                            <td className="py-2 font-mono text-sky-300">
                              {c.d0 ? `${Math.round((c.d3 / c.d0) * 100)}%` : '-'}
                            </td>
                            <td className="py-2 font-mono text-violet-300">
                              {c.d0 ? `${Math.round((c.d7 / c.d0) * 100)}%` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              </div>

              <ChartCard
                title="Top người chơi tích cực"
                onExport={() => downloadCsv('top_players.csv', data.top_players ?? [])}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-neutral-400 border-b border-white/[0.08]">
                      <tr>
                        <th className="py-2">Tên hiển thị</th>
                        <th className="py-2">Device ID</th>
                        <th className="py-2">Lượt vào phòng</th>
                        <th className="py-2">Tổng thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.top_players ?? []).map((p) => (
                        <tr key={p.device_id} className="border-b border-white/[0.04]">
                          <td className="py-2 text-white font-medium">{p.name}</td>
                          <td className="py-2 font-mono text-neutral-500">{p.device_id.slice(0, 14)}…</td>
                          <td className="py-2 font-mono">{p.room_joins}</td>
                          <td className="py-2 font-mono text-emerald-300">{formatDuration(p.total_s)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}

          {subTab === 'rooms' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="Người online theo từng Scene (Stacked Area)">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={data.ccu ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                    <XAxis dataKey="ts" stroke="#9ca3af" fontSize={10} tickFormatter={(v) => String(v).slice(11, 16)} />
                    <YAxis stroke="#9ca3af" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="lobby" name="Sảnh Chờ" stackId="1" stroke="#60a5fa" fill="#60a5fa55" />
                    <Area type="monotone" dataKey="cinema" name="Rạp Phim" stackId="1" stroke="#fbbf24" fill="#fbbf2455" />
                    <Area type="monotone" dataKey="tearoom" name="Phòng Trà" stackId="1" stroke="#34d399" fill="#34d39955" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Tổng thời gian ở mỗi Scene (phút)">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={sceneBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                    <YAxis stroke="#9ca3af" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                    <Bar dataKey="minutes" name="Phút" fill="#34d399" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Lý do bị từ chối vào phòng (room_denied)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.room_denied ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                    <XAxis dataKey="reason" stroke="#9ca3af" fontSize={11} />
                    <YAxis stroke="#9ca3af" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                    <Bar dataKey="cnt" name="Số lần" fill="#f87171" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Luồng chuyển Scene">
                <div className="space-y-2 text-xs">
                  {(data.scenes?.switches ?? []).map((sw, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0b0d12] border border-white/[0.05]">
                      <span className="text-neutral-300">
                        {sw.from_scene} → <strong className="text-white">{sw.to_scene}</strong>
                      </span>
                      <span className="font-mono text-emerald-300">{sw.cnt}</span>
                    </div>
                  ))}
                  {(!data.scenes?.switches || data.scenes.switches.length === 0) && (
                    <p className="text-neutral-500 text-xs">Chưa có dữ liệu chuyển scene.</p>
                  )}
                </div>
              </ChartCard>
            </div>
          )}

          {subTab === 'karaoke' && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="Số bài Karaoke mỗi ngày" onExport={() => downloadCsv('karaoke_daily.csv', dailyRows)}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dailyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                      <XAxis dataKey="day" stroke="#9ca3af" fontSize={10} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Bar dataKey="songs" name="Bài hát" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Preset giọng hát được ưa chuộng">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.karaoke_presets ?? []} dataKey="cnt" nameKey="preset" outerRadius={80} label>
                        {(data.karaoke_presets ?? []).map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="Top 20 bài hát Karaoke" onExport={() => downloadCsv('top_songs.csv', data.karaoke_songs ?? [])}>
                  <div className="overflow-x-auto max-h-[320px]">
                    <table className="w-full text-xs text-left">
                      <thead className="text-neutral-400 border-b border-white/[0.08]">
                        <tr>
                          <th className="py-2">Bài hát</th>
                          <th className="py-2">Lượt</th>
                          <th className="py-2">Bật Mic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.karaoke_songs ?? []).map((s, idx) => (
                          <tr key={idx} className="border-b border-white/[0.04]">
                            <td className="py-2 text-white truncate max-w-[220px]" title={s.title}>
                              {s.title || s.vid}
                            </td>
                            <td className="py-2 font-mono text-amber-300">{s.plays}</td>
                            <td className="py-2 font-mono text-emerald-300">{s.mic_plays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>

                <ChartCard title="Top từ khóa tìm kiếm Karaoke">
                  <div className="overflow-x-auto max-h-[320px]">
                    <table className="w-full text-xs text-left">
                      <thead className="text-neutral-400 border-b border-white/[0.08]">
                        <tr>
                          <th className="py-2">Từ khóa</th>
                          <th className="py-2">Lượt tìm</th>
                          <th className="py-2">Lỗi API</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.karaoke_queries ?? []).map((q, idx) => (
                          <tr key={idx} className="border-b border-white/[0.04]">
                            <td className="py-2 text-neutral-200">{q.query}</td>
                            <td className="py-2 font-mono">{q.cnt}</td>
                            <td className="py-2 font-mono text-rose-400">{q.fallback_cnt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              </div>
            </>
          )}

          {subTab === 'social' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Tin nhắn Chat" value={data.social?.chat ?? 0} />
                <KpiCard label="Lượt Vỗ tay" value={data.social?.clap ?? 0} />
                <KpiCard label="Lượt Ngồi ghế" value={data.social?.sit ?? 0} />
                <KpiCard
                  label="Tỉ lệ WebRTC thành công"
                  value={
                    (data.social?.v_ok ?? 0) + (data.social?.v_fail ?? 0) > 0
                      ? `${Math.round(((data.social?.v_ok ?? 0) * 100) / ((data.social?.v_ok ?? 0) + (data.social?.v_fail ?? 0)))}%`
                      : '-'
                  }
                  sub={`Relay: ${data.social?.ice_relay ?? 0}`}
                />
              </div>

              <ChartCard title="Kết quả xin quyền Microphone">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={data.social?.mic_perms ?? []} dataKey="cnt" nameKey="result" outerRadius={80} label>
                      {(data.social?.mic_perms ?? []).map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </>
          )}

          {subTab === 'tech' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="FPS trung bình" value={data.tech?.avg_fps ?? 0} sub={`p5: ${data.tech?.p5_fps ?? 0}`} />
                <KpiCard label="Ping trung bình" value={`${data.tech?.avg_ping ?? 0} ms`} sub={`p95: ${data.tech?.p95_ping ?? 0} ms`} />
                <KpiCard label="Thời gian tải Scene TB" value={`${data.tech?.avg_load_ms ?? 0} ms`} />
                <KpiCard label="Số lần Reconnect" value={data.tech?.reconnects ?? 0} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ChartCard title="FPS trung bình theo GPU">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data.tech?.gpus ?? []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                      <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                      <YAxis type="category" dataKey="gpu" width={140} stroke="#9ca3af" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Bar dataKey="avg_fps" name="FPS TB" fill="#34d399" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Số lỗi client theo ngày">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={dailyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                      <XAxis dataKey="day" stroke="#9ca3af" fontSize={10} />
                      <YAxis stroke="#9ca3af" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                      <Line type="monotone" dataKey="errors" name="Lỗi" stroke="#f87171" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ChartCard title="Top nhóm lỗi (Error Groups)" onExport={() => downloadCsv('errors.csv', data.errors ?? [])}>
                <div className="overflow-x-auto max-h-[320px]">
                  <table className="w-full text-xs text-left">
                    <thead className="text-neutral-400 border-b border-white/[0.08]">
                      <tr>
                        <th className="py-2">Nguồn</th>
                        <th className="py-2">Thông báo lỗi</th>
                        <th className="py-2">Số lần</th>
                        <th className="py-2">Phiên</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.errors ?? []).map((e) => (
                        <tr key={e.hash} className="border-b border-white/[0.04]">
                          <td className="py-2 font-mono text-amber-300">{e.src}</td>
                          <td className="py-2 text-neutral-200 max-w-[380px] truncate" title={e.sample_msg}>
                            {e.sample_msg}
                          </td>
                          <td className="py-2 font-mono text-rose-400">{e.total}</td>
                          <td className="py-2 font-mono">{e.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}

          {subTab === 'moderation' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="Lý do Ban phổ biến">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.ban_reasons ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                    <YAxis type="category" dataKey="reason" width={140} stroke="#9ca3af" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                    <Bar dataKey="cnt" name="Số lượt" fill="#f87171" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Nhật ký thao tác Admin (Audit Log)" onExport={() => downloadCsv('audit_log.csv', data.audit ?? [])}>
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="w-full text-xs text-left">
                    <thead className="text-neutral-400 border-b border-white/[0.08]">
                      <tr>
                        <th className="py-2">Thời gian</th>
                        <th className="py-2">Hành động</th>
                        <th className="py-2">Đối tượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.audit ?? []).map((a) => (
                        <tr key={a.id} className="border-b border-white/[0.04]">
                          <td className="py-2 font-mono text-neutral-400">
                            {new Date(a.ts).toLocaleString('vi-VN')}
                          </td>
                          <td className="py-2 font-mono text-sky-300">{a.action}</td>
                          <td className="py-2 text-white">{a.target}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>
          )}

          {subTab === 'storage' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <ChartCard title="Dung lượng từng bảng Analytics (MB)">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={(storage?.tables ?? []).map((t) => ({
                      name: t.table_name,
                      mb: Number(formatMb(t.bytes)),
                      rows: t.rows,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                    <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                    <YAxis type="category" dataKey="name" width={130} stroke="#9ca3af" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#0b0d12', border: '1px solid #ffffff20', fontSize: 12 }} />
                    <Bar dataKey="mb" name="MB" fill="#60a5fa" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <form
                onSubmit={(e) => void handleSaveConfig(e)}
                className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-5 space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Cấu hình tiết kiệm dung lượng</h3>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs text-neutral-300">Mức độ thu thập (analytics_level)</label>
                  <select
                    value={analyticsLevel}
                    onChange={(e) => setAnalyticsLevel(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0b0d12] border border-white/[0.08] text-xs text-white"
                  >
                    <option value={2}>2 - Đầy đủ (Summary + ~17 event chính)</option>
                    <option value={1}>1 - Siêu nhẹ (Chỉ Session Summary + Server CCU)</option>
                    <option value={0}>0 - Tắt thu thập client</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs text-neutral-300">Số ngày giữ event thô</label>
                  <input
                    type="number"
                    min={7}
                    max={90}
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(Math.max(7, Math.min(90, Number(e.target.value) || 30)))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0b0d12] border border-white/[0.08] text-xs text-white font-mono"
                  />
                </div>

                {configMsg && (
                  <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    {configMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-neutral-950 text-xs font-semibold transition"
                >
                  {savingConfig ? 'Đang lưu...' : 'Lưu cấu hình Analytics'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
