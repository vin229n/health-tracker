import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [k, ...v] = trimmed.split("=");
    if (k && v.length) {
      const val = v.join("=").trim().replace(/^["']|["']$/g, "");
      process.env[k.trim()] = val;
    }
  });
}

const mongoUri = process.env.MONGODB_CONNECTION_STRING;
const dbName = process.env.MONGODB_DB || "health_tracker";
const googleScriptUrl =
  process.env.GOOGLE_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbxs-dH9CurhjUbXUYjGOLfpdhVdHjN05VKUMruIoN7nh7ZSJV7AMU9XGHge1PZKCUwr/exec";

if (!mongoUri) {
  console.error("❌ Error: MONGODB_CONNECTION_STRING is not set in .env.local");
  process.exit(1);
}

function deduplicateParameters(params) {
  if (!Array.isArray(params)) return [];
  const unique = [];
  const seenIds = new Set();
  const seenLabels = new Set();

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

function normalizeDate(val) {
  if (!val) return "";
  const str = String(val).trim();
  if (str.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch (e) {}
  return str;
}

async function fetchFromGoogleSheets() {
  console.log("📥 Fetching latest data from Google Sheets / Apps Script...");
  try {
    const res = await fetch(googleScriptUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    console.log("✅ Successfully fetched data from Google Sheets!");
    return data;
  } catch (err) {
    console.warn("⚠️ Warning: Could not fetch from Google Sheets:", err.message);
    return null;
  }
}

function readLocalData() {
  const localFile = path.resolve(process.cwd(), "data", "data.json");
  if (fs.existsSync(localFile)) {
    try {
      console.log("📄 Reading local fallback cache from data/data.json...");
      return JSON.parse(fs.readFileSync(localFile, "utf8"));
    } catch (err) {
      console.warn("⚠️ Warning: Could not parse local data.json:", err.message);
    }
  }
  return null;
}

async function migrate() {
  console.log("==================================================");
  console.log("🚀 Starting Data Migration: Excel/Google Sheets -> MongoDB");
  console.log(`🎯 Target Database: ${dbName}`);
  console.log("==================================================");

  // 1. Fetch remote data and load local data
  const sheetData = await fetchFromGoogleSheets();
  const localData = readLocalData();

  if (!sheetData && !localData) {
    console.error("❌ No data source available for migration!");
    process.exit(1);
  }

  // 2. Merge data cleanly
  const rawParams = [
    ...(sheetData?.parameters || []),
    ...(localData?.parameters || []),
  ];
  const parameters = deduplicateParameters(rawParams);

  // Logs Map by normalized date
  const logsMap = new Map();
  // Insert local data first
  (localData?.logs || []).forEach((l) => {
    const d = normalizeDate(l.date);
    if (d) logsMap.set(d, { ...l, date: d });
  });
  // Overlay sheet data (more recent/authoritative)
  (sheetData?.logs || []).forEach((l) => {
    const d = normalizeDate(l.date);
    if (d) {
      const existing = logsMap.get(d) || {};
      logsMap.set(d, {
        id: l.id || existing.id || `log-${Date.now()}`,
        date: d,
        painLevels: { ...(existing.painLevels || {}), ...(l.painLevels || {}) },
        notes: l.notes || existing.notes || "",
        ...(l.energyLevel !== undefined ? { energyLevel: l.energyLevel } : {}),
      });
    }
  });
  const logs = Array.from(logsMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Period logs Map by date
  const periodMap = new Map();
  (localData?.periodLogs || []).forEach((p) => {
    const d = normalizeDate(p.date);
    if (d) periodMap.set(d, { ...p, date: d });
  });
  (sheetData?.periodLogs || []).forEach((p) => {
    const d = normalizeDate(p.date);
    if (d) {
      const existing = periodMap.get(d) || {};
      periodMap.set(d, {
        date: d,
        flow: p.flow || existing.flow || "none",
        isPeriodStart:
          p.isPeriodStart !== undefined
            ? p.isPeriodStart
            : existing.isPeriodStart || false,
        symptoms: p.symptoms || existing.symptoms || [],
        notes: p.notes || existing.notes || "",
        moodSwings: p.moodSwings || existing.moodSwings || [],
        moodLevels: p.moodLevels || existing.moodLevels || [],
        ...(p.energyLevel !== undefined
          ? { energyLevel: p.energyLevel }
          : existing.energyLevel !== undefined
          ? { energyLevel: existing.energyLevel }
          : {}),
      });
    }
  });
  const periodLogs = Array.from(periodMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Period Settings
  const periodSettings = {
    periodLength:
      sheetData?.periodSettings?.periodLength ??
      localData?.periodSettings?.periodLength ??
      5,
    cycleLength:
      sheetData?.periodSettings?.cycleLength ??
      localData?.periodSettings?.cycleLength ??
      28,
  };

  // Weather Logs Map by date
  const weatherMap = new Map();
  (localData?.weatherLogs || []).forEach((w) => {
    const d = normalizeDate(w.date);
    if (d) weatherMap.set(d, { ...w, date: d });
  });
  (sheetData?.weatherLogs || []).forEach((w) => {
    const d = normalizeDate(w.date);
    if (d) {
      const existing = weatherMap.get(d) || {};
      weatherMap.set(d, {
        date: d,
        temp: w.temp ?? existing.temp ?? 0,
        condition: w.condition || existing.condition || "",
        icon: w.icon || existing.icon || "☀️",
        humidity: w.humidity ?? existing.humidity ?? 0,
        pressure: w.pressure ?? existing.pressure ?? 0,
        advice: w.advice || existing.advice || "",
      });
    }
  });
  const weatherLogs = Array.from(weatherMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  console.log(`\n📋 Prepared records to migrate:`);
  console.log(`  - Parameters: ${parameters.length}`);
  console.log(`  - Daily Pain Logs: ${logs.length} (from ${logs[0]?.date} to ${logs[logs.length - 1]?.date})`);
  console.log(`  - Period Logs: ${periodLogs.length}`);
  console.log(`  - Weather Logs: ${weatherLogs.length}`);
  console.log(`  - Period Settings: ${JSON.stringify(periodSettings)}`);

  // 3. Connect to MongoDB
  console.log("\n🔌 Connecting to MongoDB Atlas...");
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`✅ Connected successfully to database: "${dbName}"`);

  // 4. Ensure collections & indexes
  console.log("\n🔧 Creating collections and unique indexes...");
  const paramColl = db.collection("parameters");
  const logsColl = db.collection("logs");
  const periodColl = db.collection("period_logs");
  const weatherColl = db.collection("weather_logs");
  const settingsColl = db.collection("settings");

  await paramColl.createIndex({ id: 1 }, { unique: true });
  await logsColl.createIndex({ date: 1 }, { unique: true });
  await periodColl.createIndex({ date: 1 }, { unique: true });
  await weatherColl.createIndex({ date: 1 }, { unique: true });
  await settingsColl.createIndex({ key: 1 }, { unique: true });
  console.log("✅ Indexes verified/created successfully.");

  // 5. Upsert Parameters
  console.log("\n💾 Upserting Parameters into MongoDB...");
  if (parameters.length > 0) {
    const paramOps = parameters.map((p) => ({
      updateOne: {
        filter: { id: p.id },
        update: { $set: { id: p.id, label: p.label, updatedAt: new Date() } },
        upsert: true,
      },
    }));
    const paramRes = await paramColl.bulkWrite(paramOps);
    console.log(
      `  - Parameters: ${paramRes.upsertedCount} inserted, ${paramRes.modifiedCount} updated`
    );
  }

  // 6. Upsert Daily Pain Logs
  console.log("💾 Upserting Pain Logs into MongoDB...");
  if (logs.length > 0) {
    const logOps = logs.map((l) => ({
      updateOne: {
        filter: { date: l.date },
        update: { $set: { ...l, updatedAt: new Date() } },
        upsert: true,
      },
    }));
    const logRes = await logsColl.bulkWrite(logOps);
    console.log(
      `  - Logs: ${logRes.upsertedCount} inserted, ${logRes.modifiedCount} updated`
    );
  }

  // 7. Upsert Period Logs
  console.log("💾 Upserting Period Logs into MongoDB...");
  if (periodLogs.length > 0) {
    const periodOps = periodLogs.map((p) => ({
      updateOne: {
        filter: { date: p.date },
        update: { $set: { ...p, updatedAt: new Date() } },
        upsert: true,
      },
    }));
    const periodRes = await periodColl.bulkWrite(periodOps);
    console.log(
      `  - Period Logs: ${periodRes.upsertedCount} inserted, ${periodRes.modifiedCount} updated`
    );
  }

  // 8. Upsert Weather Logs
  console.log("💾 Upserting Weather Logs into MongoDB...");
  if (weatherLogs.length > 0) {
    const weatherOps = weatherLogs.map((w) => ({
      updateOne: {
        filter: { date: w.date },
        update: { $set: { ...w, updatedAt: new Date() } },
        upsert: true,
      },
    }));
    const weatherRes = await weatherColl.bulkWrite(weatherOps);
    console.log(
      `  - Weather Logs: ${weatherRes.upsertedCount} inserted, ${weatherRes.modifiedCount} updated`
    );
  }

  // 9. Upsert Settings
  console.log("💾 Upserting Settings into MongoDB...");
  await settingsColl.updateOne(
    { key: "period_settings" },
    { $set: { key: "period_settings", ...periodSettings, updatedAt: new Date() } },
    { upsert: true }
  );
  console.log("  - Period settings saved.");

  // 10. Verification query counts
  console.log("\n🔍 Verifying MongoDB counts:");
  const finalParams = await paramColl.countDocuments();
  const finalLogs = await logsColl.countDocuments();
  const finalPeriod = await periodColl.countDocuments();
  const finalWeather = await weatherColl.countDocuments();
  const finalSettings = await settingsColl.countDocuments();

  console.log(`  ✓ Parameters in MongoDB:   ${finalParams}`);
  console.log(`  ✓ Logs in MongoDB:         ${finalLogs}`);
  console.log(`  ✓ Period Logs in MongoDB:  ${finalPeriod}`);
  console.log(`  ✓ Weather Logs in MongoDB: ${finalWeather}`);
  console.log(`  ✓ Settings in MongoDB:     ${finalSettings}`);

  // 11. Sync local cache data.json as a backup
  try {
    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "data.json"),
      JSON.stringify(
        {
          parameters,
          logs,
          periodLogs,
          periodSettings,
          weatherLogs,
        },
        null,
        2
      ),
      "utf8"
    );
    console.log("💾 Local backup data/data.json synced.");
  } catch (err) {
    console.warn("⚠️ Could not update local data.json backup:", err.message);
  }

  await client.close();
  console.log("\n✨ Migration completed successfully! ✨");
}

migrate().catch((err) => {
  console.error("\n❌ Migration failed with error:", err);
  process.exit(1);
});
