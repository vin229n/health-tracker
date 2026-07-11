"use client";

import React, { useState, useEffect, useRef } from "react";

interface BiometricParameter {
  id: string;
  label: string;
}

type PainLevels = Record<string, number>;

interface LogEntry {
  id: string;
  date: string;
  painLevels: PainLevels;
  notes: string;
}

const DEFAULT_PARAMETERS: BiometricParameter[] = [
  { id: "rightShoulder", label: "Right Shoulder" },
  { id: "rightArm", label: "Right Arm Muscle" },
  { id: "leftShoulder", label: "Left Shoulder" },
  { id: "leftArm", label: "Left Arm (Anterior Deltoid)" },
  { id: "upperBack", label: "Upper Back (Scapula)" },
  { id: "lowerBack", label: "Lower Back" },
];

const COLOR_PALETTE = [
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#a855f7", // Purple
  "#ec4899", // Pink
  "#f97316", // Orange
  "#10b981", // Emerald
  "#fbbf24", // Amber
  "#f43f5e", // Rose
  "#6366f1", // Indigo
  "#14b8a6", // Teal
];

// Initial state for daily log inputs
const INITIAL_PAIN_LEVELS: PainLevels = {
  rightShoulder: 0,
  rightArm: 1,
  leftShoulder: 3,
  leftArm: 5,
  upperBack: 2,
  lowerBack: 0,
};

// Seed mock data if localStorage is empty
const getMockLogs = (): LogEntry[] => {
  const today = new Date();
  return Array.from({ length: 7 }).map((_, idx) => {
    const date = new Date();
    date.setDate(today.getDate() - (7 - idx)); // past 7 days excluding today
    const dateString = date.toISOString().split("T")[0];

    // Progression trend representing gradual improvement
    const progressFactor = idx; // 0 to 6
    return {
      id: `mock-${idx}`,
      date: dateString,
      painLevels: {
        rightShoulder: Math.max(0, 2 - Math.floor(progressFactor / 3)),
        rightArm: Math.max(0, 3 - Math.floor(progressFactor / 2)),
        leftShoulder: Math.max(0, 5 - Math.floor(progressFactor / 1.5)),
        leftArm: Math.max(2, 7 - Math.floor(progressFactor / 1.2)),
        upperBack: Math.max(0, 4 - Math.floor(progressFactor / 2)),
        lowerBack: Math.max(0, 1 - Math.floor(progressFactor / 4)),
      },
      notes: [
        "Felt considerable soreness during upper body movement.",
        "Stiffness is noticeable in shoulders and upper back. Rested today.",
        "Slight improvement. Practiced gentle mobility exercises.",
        "Left arm (anterior deltoid) feels slightly less inflamed.",
        "Upper back tension is decreasing. Left shoulder pain reduced.",
        "Felt good today. Pain levels are decreasing overall.",
        "Progress is steady. Right shoulder pain is completely resolved.",
      ][idx],
    };
  });
};

const formatDateString = (dateStr: string) => {
  if (!dateStr) return "";
  let dateObj: Date;
  if (dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      dateObj = new Date(year, month - 1, day);
    } else {
      dateObj = new Date(dateStr);
    }
  } else {
    dateObj = new Date(dateStr);
  }

  if (isNaN(dateObj.getTime())) {
    return dateStr;
  }

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayName = days[dateObj.getDay()];
  const monthName = months[dateObj.getMonth()];
  const dayNum = dateObj.getDate();
  return `${monthName} ${dayNum}`;
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Input states
  const [painLevels, setPainLevels] = useState<PainLevels>(INITIAL_PAIN_LEVELS);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");

  // Selection states
  const [activePart, setActivePart] = useState<keyof PainLevels | null>(null);
  const [chartView, setChartView] = useState<"all" | "average" | keyof PainLevels>("all");
  const [timeRange, setTimeRange] = useState<"7d" | "30d">("7d");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Dynamic parameters state
  const [parameters, setParameters] = useState<BiometricParameter[]>([]);
  const [isManagingParams, setIsManagingParams] = useState(false);
  const [newParamLabel, setNewParamLabel] = useState("");

  // Tooltip position state for custom SVG chart hover
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    value: number;
    date: string;
    label?: string;
    color?: string;
  } | null>(null);

  // References for focus scrolling
  const slidersSectionRef = useRef<HTMLDivElement>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Trigger Client-only mounting and load data
  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    setDate(todayStr);

    fetch("/api/data")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch data");
        return res.json();
      })
      .then((data) => {
        setParameters(data.parameters || []);
        setLogs(data.logs || []);
        setMounted(true);
      })
      .catch((err) => {
        console.error("Error loading server data:", err);
        // Set empty states on failure so the page still works
        setParameters([]);
        setLogs([]);
        setMounted(true);
      });
  }, []);

  // Initialize slider inputs for loaded parameters
  useEffect(() => {
    if (parameters.length > 0) {
      setPainLevels(prev => {
        const next = { ...prev };
        parameters.forEach(p => {
          if (next[p.id] === undefined) {
            next[p.id] = 0;
          }
        });
        return next;
      });
    }
  }, [parameters]);

  // Save logs to storage
  const saveLogsToStorage = async (updatedLogs: LogEntry[]) => {
    setLogs(updatedLogs);
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: updatedLogs }),
      });
      if (!res.ok) throw new Error("Failed to save logs to server");
    } catch (err) {
      console.error("Error saving logs:", err);
      showToast("Failed to save logs to the server.", "error");
    }
  };

  const saveParameters = async (updatedParams: BiometricParameter[]) => {
    setParameters(updatedParams);
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: updatedParams }),
      });
      if (!res.ok) throw new Error("Failed to save parameters to server");
    } catch (err) {
      console.error("Error saving parameters:", err);
      showToast("Failed to save parameters to the server.", "error");
    }
  };

  const handleAddParameter = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newParamLabel.trim();
    if (!label) return;

    const id = "param_" + Date.now();
    const newParam: BiometricParameter = { id, label };

    const updated = [...parameters, newParam];
    saveParameters(updated);

    setPainLevels(prev => ({
      ...prev,
      [id]: 0,
    }));

    setNewParamLabel("");
    showToast(`Parameter "${label}" successfully added!`);
  };

  const handleRenameParameter = (id: string, newLabel: string) => {
    const updated = parameters.map(p => p.id === id ? { ...p, label: newLabel } : p);
    saveParameters(updated);
  };

  const handleDeleteParameter = (id: string) => {
    if (parameters.length <= 1) {
      showToast("You must keep at least one tracking parameter.", "error");
      return;
    }
    if (confirm(`Are you sure you want to stop tracking "${parameters.find(p => p.id === id)?.label || id}"? Existing historical logs won't be deleted, but this parameter will no longer be active.`)) {
      const updated = parameters.filter(p => p.id !== id);
      saveParameters(updated);

      setPainLevels(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (activePart === id) setActivePart(null);
      if (chartView === id) setChartView("all");
    }
  };

  const handleSliderChange = (part: keyof PainLevels, val: number) => {
    setPainLevels((prev) => ({
      ...prev,
      [part]: val,
    }));
  };

  // Submit today's log
  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;

    // Check if entry for this date already exists
    const existingIndex = logs.findIndex((l) => l.date === date);
    let updatedLogs = [...logs];

    if (existingIndex >= 0) {
      // Overwrite/Merge log
      updatedLogs[existingIndex] = {
        ...updatedLogs[existingIndex],
        painLevels: { ...painLevels },
        notes: notes,
      };
    } else {
      // Create new log entry
      const newEntry: LogEntry = {
        id: Date.now().toString(),
        date: date,
        painLevels: { ...painLevels },
        notes: notes,
      };
      updatedLogs.push(newEntry);
    }

    // Sort chronologically
    updatedLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    saveLogsToStorage(updatedLogs);
    setNotes("");
    setEditingId(null);

    // Pulse animation or feedback
    showToast(`Log successfully saved for ${date}!`, "success");
  };

  const handleDeleteLog = (id: string) => {
    if (confirm("Are you sure you want to delete this daily log entry?")) {
      const filtered = logs.filter((l) => l.id !== id);
      saveLogsToStorage(filtered);
    }
  };

  const handleEditLog = (entry: LogEntry) => {
    setPainLevels(entry.painLevels);
    setNotes(entry.notes);
    setDate(entry.date);
    setEditingId(entry.id);

    // Focus the inputs
    slidersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pain_tracking_data_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported) && imported.length > 0 && imported[0].painLevels) {
          saveLogsToStorage(imported);
          showToast(`Successfully imported ${imported.length} pain log entries!`, "success");
        } else {
          showToast("Invalid data format. Please upload a valid JSON file generated from this application.", "error");
        }
      } catch (err) {
        showToast("Error parsing JSON file.", "error");
      }
    };
    reader.readAsText(file);
  };

  // Get color styles for inputs based on rating
  const getSeverityStyles = (val: number) => {
    if (val === 0) return { bg: "bg-cyan-950/40", text: "text-cyan-400", border: "border-cyan-500/20" };
    if (val <= 3) return { bg: "bg-yellow-950/40", text: "text-yellow-400", border: "border-yellow-500/20" };
    if (val <= 6) return { bg: "bg-orange-950/40", text: "text-orange-400", border: "border-orange-500/20" };
    return { bg: "bg-red-950/40", text: "text-red-400", border: "border-red-500/20" };
  };

  // Process data for progression visualization
  const getChartDataForPart = (partKey: "average" | string) => {
    // Filter logs based on date time-range limits
    const numLogsToShow = timeRange === "7d" ? 7 : 30;
    const sortedLogs = [...logs].slice(-numLogsToShow);

    if (sortedLogs.length === 0) return [];

    const width = 500;
    const height = 220;
    const paddingX = 40;
    const paddingY = 30;

    return sortedLogs.map((log, index) => {
      let value = 0;
      if (partKey === "average") {
        let sum = 0;
        let count = 0;
        parameters.forEach(p => {
          if (log.painLevels && log.painLevels[p.id] !== undefined) {
            sum += log.painLevels[p.id];
            count++;
          }
        });
        value = count > 0 ? Number((sum / count).toFixed(1)) : 0;
      } else {
        value = (log.painLevels && log.painLevels[partKey]) ?? 0;
      }

      // X coordinate calculation
      const x = paddingX + (index * (width - 2 * paddingX)) / Math.max(1, sortedLogs.length - 1);
      // Y coordinate calculation (invert since 0 is at top in SVG coords)
      const y = height - paddingY - (value * (height - 2 * paddingY)) / 10;

      return { x, y, value, date: log.date };
    });
  };

  const isMultiLine = chartView === "all";

  const getRenderData = () => {
    if (isMultiLine) {
      return parameters.map((param, index) => ({
        key: param.id,
        points: getChartDataForPart(param.id),
        label: param.label,
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
      }));
    } else {
      const key = chartView;
      const points = getChartDataForPart(key);
      const isAverage = key === "average";
      const paramIndex = parameters.findIndex(p => p.id === key);
      const label = isAverage ? "Average Index" : (parameters[paramIndex]?.label || key);
      const color = isAverage ? "#22d3ee" : COLOR_PALETTE[paramIndex >= 0 ? paramIndex % COLOR_PALETTE.length : 0];
      return [{
        key,
        points,
        label,
        color,
      }];
    }
  };

  const chartLines = getRenderData();

  // Calculate current statistics
  const getStatistics = () => {
    if (logs.length === 0 || parameters.length === 0) {
      return { avgToday: 0, highestPart: "N/A", weeklyChange: "0%", trendStatus: "No Data" };
    }

    const latest = logs[logs.length - 1];

    // Average today
    let todaySum = 0;
    let todayCount = 0;
    parameters.forEach(p => {
      if (latest.painLevels && latest.painLevels[p.id] !== undefined) {
        todaySum += latest.painLevels[p.id];
        todayCount++;
      }
    });
    const avgToday = todayCount > 0 ? Number((todaySum / todayCount).toFixed(1)) : 0;

    // Highest Part
    let maxVal = -1;
    let highestParamLabel = "N/A";
    parameters.forEach(p => {
      const val = (latest.painLevels && latest.painLevels[p.id]) ?? 0;
      if (val > maxVal) {
        maxVal = val;
        highestParamLabel = p.label;
      }
    });

    // Weekly change trend calculation
    let weeklyChange = "0%";
    let trendStatus = "Stable";
    if (logs.length >= 7) {
      const pastLog = logs[logs.length - 7];

      let pastSum = 0;
      let pastCount = 0;
      parameters.forEach(p => {
        if (pastLog.painLevels && pastLog.painLevels[p.id] !== undefined) {
          pastSum += pastLog.painLevels[p.id];
          pastCount++;
        }
      });
      const pastAvg = pastCount > 0 ? pastSum / pastCount : 0;

      if (pastAvg > 0) {
        const changePercent = ((avgToday - pastAvg) / pastAvg) * 100;
        weeklyChange = `${Math.abs(Math.round(changePercent))}%`;
        trendStatus = changePercent < 0 ? "Improving" : changePercent > 0 ? "Elevating" : "Stable";
      }
    }

    return {
      avgToday,
      highestPart: highestParamLabel,
      weeklyChange,
      trendStatus,
    };
  };

  const stats = getStatistics();

  // Draw chart paths
  const getChartLinePath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  };

  const getChartAreaPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    const linePath = getChartLinePath(points);
    const height = 220;
    const paddingY = 30;
    return `${linePath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  };

  if (!mounted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#09090b] text-zinc-400 p-8">
        <div className="text-xl font-medium tracking-wide animate-pulse-slow">
          BOOTING BIOSENTRY NEURAL CORE...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-8">
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono tracking-widest text-zinc-500 uppercase">SYSTEM ACTIVE</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-400 to-indigo-500 bg-clip-text text-transparent">
            Pooja's Pain Tracking
          </h1>
          {/* <p className="text-sm text-zinc-400 mt-1">
            Holographic biometric monitoring of upper-body muscular dynamics
          </p> */}
        </div>

        {/* <div className="flex gap-3">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 cursor-pointer text-xs font-medium transition">
            <span>Import Logs</span>
            <input type="file" accept=".json" onChange={handleImportData} className="hidden" />

            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </label>
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 text-xs font-medium transition"
          >
            <span>Export Data</span>

            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
        </div> */}
      </header>

      {/* METRICS DASHBOARD GRID */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 flex flex-col">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Highest Severity Area</span>
          <span className="text-lg font-bold mt-3 text-red-400 truncate">{stats.highestPart}</span>
          <span className="text-xs text-zinc-500 mt-1">Requires focus and attention</span>
        </div>

        <div className="glass-panel p-4 flex flex-col">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Weekly Progression</span>
          <span className={`text-3xl font-black mt-2 ${stats.trendStatus === "Improving" ? "text-green-400" : stats.trendStatus === "Elevating" ? "text-red-400" : "text-yellow-400"}`}>
            {stats.weeklyChange}
          </span>
          <span className="text-xs text-zinc-500 mt-1">
            Status: <span className="font-semibold text-zinc-300">{stats.trendStatus}</span>
          </span>
        </div>

        <div className="glass-panel p-4 flex flex-col">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Recorded Days</span>
          <span className="text-3xl font-black mt-2 text-indigo-400">{logs.length} <span className="text-xs font-normal text-zinc-500">logs</span></span>
          <span className="text-xs text-zinc-500 mt-1">History of logged metrics</span>
        </div>
      </section>

      {/* HISTORICAL TIMELINE LOG */}
      <div className="glass-panel p-6 flex flex-col gap-4 w-full">
        <h2 className="text-xl font-bold text-zinc-100 pb-3 border-b border-zinc-800/60">Biometric Archives</h2>

        {logs.length === 0 ? (
          <div className="text-center py-8 text-xs text-zinc-500 font-mono uppercase">
            Zero Logs Committed. Add entries above.
          </div>
        ) : (
          <div className="overflow-x-auto w-full max-h-[600px] border border-zinc-800/60 rounded-xl">
            <table className="w-full text-left text-sm md:text-base font-mono border-collapse">
              <thead>
                <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-semibold sticky top-0 backdrop-blur z-20">
                  <th className="p-3 sticky left-0 bg-zinc-900 z-30 border-r border-zinc-800 min-w-[140px] max-w-[140px]">
                    Parameter
                  </th>
                  {[...logs].reverse().map((entry) => (
                    <th key={entry.id} className="p-3 text-center whitespace-nowrap min-w-[100px] border-r border-zinc-800/50">
                      {formatDateString(entry.date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {/* 1. Parameter Rows */}
                {parameters.map((param, index) => (
                  <tr key={param.id} className="hover:bg-zinc-900/30 transition-colors">
                    {/* Sticky Parameter Name */}
                    <td className="p-3 sticky left-0 bg-zinc-950 font-bold text-zinc-300 z-10 border-r border-zinc-800 min-w-[140px] max-w-[140px]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }} />
                        <span>{param.label}</span>
                      </span>
                    </td>
                    {/* Values for each date */}
                    {[...logs].reverse().map((entry) => {
                      const val = (entry.painLevels && entry.painLevels[param.id]) ?? 0;
                      const styles = getSeverityStyles(val);
                      return (
                        <td key={entry.id} className="p-3 text-center border-r border-zinc-800/40 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-bold ${styles.bg} ${styles.text} border ${styles.border}`}>
                            {val}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* 2. Notes Row */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-3 sticky left-0 bg-zinc-950 font-bold text-zinc-400 z-10 border-r border-zinc-800 min-w-[130px] max-w-[130px]">
                    Notes
                  </td>
                  {[...logs].reverse().map((entry) => (
                    <td key={entry.id} className="p-3 text-zinc-400 max-w-[200px] truncate italic border-r border-zinc-800/40" title={entry.notes}>
                      {entry.notes || "-"}
                    </td>
                  ))}
                </tr>

                {/* 3. Actions Row */}
                <tr className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-3 sticky left-0 bg-zinc-950 font-bold text-zinc-400 z-10 border-r border-zinc-800 min-w-[130px] max-w-[130px]">
                    Actions
                  </td>
                  {[...logs].reverse().map((entry) => (
                    <td key={entry.id} className="p-3 text-center border-r border-zinc-800/40">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditLog(entry)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition"
                          title="Edit entry"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" /></svg>
                        </button>
                        <button
                          onClick={() => handleDeleteLog(entry.id)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition"
                          title="Delete entry"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MAIN CONTENT SPLIT PANE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT COLUMN: DAILY LOGGER & LEGEND (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-8">

          {/* DAILY LOGGER PANEL */}
          <div ref={slidersSectionRef} className="glass-panel glass-panel-glow p-6 flex flex-col gap-6">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-800/60">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                  {/* Activity SVG */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                  {editingId ? "Edit Telemetry Log" : "Daily Biometric Input"}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsManagingParams(!isManagingParams)}
                  className="text-left text-cyan-500 hover:text-cyan-400 transition flex items-center cursor-pointer w-fit"
                  title={isManagingParams ? "Back to Sliders" : "Configure Tracking Inputs"}
                  aria-label={isManagingParams ? "Back to Sliders" : "Configure Tracking Inputs"}
                >
                  {isManagingParams ? (
                    <span className="text-xs font-mono flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                      Back to Sliders
                    </span>
                  ) : (
                    <span className="text-xs font-mono flex items-center gap-1.5">
                      {/* Cog icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      Edit
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Date:</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-cyan-500 transition"
                />
              </div>
            </div>

            {isManagingParams ? (
              <div className="flex flex-col gap-5">
                <div className="border-b border-zinc-800/60 pb-4">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Add Custom Parameter</h3>
                  <form onSubmit={handleAddParameter} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="E.g., Left Knee, Neck, Chest, Sleep Quality..."
                      value={newParamLabel}
                      onChange={(e) => setNewParamLabel(e.target.value)}
                      className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-cyan-500 transition placeholder-zinc-600"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow transition-all cursor-pointer whitespace-nowrap"
                    >
                      + Add Parameter
                    </button>
                  </form>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Edit Existing Parameters</h3>
                  <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {parameters.map((param, index) => (
                      <div key={param.id} className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/60 p-2.5 rounded-lg">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }} />
                        <input
                          type="text"
                          value={param.label}
                          onChange={(e) => handleRenameParameter(param.id, e.target.value)}
                          className="flex-1 bg-transparent text-[15px] text-zinc-200 outline-none border-b border-transparent focus:border-cyan-500 pb-0.5 transition"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteParameter(param.id)}
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800/80 transition"
                          title="Delete Parameter"
                        >
                          {/* Trash Icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveLog} className="flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parameters.map((param, index) => {
                    const val = painLevels[param.id] ?? 0;
                    const severity = getSeverityStyles(val);
                    const isActive = activePart === param.id;

                    return (
                      <div
                        key={param.id}
                        onClick={() => setActivePart(param.id)}
                        className={`flex flex-col gap-2 p-3 rounded-lg border transition-all cursor-pointer ${isActive
                          ? "border-cyan-500 bg-cyan-950/10 shadow-lg shadow-cyan-500/5 scale-[1.01]"
                          : "border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700/80"
                          }`}
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className={`font-semibold text-[15px] flex items-center gap-1.5 ${isActive ? "text-cyan-300" : "text-zinc-300"}`}>
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }} />
                            {param.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-mono font-bold ${severity.bg} ${severity.text} border ${severity.border}`}>
                            {val}/10
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[10px] text-zinc-500 font-mono">0</span>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            step="1"
                            value={val}
                            onChange={(e) => handleSliderChange(param.id, parseInt(e.target.value))}
                            className="flex-1 accent-cyan-400 bg-zinc-800 rounded-lg appearance-none h-1.5 cursor-pointer outline-none"
                          />
                          <span className="text-[10px] text-zinc-500 font-mono">10</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Notes Field */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-400">Daily Symptoms & Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="E.g., Stiffness after chest day, anterior deltoid felt tight during push-ups, slept awkwardly..."
                    rows={2}
                    className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 outline-none focus:border-cyan-500 transition resize-none placeholder-zinc-600"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setNotes("");
                        const resetLevels: Record<string, number> = {};
                        parameters.forEach(p => { resetLevels[p.id] = 0; });
                        setPainLevels(resetLevels);
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20 hover:scale-[1.02] transition-all flex items-center gap-2"
                  >
                    {/* Save Check Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    <span>{editingId ? "Update Telemetry" : "Commit Biometric Log"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>


        </div>

        {/* RIGHT COLUMN: PROGRESSION & ARCHIVES (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-8">

          {/* PROGRESSION ANALYTICS CHART */}
          <div className="glass-panel p-6 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-3 border-b border-zinc-800/60">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">Telemetry Progression</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Analytic visual trends of pain signals</p>
              </div>

              {/* Selectors for view & timescale */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={chartView}
                  onChange={(e) => setChartView(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="all">All Parameters (6 Lines)</option>
                  <option value="average">Average Index</option>
                  {parameters.map((param) => (
                    <option key={param.id} value={param.id}>
                      {param.label}
                    </option>
                  ))}
                </select>

                <div className="flex bg-zinc-900 rounded border border-zinc-800 p-0.5 text-xs">
                  <button
                    onClick={() => setTimeRange("7d")}
                    className={`px-3 py-1 rounded transition ${timeRange === "7d" ? "bg-cyan-600 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    7 Logs
                  </button>
                  <button
                    onClick={() => setTimeRange("30d")}
                    className={`px-3 py-1 rounded transition ${timeRange === "30d" ? "bg-cyan-600 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    30 Logs
                  </button>
                </div>
              </div>
            </div>

            {/* SVG Interactive Chart Canvas */}
            <div className="relative w-full h-[220px] bg-zinc-950/40 rounded-lg border border-zinc-900 overflow-hidden mt-2">
              {chartLines[0] && chartLines[0].points.length > 0 ? (
                <svg className="w-full h-full" viewBox="0 0 500 220" preserveAspectRatio="none">
                  {/* Filled Gradient Area (Only for single line view to avoid mess) */}
                  {!isMultiLine && chartLines[0] && (
                    <>
                      <defs>
                        <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartLines[0].color} stopOpacity="0.4" />
                          <stop offset="100%" stopColor={chartLines[0].color} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path d={getChartAreaPath(chartLines[0].points)} fill="url(#chart-grad)" className="transition-all duration-300" />
                    </>
                  )}

                  {/* Horizontal Grid lines */}
                  {Array.from({ length: 6 }).map((_, i) => {
                    const yVal = 30 + (i * 160) / 5;
                    const label = 10 - i * 2;
                    return (
                      <g key={i} className="opacity-20">
                        <line x1="40" y1={yVal} x2="460" y2={yVal} stroke="#ffffff" strokeWidth="0.5" strokeDasharray="3" />
                        <text x="15" y={yVal + 4} fill="#ffffff" className="text-[10px] font-mono select-none">{label}</text>
                      </g>
                    );
                  })}

                  {/* Connecting Lines */}
                  {chartLines.map((line) => (
                    <path
                      key={line.key}
                      d={getChartLinePath(line.points)}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={isMultiLine ? "2.5" : "3.5"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300"
                    />
                  ))}

                  {/* Interactive Nodes */}
                  {chartLines.map((line) => (
                    <g key={`nodes-${line.key}`}>
                      {line.points.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r={isMultiLine ? "3.5" : "5"}
                          onMouseEnter={() => setHoveredPoint({
                            ...pt,
                            label: line.label,
                            color: line.color,
                          })}
                          onMouseLeave={() => setHoveredPoint(null)}
                          fill={line.color}
                          className="stroke-zinc-950 stroke-[2px] cursor-pointer hover:scale-125 transition-transform"
                        />
                      ))}
                    </g>
                  ))}

                  {/* X Axis dates label */}
                  {chartLines[0] && chartLines[0].points.map((pt, i) => {
                    const pointsCount = chartLines[0].points.length;
                    const shouldShowLabel = i === 0 || i === pointsCount - 1 || (pointsCount > 5 && i === Math.floor(pointsCount / 2));
                    if (!shouldShowLabel) return null;

                    // format to MM/DD
                    let label = pt.date;
                    let dateObj: Date | null = null;
                    if (pt.date.includes("-")) {
                      const dateParts = pt.date.split("-");
                      if (dateParts.length === 3) {
                        const [year, month, day] = dateParts.map(Number);
                        dateObj = new Date(year, month - 1, day);
                      }
                    } else {
                      dateObj = new Date(pt.date);
                    }
                    if (dateObj && !isNaN(dateObj.getTime())) {
                      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
                      const d = String(dateObj.getDate()).padStart(2, "0");
                      label = `${m}/${d}`;
                    }

                    return (
                      <text
                        key={i}
                        x={pt.x}
                        y="210"
                        textAnchor="middle"
                        fill="#71717a"
                        className="text-[9px] font-mono select-none"
                      >
                        {label}
                      </text>
                    );
                  })}
                </svg>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500 font-mono">
                  NO CHRONOLOGICAL BIOMETRIC DATA TO PLOT
                </div>
              )}

              {/* Floating Chart Tooltip */}
              {hoveredPoint && (
                <div
                  style={{
                    position: "absolute",
                    left: `${Math.min(380, Math.max(10, (hoveredPoint.x / 500) * 100))}%`,
                    top: `${Math.min(150, Math.max(10, hoveredPoint.y - 45))}px`,
                    transform: "translateX(-40%)",
                  }}
                  className="bg-zinc-900 border border-zinc-700/80 rounded px-2.5 py-1 text-[11px] shadow-xl text-zinc-100 backdrop-blur pointer-events-none z-10 font-mono leading-tight"
                >
                  <div className="font-bold flex items-center gap-1.5" style={{ color: hoveredPoint.color || "#22d3ee" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hoveredPoint.color || "#22d3ee" }} />
                    <span>{hoveredPoint.label || "Pain Index"}: {hoveredPoint.value}</span>
                  </div>
                  <div className="text-zinc-500 text-[9px] mt-0.5">{hoveredPoint.date}</div>
                </div>
              )}
            </div>

            {/* Parameter Color Legend for Multi-Line View */}
            {isMultiLine && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-2 px-2 text-[10px] font-mono text-zinc-400">
                {parameters.map((param, index) => (
                  <div key={param.id} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }} />
                    <span>{param.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>



      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-cyan-500/30 bg-zinc-950/90 backdrop-blur-md shadow-2xl shadow-cyan-500/10 text-xs font-mono font-medium text-cyan-400 animate-slide-up">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
