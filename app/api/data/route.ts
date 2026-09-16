import { promises as fs } from "fs";
import path from "path";
import { getDatabase } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

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
  date: string;
  flow?: "none" | "spotting" | "light" | "medium" | "heavy" | "started";
  isPeriodStart?: boolean;
  symptoms: string[];
  notes: string;
  moodSwings?: string[];
  moodLevels?: string[];
  energyLevel?: number;
}

interface PeriodSettings {
  cycleLength?: number;
  periodLength: number;
}

interface WeatherLogEntry {
  date: string;
  temp: number;
  condition: string;
  icon?: string;
  humidity: number;
  pressure: number;
  advice?: string;
}

interface HealthData {
  parameters: BiometricParameter[];
  logs: LogEntry[];
  periodLogs: PeriodLogEntry[];
  periodSettings: PeriodSettings;
  weatherLogs: WeatherLogEntry[];
}

const DEFAULT_PARAMETERS: BiometricParameter[] = [
  { id: "1", label: "Right Anterior Deltoid" },
  { id: "2", label: "Right Medial Deltoid" },
  { id: "3", label: "Right Posterior Deltoid" },
  { id: "4", label: "Right Arm" },
  { id: "5", label: "Left Anterior Deltoid" },
  { id: "6", label: "Left Medial Deltoid" },
  { id: "7", label: "Left Posterior Deltoid" },
  { id: "8", label: "Left Arm" },
  { id: "9", label: "Upper Trapezius" },
  { id: "10", label: "Middle Trapezius" },
  { id: "11", label: "Lower Trapezius" },
  { id: "12", label: "Right Calf" },
  { id: "13", label: "Left Calf" },
  { id: "14", label: "Right Lower Back" },
  { id: "15", label: "Left Lower Back" },
  { id: "16", label: "Left Knee" },
  { id: "17", label: "Right Knee" },
];

const isVercel = process.env.VERCEL === "1";
const DATA_DIR = isVercel ? "/tmp" : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

function deduplicateParameters(params: any[]): BiometricParameter[] {
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
}

async function readLocalData(): Promise<HealthData> {
  try {
    const fileContent = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(fileContent);
    return {
      parameters: deduplicateParameters(data.parameters || DEFAULT_PARAMETERS),
      logs: data.logs || [],
      periodLogs: data.periodLogs || [],
      periodSettings: data.periodSettings || { periodLength: 5, cycleLength: 28 },
      weatherLogs: data.weatherLogs || [],
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const initialData: HealthData = {
        parameters: DEFAULT_PARAMETERS,
        logs: [],
        periodLogs: [],
        periodSettings: { periodLength: 5, cycleLength: 28 },
        weatherLogs: [],
      };
      await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2), "utf-8");
      return initialData;
    }
    throw error;
  }
}

async function writeLocalData(data: Partial<HealthData>) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    let existingData: HealthData;
    try {
      const fileContent = await fs.readFile(DATA_FILE, "utf-8");
      existingData = JSON.parse(fileContent);
    } catch {
      existingData = {
        parameters: DEFAULT_PARAMETERS,
        logs: [],
        periodLogs: [],
        periodSettings: { periodLength: 5, cycleLength: 28 },
        weatherLogs: [],
      };
    }

    const merged: HealthData = {
      parameters: data.parameters
        ? deduplicateParameters(data.parameters)
        : existingData.parameters,
      logs: data.logs || existingData.logs,
      periodLogs: data.periodLogs || existingData.periodLogs,
      periodSettings: data.periodSettings || existingData.periodSettings,
      weatherLogs: data.weatherLogs || existingData.weatherLogs,
    };

    await fs.writeFile(DATA_FILE, JSON.stringify(merged, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not write to local data cache:", err);
  }
}

async function readDataFromMongo(): Promise<HealthData> {
  const db = await getDatabase();

  const [paramDocs, logDocs, periodDocs, settingsDoc, weatherDocs] =
    await Promise.all([
      db
        .collection<BiometricParameter>("parameters")
        .find({}, { projection: { _id: 0, updatedAt: 0 } })
        .toArray(),
      db
        .collection<LogEntry>("logs")
        .find({}, { projection: { _id: 0, updatedAt: 0 } })
        .sort({ date: 1 })
        .toArray(),
      db
        .collection<PeriodLogEntry>("period_logs")
        .find({}, { projection: { _id: 0, updatedAt: 0 } })
        .sort({ date: 1 })
        .toArray(),
      db
        .collection("settings")
        .findOne({ key: "period_settings" }, { projection: { _id: 0, key: 0, updatedAt: 0 } }),
      db
        .collection<WeatherLogEntry>("weather_logs")
        .find({}, { projection: { _id: 0, updatedAt: 0 } })
        .sort({ date: 1 })
        .toArray(),
    ]);

  const parameters = deduplicateParameters(
    paramDocs && paramDocs.length > 0 ? paramDocs : DEFAULT_PARAMETERS
  );

  const periodSettings: PeriodSettings = {
    periodLength: (settingsDoc as any)?.periodLength ?? 5,
    cycleLength: (settingsDoc as any)?.cycleLength ?? 28,
  };

  return {
    parameters,
    logs: logDocs || [],
    periodLogs: periodDocs || [],
    periodSettings,
    weatherLogs: weatherDocs || [],
  };
}

async function writeDataToMongo(payload: Partial<HealthData>) {
  const db = await getDatabase();
  const now = new Date();

  // 1. Sync parameters
  if (payload.parameters !== undefined) {
    const cleanParams = deduplicateParameters(payload.parameters);
    const paramColl = db.collection("parameters");
    // Replace all with updated list to reflect deletions, additions, and edits
    await paramColl.deleteMany({});
    if (cleanParams.length > 0) {
      await paramColl.insertMany(
        cleanParams.map((p) => ({ ...p, updatedAt: now }))
      );
    }
  }

  // 2. Upsert logs
  if (payload.logs !== undefined && Array.isArray(payload.logs)) {
    const logsColl = db.collection("logs");
    if (payload.logs.length > 0) {
      const ops = payload.logs.map((l) => ({
        updateOne: {
          filter: { date: l.date },
          update: { $set: { ...l, updatedAt: now } },
          upsert: true,
        },
      }));
      await logsColl.bulkWrite(ops);
    }
  }

  // 3. Upsert period logs
  if (payload.periodLogs !== undefined && Array.isArray(payload.periodLogs)) {
    const periodColl = db.collection("period_logs");
    if (payload.periodLogs.length > 0) {
      const ops = payload.periodLogs.map((p) => ({
        updateOne: {
          filter: { date: p.date },
          update: { $set: { ...p, updatedAt: now } },
          upsert: true,
        },
      }));
      await periodColl.bulkWrite(ops);
    }
  }

  // 4. Upsert period settings
  if (payload.periodSettings !== undefined) {
    const settingsColl = db.collection("settings");
    await settingsColl.updateOne(
      { key: "period_settings" },
      {
        $set: {
          key: "period_settings",
          periodLength: payload.periodSettings.periodLength ?? 5,
          cycleLength: payload.periodSettings.cycleLength ?? 28,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }

  // 5. Upsert weather logs
  if (payload.weatherLogs !== undefined && Array.isArray(payload.weatherLogs)) {
    const weatherColl = db.collection("weather_logs");
    if (payload.weatherLogs.length > 0) {
      const ops = payload.weatherLogs.map((w) => ({
        updateOne: {
          filter: { date: w.date },
          update: { $set: { ...w, updatedAt: now } },
          upsert: true,
        },
      }));
      await weatherColl.bulkWrite(ops);
    }
  }
}

export async function GET() {
  try {
    const data = await readDataFromMongo();
    // Keep local cache in sync as backup
    writeLocalData(data).catch(() => {});
    return Response.json(data);
  } catch (mongoError: any) {
    console.error("MongoDB read failed, falling back to local storage:", mongoError.message);
    try {
      const localData = await readLocalData();
      return Response.json(localData);
    } catch (localError: any) {
      return Response.json(
        { error: "Failed to read health data", details: localError.message },
        { status: 500 }
      );
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload: Partial<HealthData> = {};

    if (body.parameters !== undefined) {
      payload.parameters = deduplicateParameters(body.parameters);
    }
    if (body.logs !== undefined) {
      payload.logs = body.logs;
    }
    if (body.periodLogs !== undefined) {
      payload.periodLogs = body.periodLogs;
    }
    if (body.periodSettings !== undefined) {
      payload.periodSettings = body.periodSettings;
    }
    if (body.weatherLogs !== undefined) {
      payload.weatherLogs = body.weatherLogs;
    }

    // Save directly to MongoDB
    await writeDataToMongo(payload);

    // Also update local cache for offline backup
    await writeLocalData(payload);

    // Fetch the updated dataset to return
    const updatedData = await readDataFromMongo().catch(() => readLocalData());
    return Response.json({ success: true, data: updatedData });
  } catch (error: any) {
    console.error("Error saving data to MongoDB:", error);
    return Response.json(
      { error: "Failed to write data to MongoDB", details: error.message },
      { status: 500 }
    );
  }
}
