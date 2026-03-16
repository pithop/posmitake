"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
    Activity,
    Terminal,
    AlertTriangle,
    CheckCircle,
    Clock,
    Search,
    Filter,
    X,
    ChevronRight,
    Database,
    Wifi,
    Printer,
    ShoppingBag,
    Settings,
    Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'AUDIT';
type LogCategory = 'NETWORK' | 'ORDER' | 'REALTIME' | 'PRINT' | 'DB' | 'SYSTEM';

interface LogEntry {
    id: string;
    session_id: string;
    trace_id: string | null;
    client_timestamp: number;
    server_timestamp: string;
    level: LogLevel;
    category: LogCategory;
    event_name: string;
    device_id: string;
    user_id: string | null;
    payload: any;
}

const levelColors = {
    INFO: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    WARN: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    ERROR: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    FATAL: 'text-red-500 bg-red-500/20 border-red-500/30 animate-pulse',
    AUDIT: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
};

const categoryIcons: Record<string, any> = {
    ORDER: ShoppingBag,
    SYSTEM: Settings,
    REALTIME: Activity,
    NETWORK: Wifi,
    PRINT: Printer,
    DB: Database,
};

export default function DashboardPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
    const [filterCategory, setFilterCategory] = useState<LogCategory | 'ALL'>('ALL');
    const [filterDate, setFilterDate] = useState<string>(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    });
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

    const fetchLogs = async (dateStr: string) => {
        setLoading(true);
        if (!supabase) return;

        const startOfDay = `${dateStr}T00:00:00Z`;
        const endOfDay = `${dateStr}T23:59:59.999Z`;

        const { data, error } = await supabase
            .from('pos_logs')
            .select('*')
            .gte('server_timestamp', startOfDay)
            .lte('server_timestamp', endOfDay)
            .order('server_timestamp', { ascending: false })
            .limit(1000);

        if (!error && data) {
            setLogs(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs(filterDate);

        // Subscribe to new logs dynamically
        const channel = supabase?.channel('public:pos_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_logs' }, (payload) => {
                const newLog = payload.new as LogEntry;
                // Only push to UI if it belongs to the currently selected date
                const logDate = new Date(newLog.server_timestamp).toISOString().split('T')[0];
                if (logDate === filterDate) {
                    setLogs(prev => [newLog, ...prev]);
                }
            })
            .subscribe();

        return () => {
            if (channel) supabase?.removeChannel(channel);
        };
    }, [filterDate]);



    const filteredLogs = logs.filter(log => {
        if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
        if (filterCategory !== 'ALL' && log.category !== filterCategory) return false;
        return true;
    });

    return (
        <div className="min-h-screen bg-zinc-950 text-slate-300 font-mono flex flex-col selection:bg-emerald-500/30">

            {/* Header */}
            <header className="border-b border-white/10 bg-zinc-900/50 p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex-shrink-0">
                        <Activity className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Mitake Telemetry</h1>
                        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Real-time Observability Dashboard</p>
                    </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                    <div className="flex items-center gap-2 text-xs md:text-sm bg-zinc-900 px-3 py-2 rounded-lg border border-white/5 whitespace-nowrap">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-500 font-medium">Live Sync Active</span>
                    </div>
                    <div className="text-[10px] md:text-xs text-slate-500 text-right whitespace-nowrap flex flex-col md:block">
                        <span>{logs.length} Events captured</span>
                        <span className="md:block hidden">Last updated: {new Date().toLocaleTimeString()}</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
                {/* Sidebar Filters */}
                <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 bg-zinc-900/20 p-4 md:p-6 flex flex-col sm:flex-row md:flex-col gap-4 md:gap-8 overflow-y-auto z-20">
                    <div className="flex-1 min-w-[200px]">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 md:mb-4 flex items-center gap-2">
                            <Calendar className="w-3 h-3" /> Date
                        </h3>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div className="flex-1 min-w-[200px]">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 md:mb-4 flex items-center gap-2">
                            <Filter className="w-3 h-3" /> Severity Level
                        </h3>
                        <div className="flex flex-row flex-wrap md:flex-col gap-2">
                            {['ALL', 'INFO', 'WARN', 'ERROR', 'FATAL', 'AUDIT'].map(level => (
                                <button
                                    key={level}
                                    onClick={() => setFilterLevel(level as any)}
                                    className={cn(
                                        "text-center md:text-left px-3 py-2 rounded-md text-sm transition-all duration-200 border flex-1 min-w-[60px] md:min-w-0 md:w-full",
                                        filterLevel === level
                                            ? "bg-zinc-800 border-white/20 text-white shadow-lg"
                                            : "bg-transparent border-white/5 text-slate-400 hover:bg-zinc-800/50"
                                    )}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 min-w-[200px]">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 md:mb-4 flex items-center gap-2">
                            <Search className="w-3 h-3" /> Category
                        </h3>
                        <div className="flex flex-row flex-wrap md:flex-col gap-2">
                            {['ALL', 'ORDER', 'REALTIME', 'PRINT', 'SYSTEM', 'DB', 'NETWORK'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFilterCategory(cat as any)}
                                    className={cn(
                                        "text-center md:text-left px-3 py-2 rounded-md text-sm transition-all duration-200 border flex-1 min-w-[80px] md:min-w-0 md:w-full",
                                        filterCategory === cat
                                            ? "bg-zinc-800 border-white/20 text-white shadow-lg"
                                            : "bg-transparent border-white/5 text-slate-400 hover:bg-zinc-800/50"
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Logs Table */}
                <div className="flex-1 flex flex-col overflow-hidden relative min-h-[50vh]">
                    <div className="flex-1 overflow-x-auto overflow-y-auto p-2 md:p-6">
                        {loading ? (
                            <div className="flex items-center justify-center h-[200px] md:h-full text-slate-500 gap-3">
                                <Clock className="w-5 h-5 animate-spin" /> Fetching telemetry data...
                            </div>
                        ) : filteredLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[200px] md:h-full text-slate-500">
                                <Terminal className="w-12 h-12 mb-4 opacity-20" />
                                <p>No logs found matching your criteria.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 md:gap-3 min-w-[700px] md:min-w-0">
                                {filteredLogs.map(log => {
                                    const Icon = categoryIcons[log.category] || Terminal;
                                    return (
                                        <div
                                            key={log.id}
                                            onClick={() => setSelectedLog(log)}
                                            className="group bg-zinc-900 border border-white/5 rounded-lg p-3 md:p-4 flex flex-row items-center gap-3 md:gap-4 hover:bg-zinc-800 transition-colors cursor-pointer"
                                        >
                                            <div className="w-24 md:w-32 flex-none text-[10px] md:text-xs text-slate-500 whitespace-nowrap">
                                                {format(new Date(log.server_timestamp), 'HH:mm:ss.SSS')}
                                            </div>

                                            <div className={cn("px-1.5 py-0.5 md:px-2.5 md:py-1 rounded text-[9px] md:text-[10px] font-bold border w-12 md:w-16 text-center tracking-wider", levelColors[log.level] || levelColors.INFO)}>
                                                {log.level}
                                            </div>

                                            <div className="flex items-center gap-1.5 md:gap-2 w-24 md:w-32 border-l border-white/10 pl-2 md:pl-4">
                                                <Icon className="w-3 h-3 md:w-4 md:h-4 text-slate-500 hidden sm:block" />
                                                <span className="text-[10px] md:text-xs text-slate-400 truncate">{log.category}</span>
                                            </div>

                                            <div className="flex-1 font-semibold text-xs md:text-sm text-slate-200 truncate min-w-[150px]">
                                                {log.event_name}
                                            </div>

                                            <div className="w-24 md:w-48 flex-none text-[10px] md:text-xs text-slate-500 truncate flex items-center gap-1.5 md:gap-2 justify-end md:justify-start">
                                                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-slate-700 hidden sm:block" />
                                                <span className="truncate">Device: {log.device_id === 'unknown' ? 'Unknown' : log.device_id.substring(0, 8)}</span>
                                            </div>

                                            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-slate-600 group-hover:text-emerald-500 transition-colors flex-none" />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Detail Panel */}
                {selectedLog && (
                    <div className="fixed inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[500px] border-l border-white/5 bg-zinc-950/95 md:bg-zinc-900/50 shadow-2xl flex flex-col p-4 md:p-6 overflow-y-auto animate-slide-in-right z-[100] md:z-20 backdrop-blur-xl md:backdrop-blur-none">
                        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
                            <h2 className="text-lg font-bold text-white flex items-center gap-3">
                                <div className={cn("w-3 h-3 rounded-full", levelColors[selectedLog.level]?.split(' ')[0].replace('text-', 'bg-') || 'bg-slate-500')} />
                                Event Detail
                            </h2>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-6 -mx-2 md:mx-0 px-2 md:px-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Event Name</div>
                                    <div className="font-bold text-emerald-400">{selectedLog.event_name}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Timestamp</div>
                                    <div>{format(new Date(selectedLog.server_timestamp), 'dd/MM/yyyy HH:mm:ss')}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Trace ID</div>
                                    <div className="font-mono text-xs">{selectedLog.trace_id || '-'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">Device ID</div>
                                    <div className="font-mono text-xs truncate" title={selectedLog.device_id}>{selectedLog.device_id}</div>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-2 border-b border-white/10 pb-2">JSON Payload</div>
                                <div className="bg-black/50 p-4 rounded-lg border border-white/10 overflow-x-auto text-xs text-emerald-300 font-mono">
                                    <pre>
                                        {JSON.stringify(selectedLog.payload, null, 2)}
                                    </pre>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-slate-500 mb-2 border-b border-white/10 pb-2">System Metadata</div>
                                <div className="grid grid-cols-2 gap-y-4 text-xs font-mono">
                                    <div className="text-slate-500">Log ID</div>
                                    <div className="truncate text-right" title={selectedLog.id}>{selectedLog.id}</div>

                                    <div className="text-slate-500">Session ID</div>
                                    <div className="truncate text-right" title={selectedLog.session_id}>{selectedLog.session_id}</div>

                                    <div className="text-slate-500">Client latency</div>
                                    <div className="text-right">
                                        {new Date(selectedLog.server_timestamp).getTime() - selectedLog.client_timestamp} ms
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
