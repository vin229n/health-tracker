"use client";

import React, { useState, useEffect, useRef } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

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
  energyLevel?: number;
}

interface PeriodLogEntry {
  date: string; // YYYY-MM-DD local format
  flow?: "none" | "spotting" | "light" | "medium" | "heavy" | "started";
  isPeriodStart?: boolean;
  symptoms: string[];
  notes: string;
  moodSwings?: string[];
  moodLevels?: string[];
  energyLevel?: number;
}

interface PeriodSettings {
  cycleLength: number;
  periodLength: number;
}

interface WeatherData {
  temp: number;
  condition: string;
  icon: string;
  humidity: number;
  pressure: number;
  city: string;
  advice: string;
  loading: boolean;
}

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

const SYMPTOM_OPTIONS = [
  "Cramps",
  "Headache",
  "Bloating",
  "Fatigue",
  "Breast Tenderness",
  "Backache",
  "Acne",
  "Nausea",
  "Insomnia",
  "Joint Stiffness",
];

const MOOD_OPTIONS = [
  "Calm 😌",
  "Energetic ⚡",
  "Focused 🎯",
  "Happy 😊",
  "Anxious 😰",
  "Irritable 😤",
  "Low Energy 🔋",
  "Sad 😢",
  "Overwhelmed 🤯",
  "Mood Swings 🎢",
];

// Helper to format date strings for display (e.g. "Jul 10")
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

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[dateObj.getMonth()];
  const dayNum = dateObj.getDate();
  return `${monthName} ${dayNum}`;
};

// Helper for local YYYY-MM-DD representation
const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper to determine period start dates based on flow logs
const getPeriodStartDates = (pLogs: PeriodLogEntry[]): Date[] => {
  const activeDays = pLogs
    .filter((log) => log.flow && log.flow !== "none")
    .map((log) => {
      const [y, m, d] = log.date.split("-").map(Number);
      return new Date(y, m - 1, d);
    })
    .sort((a, b) => a.getTime() - b.getTime());

  if (activeDays.length === 0) return [];

  const startDates: Date[] = [];
  let prevTime: number | null = null;

  activeDays.forEach((currentDate) => {
    const currentTime = currentDate.getTime();
    if (prevTime === null) {
      startDates.push(currentDate);
    } else {
      const diffDays = (currentTime - prevTime) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) {
        startDates.push(currentDate);
      }
    }
    prevTime = currentTime;
  });

  return startDates;
};

// Helper to calculate cycle day and phase for a target date
const getCycleInfoForDate = (targetDate: Date, startDates: Date[], settings: PeriodSettings) => {
  if (startDates.length === 0) {
    return {
      phase: "unknown" as const,
      cycleDay: 0,
      phaseName: "No Cycle Data",
      description: "Log your period in the Input tab to start tracking cycle phases.",
      color: "#71717a",
      bgClass: "bg-zinc-950/40",
      borderClass: "border-zinc-800/60",
      textClass: "text-zinc-400 font-mono",
    };
  }

  const pastStarts = startDates.filter((s) => s.getTime() <= targetDate.getTime());
  let S: Date;
  if (pastStarts.length > 0) {
    S = pastStarts[pastStarts.length - 1];
  } else {
    S = startDates[0];
  }

  const periodLength = settings.periodLength;

  const diffMs = targetDate.getTime() - S.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const cycleDay = diffDays >= 0 ? diffDays + 1 : 0;

  if (cycleDay === 0) {
    return {
      phase: "unknown" as const,
      cycleDay: 0,
      phaseName: "No Cycle Data",
      description: "Log your period in the Input tab to start tracking cycle phases.",
      color: "#71717a",
      bgClass: "bg-zinc-950/40",
      borderClass: "border-zinc-800/60",
      textClass: "text-zinc-400 font-mono",
    };
  }

  let phase: "menstruation" | "follicular" | "ovulation" | "luteal" = "luteal";
  let phaseName = "";
  let description = "";
  let color = "";
  let bgClass = "";
  let borderClass = "";
  let textClass = "";

  if (cycleDay <= periodLength) {
    phase = "menstruation";
    phaseName = "Menstruation Phase";
    description = "Estrogen & Progesterone are low. Focus on rest, hydration, and light body recovery.";
    color = "#f43f5e";
    bgClass = "bg-rose-950/40";
    borderClass = "border-rose-500/20";
    textClass = "text-rose-400";
  } else if (cycleDay <= 13) {
    phase = "follicular";
    phaseName = "Follicular Phase";
    description = "Estrogen is rising. Physical energy, stamina, and mental clarity peak during this phase.";
    color = "#f97316";
    bgClass = "bg-orange-950/40";
    borderClass = "border-orange-500/20";
    textClass = "text-orange-400";
  } else if (cycleDay <= 18) {
    phase = "ovulation";
    phaseName = "Ovulation Phase";
    description = "Estrogen peaks. High vitality, sharp focus, and peak physical performance window.";
    color = "#a855f7";
    bgClass = "bg-purple-950/40";
    borderClass = "border-purple-500/20";
    textClass = "text-purple-400";
  } else {
    phase = "luteal";
    phaseName = "Luteal Phase";
    description = "Progesterone dominates. Pre-menstrual window where joint stiffness, cramps, or mood shifts may occur.";
    color = "#3b82f6";
    bgClass = "bg-blue-950/40";
    borderClass = "border-blue-500/20";
    textClass = "text-blue-400";
  }

  return {
    phase,
    cycleDay,
    phaseName,
    description,
    color,
    bgClass,
    borderClass,
    textClass,
  };
};

const deduplicateParameters = (params: BiometricParameter[]): BiometricParameter[] => {
  if (!Array.isArray(params)) return [];
  const unique: BiometricParameter[] = [];
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();

  params.forEach((p) => {
    if (!p || !p.id || !p.label) return;
    const cleanId = String(p.id).trim();
    const cleanLabel = String(p.label).trim().replace(/\s+/g, " ");
    const normLabel = cleanLabel.toLowerCase();

    if (["vital", "period", "weather", "energy"].includes(normLabel)) return;

    if (!seenIds.has(cleanId) && !seenLabels.has(normLabel)) {
      seenIds.add(cleanId);
      seenLabels.add(normLabel);
      unique.push({ id: cleanId, label: cleanLabel });
    }
  });

  return unique;
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [parameters, setParameters] = useState<BiometricParameter[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "input">("dashboard");

  // Pain Telemetry Input states
  const [painLevels, setPainLevels] = useState<PainLevels>({});
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>("");
  const [isManagingParams, setIsManagingParams] = useState(false);
  const [newParamLabel, setNewParamLabel] = useState("");

  // Menstrual & Mood states
  const [periodLogs, setPeriodLogs] = useState<PeriodLogEntry[]>([]);
  const [periodSettings, setPeriodSettings] = useState<PeriodSettings>({
    cycleLength: 28,
    periodLength: 5,
  });

  // Calendar states
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => getLocalDateString());

  // Input tab state variables
  const [flow, setFlow] = useState<PeriodLogEntry["flow"]>("none");
  const [isPeriodStart, setIsPeriodStart] = useState<boolean>(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [periodNotes, setPeriodNotes] = useState("");
  const [moodSwings, setMoodSwings] = useState<string[]>([]);
  const [moodLevels, setMoodLevels] = useState<string[]>([]);
  const [inputEnergy, setInputEnergy] = useState<number>(7);

  // Correlation tab checkboxes
  const [selectedCorrelationParams, setSelectedCorrelationParams] = useState<string[]>([]);

  // References and Notification states
  const slidersSectionRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  // Live Weather State
  const [weather, setWeather] = useState<WeatherData>({
    temp: 24,
    condition: "Partly Cloudy",
    icon: "🌤️",
    humidity: 62,
    pressure: 1013,
    city: "Local",
    advice: "Mild atmospheric pressure - light joint care advised today.",
    loading: true,
  });
  const [weatherLogs, setWeatherLogs] = useState<any[]>([]);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    const fetchWeatherForCoords = async (lat: number, lon: number, cityName?: string) => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,surface_pressure`
        );
        if (!res.ok) throw new Error("Weather fetch failed");
        const data = await res.json();
        const current = data.current;
        const temp = Math.round(current.temperature_2m);
        const humidity = current.relative_humidity_2m;
        const pressure = Math.round(current.surface_pressure);
        const code = current.weather_code;

        let condition = "Clear Sky";
        let icon = "☀️";
        let advice = "Great weather conditions today. Maintain regular activity.";

        if (code === 0) {
          condition = "Clear Sky";
          icon = "☀️";
          advice = "Bright & clear! Ideal day for light outdoor mobility.";
        } else if (code >= 1 && code <= 3) {
          condition = "Partly Cloudy";
          icon = "🌤️";
          advice = "Comfortable weather. Great for routine body recovery.";
        } else if (code === 45 || code === 48) {
          condition = "Foggy";
          icon = "🌫️";
          advice = "High moisture & fog. Keep joints warm and dry.";
        } else if (code >= 51 && code <= 67) {
          condition = "Rainy";
          icon = "🌧️";
          advice = "Rain & humidity change. Warm compression recommended for stiff joints.";
        } else if (code >= 71 && code <= 77) {
          condition = "Snowy";
          icon = "❄️";
          advice = "Cold weather window. Keep indoor environment comfortably warm.";
        } else if (code >= 80 && code <= 82) {
          condition = "Rain Showers";
          icon = "🌦️";
          advice = "Damp weather. Stay hydrated & warm.";
        } else if (code >= 95) {
          condition = "Thunderstorm";
          icon = "⛈️";
          advice = "Barometric pressure drop detected. Rest if joint pain elevates.";
        }

        setWeather({
          temp,
          condition,
          icon,
          humidity,
          pressure,
          city: cityName || "Local Area",
          advice,
          loading: false,
        });

        // Automatically sync today's weather log to Google Sheets / API
        const todayStr = getLocalDateString();
        const weatherEntry = { date: todayStr, temp, condition, humidity, pressure, advice };
        setWeatherLogs((prev) => {
          const idx = prev.findIndex((w) => w.date === todayStr);
          let updated: any[];
          if (idx >= 0) {
            updated = [...prev];
            updated[idx] = weatherEntry;
          } else {
            updated = [...prev, weatherEntry];
          }
          fetch("/api/data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weatherLogs: updated }),
          }).catch((e) => console.error("Error saving weather log:", e));
          return updated;
        });
      } catch (err) {
        console.error("Error fetching weather:", err);
        setWeather((prev) => ({ ...prev, loading: false }));
      }
    };

    // Track Bangalore Weather (Latitude: 12.9716, Longitude: 77.5946)
    const BANGALORE_LAT = 12.9716;
    const BANGALORE_LON = 77.5946;

    fetchWeatherForCoords(BANGALORE_LAT, BANGALORE_LON, "Bangalore");
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load Initial Data
  useEffect(() => {
    const todayStr = getLocalDateString();
    setDate(todayStr);

    fetch("/api/data")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch data");
        return res.json();
      })
      .then((data) => {
        const rawParams = data.parameters || [];
        const uniqueParams = deduplicateParameters(rawParams);
        setParameters(uniqueParams);
        const rawLogs = data.logs || [];
        const uniqueLogs: LogEntry[] = [];
        const seenLogDates = new Set<string>();
        rawLogs.forEach((l: LogEntry) => {
          if (l && l.date) {
            const dateKey = l.date.includes("GMT") ? getLocalDateString(new Date(l.date)) : l.date;
            if (!seenLogDates.has(dateKey)) {
              seenLogDates.add(dateKey);
              uniqueLogs.push(l);
            }
          }
        });
        setLogs(uniqueLogs);
        setPeriodLogs(data.periodLogs || []);
        if (data.weatherLogs) {
          setWeatherLogs(data.weatherLogs);
        }
        if (data.periodSettings) {
          setPeriodSettings(data.periodSettings);
        }

        if (uniqueParams.length > 0) {
          setSelectedCorrelationParams(uniqueParams.slice(0, 4).map((p: any) => p.id));
        }

        setMounted(true);
      })
      .catch((err) => {
        console.error("Error loading server data:", err);
        setParameters([]);
        setLogs([]);
        setPeriodLogs([]);
        setMounted(true);
      });
  }, []);

  // Sync sliders state with parameters
  useEffect(() => {
    if (parameters.length > 0) {
      setPainLevels((prev) => {
        const next = { ...prev };
        parameters.forEach((p) => {
          if (next[p.id] === undefined) {
            next[p.id] = 0;
          }
        });
        return next;
      });
    }
  }, [parameters]);

  // Sync inputs when selected calendar date changes
  useEffect(() => {
    if (mounted) {
      setDate(selectedCalendarDate);

      const log = periodLogs.find((l) => l.date === selectedCalendarDate);
      if (log) {
        setFlow(log.flow || "none");
        setIsPeriodStart(!!log.isPeriodStart || log.flow === "started");
        setSelectedSymptoms(log.symptoms || []);
        setPeriodNotes(log.notes || "");
        setMoodSwings(log.moodSwings || []);
        setMoodLevels(log.moodLevels || []);
        setInputEnergy(log.energyLevel !== undefined ? log.energyLevel : 7);
      } else {
        setFlow("none");
        setIsPeriodStart(false);
        setSelectedSymptoms([]);
        setPeriodNotes("");
        setMoodSwings([]);
        setMoodLevels([]);
        setInputEnergy(7);
      }

      // Also sync biometric logs for this date into pain levels & notes
      const bioLog = logs.find((l) => {
        const logDate = l.date.includes("GMT") ? getLocalDateString(new Date(l.date)) : l.date;
        return logDate === selectedCalendarDate;
      });
      if (bioLog) {
        setPainLevels(bioLog.painLevels || {});
        setNotes(bioLog.notes || "");
        setEditingId(bioLog.id || null);
      } else {
        setPainLevels((prev) => {
          const reset: PainLevels = {};
          parameters.forEach((p) => (reset[p.id] = 0));
          return reset;
        });
        setNotes("");
        setEditingId(null);
      }
    }
  }, [selectedCalendarDate, periodLogs, logs, mounted, parameters]);

  // Save actions
  const saveLogsToStorage = async (updatedLogs: LogEntry[]) => {
    setLogs(updatedLogs);
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: updatedLogs }),
      });
      if (!res.ok) throw new Error("Failed to save logs");
    } catch (err) {
      console.error("Error saving logs:", err);
      showToast("Failed to save logs to server.", "error");
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
      if (!res.ok) throw new Error("Failed to save parameters");
    } catch (err) {
      console.error("Error saving parameters:", err);
      showToast("Failed to save parameters.", "error");
    }
  };

  const savePeriodLogsToStorage = async (updatedPeriodLogs: PeriodLogEntry[]) => {
    setPeriodLogs(updatedPeriodLogs);
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodLogs: updatedPeriodLogs }),
      });
      if (!res.ok) throw new Error("Failed to save period logs");
    } catch (err) {
      console.error("Error saving period logs:", err);
      showToast("Failed to save period logs.", "error");
    }
  };

  const handleAddParameter = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newParamLabel.trim().replace(/\s+/g, " ");
    if (!label) return;

    const normLabel = label.toLowerCase();
    if (["vital", "period", "weather", "energy"].includes(normLabel)) {
      showToast("Cannot use vital, period, weather, or energy as a biometric parameter.", "error");
      return;
    }

    const exists = parameters.some(
      (p) => p.label.trim().replace(/\s+/g, " ").toLowerCase() === normLabel
    );

    if (exists) {
      showToast(`Parameter "${label}" already exists!`, "error");
      setNewParamLabel("");
      return;
    }

    const id = "param_" + Date.now();
    const newParam: BiometricParameter = { id, label };
    const updated = [...parameters, newParam];
    saveParameters(updated);

    setPainLevels((prev) => ({ ...prev, [id]: 0 }));
    setNewParamLabel("");
    showToast(`Added parameter "${label}"`);
  };

  const handleSaveEditedParameter = (id: string) => {
    const label = editingLabel.trim().replace(/\s+/g, " ");
    if (!label) {
      showToast("Parameter label cannot be empty.", "error");
      return;
    }

    const normLabel = label.toLowerCase();
    if (["vital", "period", "weather", "energy"].includes(normLabel)) {
      showToast("Cannot use vital, period, weather, or energy as a biometric parameter.", "error");
      return;
    }

    const exists = parameters.some(
      (p) => p.id !== id && p.label.trim().replace(/\s+/g, " ").toLowerCase() === normLabel
    );

    if (exists) {
      showToast(`Parameter "${label}" already exists!`, "error");
      return;
    }

    const updated = parameters.map((p) => (p.id === id ? { ...p, label } : p));
    saveParameters(updated);
    setEditingId(null);
    setEditingLabel("");
    showToast(`Updated parameter label to "${label}"`);
  };

  const handleDeleteParameter = (id: string) => {
    if (parameters.length <= 1) {
      showToast("Must keep at least one parameter.", "error");
      return;
    }
    if (confirm(`Remove parameter "${parameters.find((p) => p.id === id)?.label || id}"?`)) {
      const updated = parameters.filter((p) => p.id !== id);
      saveParameters(updated);
      setPainLevels((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleSliderChange = (part: keyof PainLevels, val: number) => {
    setPainLevels((prev) => ({ ...prev, [part]: val }));
  };

  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;

    const existingIndex = logs.findIndex((l) => {
      const logDate = l.date.includes("GMT") ? getLocalDateString(new Date(l.date)) : l.date;
      return logDate === date;
    });

    let updatedLogs = [...logs];

    if (existingIndex >= 0) {
      updatedLogs[existingIndex] = {
        ...updatedLogs[existingIndex],
        painLevels: { ...painLevels },
        notes: notes,
      };
    } else {
      const newEntry: LogEntry = {
        id: Date.now().toString(),
        date: date,
        painLevels: { ...painLevels },
        notes: notes,
      };
      updatedLogs.push(newEntry);
    }

    updatedLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    saveLogsToStorage(updatedLogs);
    setNotes("");
    setEditingId(null);
    showToast(`Daily biometric log saved for ${date}!`, "success");
  };

  const handleTogglePeriodStart = () => {
    const nextStart = !isPeriodStart;
    setIsPeriodStart(nextStart);

    const existingIndex = periodLogs.findIndex((l) => l.date === selectedCalendarDate);
    let updatedPeriodLogs = [...periodLogs];

    if (existingIndex >= 0) {
      updatedPeriodLogs[existingIndex] = {
        ...updatedPeriodLogs[existingIndex],
        isPeriodStart: nextStart,
        flow: nextStart ? "started" : "none",
      };
    } else {
      updatedPeriodLogs.push({
        date: selectedCalendarDate,
        isPeriodStart: nextStart,
        flow: nextStart ? "started" : "none",
        symptoms: [],
        notes: "",
        moodSwings: [],
        moodLevels: [],
        energyLevel: inputEnergy,
      });
    }

    savePeriodLogsToStorage(updatedPeriodLogs);
    showToast(
      nextStart
        ? `Marked period start for ${selectedCalendarDate}`
        : `Removed period start marker for ${selectedCalendarDate}`
    );
  };

  const handleSavePeriodLog = (e: React.FormEvent) => {
    e.preventDefault();
    const existingIndex = periodLogs.findIndex((l) => l.date === selectedCalendarDate);
    let updatedPeriodLogs = [...periodLogs];

    if (existingIndex >= 0) {
      const existing = updatedPeriodLogs[existingIndex];
      updatedPeriodLogs[existingIndex] = {
        ...existing,
        symptoms: selectedSymptoms,
        notes: periodNotes,
        moodSwings: moodSwings,
        moodLevels: moodLevels,
        energyLevel: inputEnergy,
      };
    } else {
      updatedPeriodLogs.push({
        date: selectedCalendarDate,
        isPeriodStart: isPeriodStart,
        flow: isPeriodStart ? "started" : "none",
        symptoms: selectedSymptoms,
        notes: periodNotes,
        moodSwings: moodSwings,
        moodLevels: moodLevels,
        energyLevel: inputEnergy,
      });
    }

    savePeriodLogsToStorage(updatedPeriodLogs);
    showToast(`Saved symptoms & vitality notes for ${selectedCalendarDate}`);
  };

  const handleCorrelationParamToggle = (paramId: string) => {
    if (selectedCorrelationParams.includes(paramId)) {
      if (selectedCorrelationParams.length === 1) {
        showToast("Select at least one metric to visualize.", "info");
        return;
      }
      setSelectedCorrelationParams((prev) => prev.filter((id) => id !== paramId));
    } else {
      setSelectedCorrelationParams((prev) => [...prev, paramId]);
    }
  };

  const toggleSymptom = (symptom: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  };

  const toggleMood = (mood: string) => {
    setMoodLevels((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]
    );
  };

  const getSeverityStyles = (val: number) => {
    if (val === 0) return { bg: "bg-cyan-950/40", text: "text-cyan-400", border: "border-cyan-500/20" };
    if (val <= 3) return { bg: "bg-yellow-950/40", text: "text-yellow-400", border: "border-yellow-500/20" };
    if (val <= 6) return { bg: "bg-orange-950/40", text: "text-orange-400", border: "border-orange-500/20" };
    return { bg: "bg-red-950/40", text: "text-red-400", border: "border-red-500/20" };
  };

  // Stats calculation
  const stats = (() => {
    if (logs.length === 0 || parameters.length === 0) {
      return { avgToday: 0, highestPart: "N/A", weeklyChange: "0%", trendStatus: "No Data" };
    }
    const latest = logs[logs.length - 1];
    let todaySum = 0,
      todayCount = 0;
    parameters.forEach((p) => {
      if (latest.painLevels && latest.painLevels[p.id] !== undefined) {
        todaySum += latest.painLevels[p.id];
        todayCount++;
      }
    });
    const avgToday = todayCount > 0 ? Number((todaySum / todayCount).toFixed(1)) : 0;
    let maxVal = -1,
      highestParamLabel = "N/A";
    parameters.forEach((p) => {
      const val = (latest.painLevels && latest.painLevels[p.id]) ?? 0;
      if (val > maxVal) {
        maxVal = val;
        highestParamLabel = p.label;
      }
    });
    let weeklyChange = "0%",
      trendStatus = "Stable";
    if (logs.length >= 7) {
      const pastLog = logs[logs.length - 7];
      let pastSum = 0,
        pastCount = 0;
      parameters.forEach((p) => {
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
    return { avgToday, highestPart: highestParamLabel, weeklyChange, trendStatus };
  })();

  // Cycle calculations
  const startDates = getPeriodStartDates(periodLogs);
  const lmpDate = startDates.length > 0 ? startDates[startDates.length - 1] : null;
  const todayDateObj = new Date();
  todayDateObj.setHours(0, 0, 0, 0);
  const cycleInfoToday = getCycleInfoForDate(todayDateObj, startDates, periodSettings);

  // Energy & Weather calculations
  const currentEnergy = inputEnergy !== undefined ? inputEnergy : 8;
  const energyPercent = currentEnergy * 10;

  // Calendar Helpers
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };
  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const cyclePercent = lmpDate && cycleInfoToday.cycleDay > 0
    ? Math.min(100, Math.max(0, (cycleInfoToday.cycleDay / 28) * 100))
    : 0;

  // Generate last 30 continuous calendar days ending today for clear daily tracking
  const continuousCalendarDates = (() => {
    const dates: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(getLocalDateString(d));
    }
    return dates;
  })();

  const datesFormattedForDisplay = continuousCalendarDates.map((d) => formatDateString(d));

  const correlationChartOptions: Highcharts.Options = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      style: { fontFamily: "var(--font-geist-mono), sans-serif" },
      height: 360,
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: {
      itemStyle: { color: "#e4e4e7", fontSize: "12px", fontWeight: "bold" },
      itemHoverStyle: { color: "#ffffff" },
    },
    xAxis: {
      categories: datesFormattedForDisplay,
      labels: {
        style: { color: "#a1a1aa", fontSize: "11px", fontWeight: "600" },
        rotation: -45,
      },
      lineColor: "#3f3f46",
      tickColor: "#3f3f46",
      plotLines: continuousCalendarDates
        .map((dateStr, idx) => {
          const isStart = startDates.some((sDate) => getLocalDateString(sDate) === dateStr);
          if (!isStart) return null;
          return {
            color: "#ec4899",
            dashStyle: "ShortDash" as const,
            width: 2,
            value: idx,
            zIndex: 5,
            label: {
              text: "🩸 Period Start",
              style: {
                color: "#f472b6",
                fontWeight: "bold",
                fontSize: "10px",
              },
              rotation: 0,
              y: -10,
            },
          };
        })
        .filter(Boolean) as Highcharts.XAxisPlotLinesOptions[],
    },
    yAxis: {
      title: {
        text: "Pain Level (0 to 10)",
        style: { color: "#38bdf8", fontSize: "12px", fontWeight: "bold" },
      },
      min: 0,
      max: 10,
      gridLineColor: "#27272a",
      labels: { style: { color: "#a1a1aa", fontSize: "11px" } },
    },
    tooltip: {
      shared: true,
      backgroundColor: "rgba(9, 9, 11, 0.95)",
      borderColor: "#3f3f46",
      borderRadius: 12,
      style: { color: "#f4f4f5", fontSize: "12px" },
    },
    plotOptions: {
      column: {
        borderRadius: 4,
        borderWidth: 0,
        groupPadding: 0.1,
        pointPadding: 0.02,
      },
    },
    series: [
      ...parameters
        .filter((p) => selectedCorrelationParams.includes(p.id))
        .map((p, idx) => ({
          name: p.label,
          type: "column" as const,
          data: continuousCalendarDates.map((dateStr) => {
            const entry = logs.find((l) => {
              const logDate = l.date.includes("GMT") ? getLocalDateString(new Date(l.date)) : l.date;
              return logDate === dateStr;
            });
            return entry && entry.painLevels && entry.painLevels[p.id] !== undefined
              ? entry.painLevels[p.id]
              : 0;
          }),
          color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
          tooltip: { valueSuffix: " / 10 Pain" },
        })),
      {
        name: "Period Start Date",
        type: "scatter" as const,
        color: "#ec4899",
        marker: {
          symbol: "circle",
          radius: 6,
          fillColor: "#ec4899",
          lineColor: "#ffffff",
          lineWidth: 2,
        },
        data: continuousCalendarDates
          .map((dateStr, idx) => {
            const isStart = startDates.some((sDate) => getLocalDateString(sDate) === dateStr);
            return isStart ? { x: idx, y: 0, name: formatDateString(dateStr) } : null;
          })
          .filter((item): item is { x: number; y: number; name: string } => item !== null),
        tooltip: {
          headerFormat: "",
          pointFormat: "🩸 <b>Period Started</b> on {point.name}",
        },
      },
    ],
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-8 text-zinc-100">
      {/* HEADER WITH TWO TABS SWITCH */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-500/50" />
            <span className="text-xs font-mono tracking-widest text-zinc-400 uppercase">SYSTEM ONLINE</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Pooja's Health Tracker
          </h1>
        </div>

        {/* TAB CONTROLS */}
        <div className="flex bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-2xl gap-1.5 shadow-xl">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2.5 ${activeTab === "dashboard"
              ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10"
              : "text-zinc-400 hover:text-zinc-200 border border-transparent"
              }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab("input")}
            className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2.5 ${activeTab === "input"
              ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10"
              : "text-zinc-400 hover:text-zinc-200 border border-transparent"
              }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            <span>Daily Input & Logs</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* TAB 1: DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === "dashboard" && (
        <div className="flex flex-col gap-8 animate-fade-in">
          {/* TOP SUMMARY CARDS GRID (CURRENT STATUS, WEATHER, ENERGY) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* CARD 1: CURRENT STATUS & HIGHEST PAIN */}
            <div className="glass-panel p-5 flex flex-col justify-between relative overflow-hidden border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Current Pain Status</span>
                <span className="h-2 w-2 rounded-full bg-red-400 animate-ping" />
              </div>
              <div className="my-3">
                <div className="text-2xl font-black text-red-400 truncate">{stats.highestPart}</div>
                <div className="text-xs text-zinc-400 mt-1">Today's Avg Severity: <span className="text-zinc-200 font-bold">{stats.avgToday}/10</span></div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60 text-xs">
                <span className="text-zinc-500">Weekly Trend</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded ${stats.trendStatus === "Improving" ? "bg-emerald-950/60 text-emerald-400" : stats.trendStatus === "Elevating" ? "bg-red-950/60 text-red-400" : "bg-yellow-950/60 text-yellow-400"}`}>
                  {stats.weeklyChange} ({stats.trendStatus})
                </span>
              </div>
            </div>

            {/* CARD 2: WEATHER DETAILS */}
            <div className="glass-panel p-5 flex flex-col justify-between relative border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Weather</span>
                  {weather.city && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 text-amber-400 font-mono">
                      {weather.city}
                    </span>
                  )}
                </div>
                <span className="text-xl">{weather.icon}</span>
              </div>
              <div className="my-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-amber-300">
                    {weather.loading ? "--" : `${weather.temp}°C`}
                  </span>
                  <span className="text-xs text-zinc-400">{weather.condition}</span>
                </div>
                <div className="flex gap-4 text-xs text-zinc-400 mt-2 font-mono">
                  <span>💧 Humidity: {weather.humidity}%</span>
                  <span>hPa: {weather.pressure}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800/60 text-[11px] text-amber-400/90 font-medium">
                💡 {weather.advice}
              </div>
            </div>

            {/* CARD 3: ENERGY & VITALITY LEVELS */}
            <div className="glass-panel p-5 flex flex-col justify-between relative border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Energy & Vitality</span>
                <span className="text-emerald-400 text-xs font-mono font-bold">{energyPercent}%</span>
              </div>
              <div className="my-2 flex flex-col gap-2">
                <div className="w-full bg-zinc-950 h-3 rounded-full overflow-hidden p-0.5 border border-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-500"
                    style={{ width: `${energyPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-400 font-mono">
                  <span>Stamina: <strong className="text-emerald-400">High</strong></span>
                  <span>Recovery: <strong className="text-cyan-400">Good</strong></span>
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
                Logged Vitality: <span className="text-emerald-300 font-bold">{currentEnergy}/10 Rating</span>
              </div>
            </div>
          </section>

          {/* MIDDLE SECTION: CYCLE STATUS & TELEMETRY CORRELATION PLOT */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* CYCLE STATUS CARD */}
            <div className="lg:col-span-4 glass-panel p-6 flex flex-col gap-5 border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                <h2 className="text-md font-bold text-zinc-100 flex items-center gap-2">
                  <span className="text-pink-400">🩸</span> Cycle Status
                </h2>
              </div>

              <div className="flex flex-col items-center justify-center relative py-2">
                <svg className="w-40 h-40 transform -rotate-90">
                  <circle cx="80" cy="80" r="60" stroke="rgba(39, 39, 42, 0.8)" strokeWidth="12" fill="transparent" />
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    stroke={cycleInfoToday.color || "#ec4899"}
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 60}
                    strokeDashoffset={2 * Math.PI * 60 - (cyclePercent / 100) * 2 * Math.PI * 60}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-white font-mono">
                    {cycleInfoToday.cycleDay > 0 ? `DAY ${cycleInfoToday.cycleDay}` : "--"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80 text-xs">
                <div className="font-bold text-zinc-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cycleInfoToday.color }} />
                  {cycleInfoToday.phaseName}
                </div>
                <p className="text-zinc-400 leading-relaxed text-[11px]">{cycleInfoToday.description}</p>
              </div>
            </div>

            {/* TELEMETRY CORRELATION PLOT */}
            <div className="lg:col-span-8 glass-panel p-6 flex flex-col gap-5 border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-zinc-800/60 gap-2">
                <div>
                  <h2 className="text-md font-bold text-zinc-100 flex items-center gap-2">
                    <span className="text-purple-400">📈</span> 30-day Telemetry Chart
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Continuous Calendar View: Daily Pain Levels (Colored Bars) & Period Start Markers (Pink Dashed Lines)
                  </p>
                </div>
              </div>

              {/* Metric Selectors */}
              <div className="flex flex-wrap gap-2">
                {parameters.map((param, index) => {
                  const isChecked = selectedCorrelationParams.includes(param.id);
                  return (
                    <button
                      key={`metric-btn-${param.id}-${index}`}
                      onClick={() => handleCorrelationParamToggle(param.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${isChecked
                        ? "bg-purple-950/40 border-purple-500/50 text-purple-300 shadow"
                        : "bg-zinc-950/40 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }}
                      />
                      {param.label}
                    </button>
                  );
                })}
              </div>

              {/* Highcharts Render */}
              <div className="w-full bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-2">
                <HighchartsReact highcharts={Highcharts} options={correlationChartOptions} />
              </div>
            </div>
          </section>

          {/* BOTTOM SECTION: BIOMETRIC ARCHIVES MATRIX */}
          <section className="glass-panel p-6 flex flex-col gap-4 border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span className="text-cyan-400">📊</span> Biometric Archives
              </h2>
              <span className="text-xs font-mono text-zinc-500">{logs.length} Recorded Entries</span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-10 text-xs text-zinc-500 font-mono uppercase">
                Zero Logs Committed. Add entries in the Daily Input tab.
              </div>
            ) : (
              <div className="overflow-x-auto w-full max-h-[500px] border border-zinc-800/80 rounded-xl bg-zinc-950/60">
                <table className="w-full text-left text-xs md:text-sm font-mono border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 font-semibold sticky top-0 backdrop-blur z-20">
                      <th className="p-3 sticky left-0 bg-zinc-900 z-30 border-r border-zinc-800 min-w-[140px]">Parameter</th>
                      {[...logs].reverse().map((entry, idx) => (
                        <th key={`th-log-${entry.id || entry.date}-${idx}`} className="p-3 text-center whitespace-nowrap min-w-[100px] border-r border-zinc-800/50">
                          {formatDateString(entry.date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {parameters.map((param, index) => (
                      <tr key={`archive-row-${param.id}-${index}`} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="p-3 sticky left-0 bg-zinc-950 font-bold text-zinc-300 z-10 border-r border-zinc-800 min-w-[140px]">
                          {param.label}
                        </td>
                        {[...logs].reverse().map((entry, idx) => {
                          const val = (entry.painLevels && entry.painLevels[param.id]) ?? 0;
                          return (
                            <td key={`td-log-${param.id}-${entry.id || entry.date}-${idx}`} className="p-3 text-center border-r border-zinc-800/40 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded font-bold ${getSeverityStyles(val).bg} ${getSeverityStyles(val).text}`}>
                                {val}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DAILY INPUT & LOGS */}
      {/* ========================================================================= */}
      {activeTab === "input" && (
        <div className="flex flex-col gap-8 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT COLUMN: DAILY BIOMETRIC INPUT (PAIN SLIDERS & PARAMETERS) */}
            <div className="lg:col-span-6 glass-panel p-6 flex flex-col gap-6 border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                <div>
                  <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                    <span className="text-cyan-400">📝</span> Daily Biometric Input
                  </h2>
                  <p className="text-xs text-zinc-400">Log pain severity levels across active body parameters</p>
                </div>
                <button
                  onClick={() => setIsManagingParams(!isManagingParams)}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
                >
                  {isManagingParams ? "Done" : "+ Manage Metrics"}
                </button>
              </div>

              {/* Add/Manage Parameter Bar */}
              {isManagingParams && (
                <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 flex flex-col gap-3">
                  <span className="text-xs font-bold text-zinc-300">Add & Edit Biometric Parameters</span>
                  <form onSubmit={handleAddParameter} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Migraine, Lower Back..."
                      value={newParamLabel}
                      onChange={(e) => setNewParamLabel(e.target.value)}
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      Add
                    </button>
                  </form>
                  <div className="flex flex-col gap-2 mt-2 max-h-56 overflow-y-auto pr-1">
                    {parameters.map((p, index) => (
                      <div key={`manage-chip-${p.id}-${index}`} className="text-xs px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center justify-between gap-2">
                        {editingId === p.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveEditedParameter(p.id);
                                } else if (e.key === "Escape") {
                                  setEditingId(null);
                                  setEditingLabel("");
                                }
                              }}
                              className="flex-1 bg-zinc-950 border border-cyan-500 rounded px-2.5 py-1 text-xs text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditedParameter(p.id)}
                              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md text-xs transition"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingId(null); setEditingLabel(""); }}
                              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold rounded-md text-xs transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-semibold text-zinc-200">{p.label}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setEditingId(p.id); setEditingLabel(p.label); }}
                                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 rounded-md text-xs font-mono transition"
                                title="Edit parameter name"
                              >
                                Edit ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteParameter(p.id)}
                                className="px-2 py-1 text-red-400 font-bold hover:text-red-300 hover:bg-zinc-800 rounded-md text-xs transition"
                                title="Delete parameter"
                              >
                                ×
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log Form */}
              <form onSubmit={handleSaveLog} className="flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-mono text-zinc-400">Select Date:</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSelectedCalendarDate(e.target.value);
                    }}
                    className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
                  />
                </div>

                {/* Parameter Sliders */}
                <div className="flex flex-col gap-4 max-h-[380px] overflow-y-auto pr-2">
                  {parameters.map((param, index) => {
                    const currentVal = painLevels[param.id] ?? 0;
                    const styles = getSeverityStyles(currentVal);
                    return (
                      <div key={`slider-item-${param.id}-${index}`} className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-zinc-200">{param.label}</span>
                          <span className={`px-2 py-0.5 rounded font-mono font-bold ${styles.bg} ${styles.text}`}>
                            {currentVal} / 10
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={currentVal}
                          onChange={(e) => handleSliderChange(param.id, parseInt(e.target.value))}
                          className="w-full accent-cyan-400 bg-zinc-800 h-2 rounded-lg cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Notes Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-400">Daily Biometric Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Log symptoms, physical triggers, medication taken..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                >
                  Save Daily Biometric Log
                </button>
              </form>
            </div>

            {/* RIGHT COLUMN: CYCLE CALENDAR & LOG SYMPTOMS */}
            <div className="lg:col-span-6 glass-panel p-6 flex flex-col gap-6 border border-zinc-800/80 bg-zinc-900/40 rounded-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                <div>
                  <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                    <span className="text-pink-400">🗓️</span> Cycle Calendar & Log Symptoms
                  </h2>
                  <p className="text-xs text-zinc-400">Select date to enter daily symptoms & health notes</p>
                </div>
              </div>

              {/* Month Navigation */}
              <div className="flex items-center justify-between bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
                <button onClick={handlePrevMonth} className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-xs font-mono">
                  ← Prev
                </button>
                <span className="text-xs font-bold font-mono text-zinc-200">
                  {new Date(calendarYear, calendarMonth).toLocaleString("default", { month: "long" })} {calendarYear}
                </span>
                <button onClick={handleNextMonth} className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-xs font-mono">
                  Next →
                </button>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-mono">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="py-1 text-zinc-500 font-bold">{day}</div>
                ))}
                {Array.from({ length: getFirstDayOfMonth(calendarYear, calendarMonth) }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9" />
                ))}
                {Array.from({ length: getDaysInMonth(calendarYear, calendarMonth) }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const isSelected = selectedCalendarDate === dateStr;
                  const logForDay = periodLogs.find((l) => l.date === dateStr);
                  const isPeriodStartDay = startDates.some((s) => getLocalDateString(s) === dateStr);
                  const hasLog = logForDay && (logForDay.notes?.trim() || logForDay.isPeriodStart || logForDay.flow !== "none");

                  return (
                    <button
                      key={dayNum}
                      onClick={() => {
                        setSelectedCalendarDate(dateStr);
                        setDate(dateStr);
                      }}
                      className={`h-9 rounded-lg flex flex-col items-center justify-center relative transition-all ${isSelected
                        ? "bg-pink-600/30 border border-pink-500 text-pink-300 font-bold shadow-lg shadow-pink-500/20"
                        : isPeriodStartDay
                          ? "bg-rose-950/70 text-rose-300 border border-rose-500/50 font-semibold"
                          : hasLog
                            ? "bg-rose-950/40 text-rose-400 border border-rose-500/20"
                            : "bg-zinc-950/40 text-zinc-400 hover:bg-zinc-800/60"
                        }`}
                    >
                      <span>{dayNum}</span>
                      {hasLog && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 absolute bottom-1" />}
                    </button>
                  );
                })}
              </div>

              {/* Log Symptoms Form */}
              <form onSubmit={handleSavePeriodLog} className="flex flex-col gap-5 pt-3 border-t border-zinc-800/60">
                <div className="text-xs font-mono text-zinc-400">
                  Logging Symptoms for Date: <strong className="text-pink-400 font-bold">{selectedCalendarDate}</strong>
                </div>

                {/* Period Start Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-pink-950/30 border border-pink-500/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🩸</span>
                    <div>
                      <div className="text-xs font-bold text-pink-300">Period Started Today</div>
                      <div className="text-[11px] text-zinc-400">Mark this date as the start of your menstrual cycle</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTogglePeriodStart}
                    className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 ${isPeriodStart
                      ? "bg-pink-600 text-white shadow-lg shadow-pink-600/30 border border-pink-400"
                      : "bg-zinc-900 text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-600"
                      }`}
                  >
                    {isPeriodStart ? "✓ Period Started" : "+ Mark Period Start"}
                  </button>
                </div>

                {/* Text box to enter log symptoms */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-300">Log Daily Symptoms & Health Notes</label>
                  <textarea
                    rows={4}
                    placeholder="Enter any symptoms, cycle notes, mood observations, or physical state..."
                    value={periodNotes}
                    onChange={(e) => setPeriodNotes(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-pink-500"
                  />
                </div>

                {/* Energy Rating slider */}
                <div className="flex flex-col gap-2 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-zinc-300">Daily Vitality & Energy Score</span>
                    <span className="text-emerald-400 font-bold font-mono">{inputEnergy} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={inputEnergy}
                    onChange={(e) => setInputEnergy(parseInt(e.target.value))}
                    className="w-full accent-emerald-400 bg-zinc-800 h-2 rounded-lg cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                >
                  Save Daily Symptoms & Notes
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FEEDBACK NOTIFIER */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-cyan-500/30 bg-zinc-950/90 backdrop-blur-md shadow-2xl text-xs font-mono font-medium text-cyan-300 animate-fade-in">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
