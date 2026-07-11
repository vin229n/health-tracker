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
  { id: "rightShoulder", label: "Right Shoulder" },
  { id: "rightArm", label: "Right Arm Muscle" },
  { id: "leftShoulder", label: "Left Shoulder" },
  { id: "leftArm", label: "Left Arm (Anterior Deltoid)" },
  { id: "upperBack", label: "Upper Back (Scapula)" },
  { id: "lowerBack", label: "Lower Back" },
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
export const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1YNPRKs4AT9ipLiZ-97mElz7dipgiRUHQBaropNV8nIc/edit?gid=0#gid=0";

// Google Apps Script Web App URL. Define this in .env.local as GOOGLE_SCRIPT_URL,
// or paste your URL directly into the string below.
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbw8O2tdIDKZppS0UU8kIDyum2ZIJyM9Ep6wv4yllr0iolrdjpIW3xenpTYXxJanVVHw/exec";

async function readLocalData() {
  try {
    const fileContent = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(fileContent);
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

    // Auto-sync: If the sheet is empty, write current local/mock data to the sheet
    const hasParams = data.parameters && data.parameters.length > 0;
    const hasLogs = data.logs && data.logs.length > 0;
    if (!hasParams && !hasLogs) {
      console.log("Google Sheet is empty. Syncing local/mock data to the Google Sheet...");
      const localData = await readLocalData();
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

async function writeData(data: any) {
  // Always update local cache first
  await writeLocalData(data);

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
      body: JSON.stringify(data),
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

    if (body.logs !== undefined) {
      currentData.logs = body.logs;
    }
    if (body.parameters !== undefined) {
      currentData.parameters = body.parameters;
    }

    await writeData(currentData);
    return Response.json({ success: true, data: currentData });
  } catch (error: any) {
    return Response.json(
      { error: "Failed to write data", details: error.message },
      { status: 500 }
    );
  }
}
