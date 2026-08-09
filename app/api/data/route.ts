import { promises as fs } from "fs";
import path from "path";

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
  { id: "17", label: "Right Knee" }
];

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

const isVercel = process.env.VERCEL === "1";
const DATA_DIR = isVercel ? "/tmp" : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

// Hardcoded spreadsheet link for reference
export const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1YNPRKs4AT9ipLiZ-97mElz7dipgiRUHQBaropNV8nIc/edit?gid=768484160#gid=768484160";

// Google Apps Script Web App URL. Define this in .env.local as GOOGLE_SCRIPT_URL,
// or paste your URL directly into the string below.
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbxs-dH9CurhjUbXUYjGOLfpdhVdHjN05VKUMruIoN7nh7ZSJV7AMU9XGHge1PZKCUwr/exec";

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

async function readLocalData() {
  try {
    const fileContent = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(fileContent);
    if (data.parameters) {
      data.parameters = deduplicateParameters(data.parameters);
    }
    return data;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const initialData = {
        parameters: DEFAULT_PARAMETERS,
        logs: getMockLogs(),
      };
      await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2), "utf-8");
      return initialData;
    }
    throw error;
  }
}

async function writeLocalData(data: any) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (data.parameters) {
    data.parameters = deduplicateParameters(data.parameters);
  }
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function readData() {
  if (!GOOGLE_SCRIPT_URL) {
    console.warn("Google Sheets Integration (GOOGLE_SCRIPT_URL) is not configured. Using local storage.");
    return readLocalData();
  }

  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    if (data && data.error) {
      throw new Error(data.error);
    }

    if (data.parameters) {
      data.parameters = deduplicateParameters(data.parameters);
    }

    // Merge local data as fallback for fields that might not be in Google Sheets
    const localData = await readLocalData();
    if ((!data.parameters || data.parameters.length === 0) && localData.parameters) {
      data.parameters = localData.parameters;
    }
    if ((!data.periodSettings || Object.keys(data.periodSettings).length === 0) && localData.periodSettings) {
      data.periodSettings = localData.periodSettings;
    }
    if ((!data.periodLogs || data.periodLogs.length === 0) && localData.periodLogs) {
      data.periodLogs = localData.periodLogs;
    }
    if ((!data.weatherLogs || data.weatherLogs.length === 0) && localData.weatherLogs) {
      data.weatherLogs = localData.weatherLogs;
    }

    // Auto-sync: If the sheet is empty, write current local/mock data to the sheet
    const hasParams = data.parameters && data.parameters.length > 0;
    const hasLogs = data.logs && data.logs.length > 0;
    if (!hasParams && !hasLogs) {
      console.log("Google Sheet is empty. Syncing local/mock data to the Google Sheet...");
      await writeData(localData);
      return localData;
    }

    // Keep local cache in sync as a backup
    await writeLocalData(data);
    return data;
  } catch (error: any) {
    console.error("Failed to read from Google Sheets. Falling back to local data cache:", error.message);
    return readLocalData();
  }
}

async function writeData(payload: any, fullData?: any) {
  // Always update local cache first
  await writeLocalData(fullData || payload);

  if (!GOOGLE_SCRIPT_URL) {
    console.warn("Google Sheets Integration (GOOGLE_SCRIPT_URL) is not configured. Data saved locally only.");
    return;
  }

  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const result = await res.json();
    if (result && result.error) {
      throw new Error(result.error);
    }
  } catch (error: any) {
    console.error("Failed to write to Google Sheets:", error.message);
    throw new Error(`Failed to write to Google Sheets: ${error.message}`);
  }
}

export async function GET() {
  try {
    const data = await readData();
    return Response.json(data);
  } catch (error: any) {
    return Response.json(
      { error: "Failed to read data", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const currentData = await readData();
    const payload: any = {};

    if (body.parameters !== undefined) {
      currentData.parameters = deduplicateParameters(body.parameters);
      payload.parameters = currentData.parameters;
      payload.updateParameters = true;
    }
    if (body.logs !== undefined) {
      currentData.logs = body.logs;
      payload.logs = currentData.logs;
      payload.updateLogs = true;
    }
    if (body.periodLogs !== undefined) {
      currentData.periodLogs = body.periodLogs;
      payload.periodLogs = currentData.periodLogs;
      payload.updatePeriodLogs = true;
    }
    if (body.periodSettings !== undefined) {
      currentData.periodSettings = body.periodSettings;
      payload.periodSettings = currentData.periodSettings;
      payload.updatePeriodSettings = true;
    }
    if (body.weatherLogs !== undefined) {
      currentData.weatherLogs = body.weatherLogs;
      payload.weatherLogs = currentData.weatherLogs;
      payload.updateWeatherLogs = true;
    }

    await writeData(payload, currentData);
    return Response.json({ success: true, data: currentData });
  } catch (error: any) {
    return Response.json(
      { error: "Failed to write data", details: error.message },
      { status: 500 }
    );
  }
}
