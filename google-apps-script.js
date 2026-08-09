/**
 * Google Apps Script for Health Tracker Spreadsheet Storage.
 * Paste this code into Extensions > Apps Script in your Google Sheet.
 * 
 * Google Sheet URL: https://docs.google.com/spreadsheets/d/1YNPRKs4AT9ipLiZ-97mElz7dipgiRUHQBaropNV8nIc/edit?gid=768484160#gid=768484160
 */

function doGet() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Read parameters
    let paramSheet = spreadsheet.getSheetByName("Parameters");
    if (!paramSheet) {
      paramSheet = spreadsheet.insertSheet("Parameters");
      paramSheet.appendRow(["ID", "Label"]);
    }
    const paramData = paramSheet.getDataRange().getValues();
    const parameters = [];
    const seenParamIds = {};
    const seenParamLabels = {};
    for (let i = 1; i < paramData.length; i++) {
      if (paramData[i][0] && paramData[i][1]) {
        const pid = paramData[i][0].toString().trim();
        const plabel = paramData[i][1].toString().trim().replace(/\s+/g, " ");
        const normLabel = plabel.toLowerCase();

        if (normLabel === "vital" || normLabel === "period" || normLabel === "weather" || normLabel === "energy") continue;

        if (!seenParamIds[pid] && !seenParamLabels[normLabel]) {
          seenParamIds[pid] = true;
          seenParamLabels[normLabel] = true;
          parameters.push({ id: pid, label: plabel });
        }
      }
    }
    
    // 2. Read logs
    let logsSheet = spreadsheet.getSheetByName("Logs");
    if (!logsSheet) {
      logsSheet = spreadsheet.insertSheet("Logs");
      logsSheet.appendRow(["ID", "Date", "Notes"]);
    }
    const logsData = logsSheet.getDataRange().getValues();
    const logs = [];
    if (logsData.length > 1) {
      const headers = logsData[0].map(function(h) { return h.toString(); });
      for (let i = 1; i < logsData.length; i++) {
        const row = logsData[i];
        if (!row[0]) continue;
        
        const id = row[0].toString();
        let dateVal = row[1];
        let dateStr = "";
        if (dateVal instanceof Date) {
          dateStr = Utilities.formatDate(dateVal, spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else {
          dateStr = dateVal ? dateVal.toString() : "";
        }
        
        const notes = row[2] ? row[2].toString() : "";
        const painLevels = {};
        
        for (let j = 3; j < headers.length; j++) {
          const paramId = headers[j];
          if (paramId) {
            painLevels[paramId] = row[j] !== "" ? Number(row[j]) : 0;
          }
        }
        
        logs.push({
          id: id,
          date: dateStr,
          painLevels: painLevels,
          notes: notes
        });
      }
    }
    
    // 3. Read Period Tracker & Menstrual Day logs
    let menstrualSheet = spreadsheet.getSheetByName("PeriodTracker") || spreadsheet.getSheetByName("MenstrualDay");
    if (!menstrualSheet) {
      menstrualSheet = spreadsheet.insertSheet("PeriodTracker");
      menstrualSheet.appendRow(["Date", "Period Started", "Flow", "Vital Energy (1-10)", "Mood Swings", "Notes"]);
    }
    const menstrualData = menstrualSheet.getDataRange().getValues();
    const menstrualEntries = {};
    if (menstrualData.length > 1) {
      const headers = menstrualData[0].map(function(h) { return h ? h.toString().toLowerCase() : ""; });
      const startIdx = headers.indexOf("period started");
      const flowIdx = headers.indexOf("flow");
      const energyIdx = headers.indexOf("vital energy (1-10)") >= 0 ? headers.indexOf("vital energy (1-10)") : headers.indexOf("vital energy");
      const moodIdx = headers.indexOf("mood swings");
      const notesIdx = headers.indexOf("notes");

      for (let i = 1; i < menstrualData.length; i++) {
        const row = menstrualData[i];
        if (!row[0]) continue;
        let dateStr = "";
        if (row[0] instanceof Date) {
          dateStr = Utilities.formatDate(row[0], spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else {
          dateStr = row[0].toString();
        }

        const isStartVal = startIdx >= 0 ? row[startIdx] : "";
        const isPeriodStart = isStartVal === true || String(isStartVal).toLowerCase() === "yes" || String(isStartVal).toLowerCase() === "true";
        const flowVal = flowIdx >= 0 && row[flowIdx] ? row[flowIdx].toString() : "none";
        const energyVal = energyIdx >= 0 && row[energyIdx] !== "" ? Number(row[energyIdx]) : undefined;
        const moodStr = moodIdx >= 0 && row[moodIdx] ? row[moodIdx].toString() : "";
        const moodSwings = moodStr ? moodStr.split(",").map(function(m) { return m.trim(); }) : [];
        const notesVal = notesIdx >= 0 && row[notesIdx] ? row[notesIdx].toString() : "";

        menstrualEntries[dateStr] = {
          date: dateStr,
          isPeriodStart: isPeriodStart,
          flow: flowVal,
          energyLevel: energyVal,
          moodSwings: moodSwings,
          notes: notesVal,
          symptoms: []
        };
      }
    }

    // 4. Read Mood Swings sheet
    let moodSheet = spreadsheet.getSheetByName("MoodSwings");
    if (!moodSheet) {
      moodSheet = spreadsheet.insertSheet("MoodSwings");
      moodSheet.appendRow(["Date", "Mood Swings", "Vital Energy (1-10)", "Notes"]);
    }
    const moodData = moodSheet.getDataRange().getValues();
    if (moodData.length > 1) {
      for (let i = 1; i < moodData.length; i++) {
        const row = moodData[i];
        if (!row[0]) continue;
        let dateStr = "";
        if (row[0] instanceof Date) {
          dateStr = Utilities.formatDate(row[0], spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else {
          dateStr = row[0].toString();
        }
        
        const moodsStr = row[1] ? row[1].toString() : "";
        const moodsList = moodsStr ? moodsStr.split(",").map(function(m) { return m.trim(); }) : [];
        const energyVal = row[2] !== "" ? Number(row[2]) : undefined;
        const notesVal = row[3] ? row[3].toString() : "";
        
        if (!menstrualEntries[dateStr]) {
          menstrualEntries[dateStr] = {
            date: dateStr,
            isPeriodStart: false,
            flow: "none",
            notes: notesVal,
            symptoms: [],
            moodSwings: moodsList,
            energyLevel: energyVal
          };
        } else {
          if (moodsList.length > 0) menstrualEntries[dateStr].moodSwings = moodsList;
          if (energyVal !== undefined) menstrualEntries[dateStr].energyLevel = energyVal;
        }
      }
    }

    const periodLogs = [];
    for (let d in menstrualEntries) {
      periodLogs.push(menstrualEntries[d]);
    }

    // 5. Read Period Settings
    let settingsSheet = spreadsheet.getSheetByName("PeriodSettings");
    if (!settingsSheet) {
      settingsSheet = spreadsheet.insertSheet("PeriodSettings");
      settingsSheet.appendRow(["Setting", "Value"]);
      settingsSheet.appendRow(["periodLength", "5"]);
    }
    const settingsData = settingsSheet.getDataRange().getValues();
    const periodSettings = { periodLength: 5 };
    for (let i = 1; i < settingsData.length; i++) {
      const settingName = settingsData[i][0] ? settingsData[i][0].toString() : "";
      if (settingName === "periodLength") {
        periodSettings.periodLength = Number(settingsData[i][1]);
      }
    }

    // 6. Read WeatherLogs sheet
    let weatherSheet = spreadsheet.getSheetByName("WeatherLogs");
    if (!weatherSheet) {
      weatherSheet = spreadsheet.insertSheet("WeatherLogs");
      weatherSheet.appendRow(["Date", "Temperature (°C)", "Condition", "Humidity (%)", "Pressure (hPa)", "Advice"]);
    }
    const weatherData = weatherSheet.getDataRange().getValues();
    const weatherLogs = [];
    if (weatherData.length > 1) {
      for (let i = 1; i < weatherData.length; i++) {
        const row = weatherData[i];
        if (!row[0]) continue;
        let dateStr = "";
        if (row[0] instanceof Date) {
          dateStr = Utilities.formatDate(row[0], spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else {
          dateStr = row[0].toString();
        }
        weatherLogs.push({
          date: dateStr,
          temp: row[1] !== "" ? Number(row[1]) : 0,
          condition: row[2] ? row[2].toString() : "",
          humidity: row[3] !== "" ? Number(row[3]) : 0,
          pressure: row[4] !== "" ? Number(row[4]) : 0,
          advice: row[5] ? row[5].toString() : ""
        });
      }
    }
    
    const response = {
      parameters: parameters,
      logs: logs,
      periodLogs: periodLogs,
      periodSettings: periodSettings,
      weatherLogs: weatherLogs
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const postData = JSON.parse(e.postData.contents);
    
    // 1. Update Parameters sheet ONLY IF updateParameters === true and postData.parameters is provided
    if (postData.updateParameters === true && Array.isArray(postData.parameters) && postData.parameters.length > 0) {
      let paramSheet = spreadsheet.getSheetByName("Parameters");
      if (!paramSheet) {
        paramSheet = spreadsheet.insertSheet("Parameters");
      }
      paramSheet.clear();
      paramSheet.appendRow(["ID", "Label"]);

      const seenParamIds = {};
      const seenParamLabels = {};

      postData.parameters.forEach(function(p) {
        if (p && p.id && p.label) {
          const pid = p.id.toString().trim();
          const plabel = p.label.toString().trim().replace(/\s+/g, " ");
          const normLabel = plabel.toLowerCase();

          if (normLabel === "vital" || normLabel === "period" || normLabel === "weather" || normLabel === "energy") return;

          if (!seenParamIds[pid] && !seenParamLabels[normLabel]) {
            seenParamIds[pid] = true;
            seenParamLabels[normLabel] = true;
            paramSheet.appendRow([pid, plabel]);
          }
        }
      });
      paramSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#f3f4f6");
    }
    
    // 2. Update Logs sheet ONLY IF postData.updateLogs === true or postData.logs is provided
    if (postData.updateLogs === true || (Array.isArray(postData.logs) && postData.logs.length > 0)) {
      // Read parameters from Parameters sheet to map log columns
      let paramSheet = spreadsheet.getSheetByName("Parameters");
      const paramIds = [];
      if (paramSheet) {
        const paramData = paramSheet.getDataRange().getValues();
        for (let i = 1; i < paramData.length; i++) {
          if (paramData[i][0]) {
            paramIds.push(paramData[i][0].toString().trim());
          }
        }
      }

      let logsSheet = spreadsheet.getSheetByName("Logs");
      if (!logsSheet) {
        logsSheet = spreadsheet.insertSheet("Logs");
      }
      logsSheet.clear();
      
      const headers = ["ID", "Date", "Notes"].concat(paramIds);
      logsSheet.appendRow(headers);
      
      const logs = postData.logs || [];
      logs.forEach(function(log) {
        const row = [
          log.id,
          log.date,
          log.notes || ""
        ];
        paramIds.forEach(function(paramId) {
          const val = log.painLevels && log.painLevels[paramId] !== undefined ? log.painLevels[paramId] : 0;
          row.push(val);
        });
        logsSheet.appendRow(row);
      });
      
      if (headers.length > 0) {
        const lastColLetter = getColumnLetter(headers.length);
        logsSheet.getRange("A1:" + lastColLetter + "1").setFontWeight("bold").setBackground("#e0f2fe");
      }
    }

    // 3. Update PeriodTracker & MoodSwings sheets ONLY IF postData.updatePeriodLogs === true or postData.periodLogs provided
    if (postData.updatePeriodLogs === true || Array.isArray(postData.periodLogs)) {
      let trackerSheet = spreadsheet.getSheetByName("PeriodTracker");
      if (!trackerSheet) {
        trackerSheet = spreadsheet.insertSheet("PeriodTracker");
      }
      trackerSheet.clear();
      trackerSheet.appendRow(["Date", "Period Started", "Flow", "Vital Energy (1-10)", "Mood Swings", "Notes"]);
      
      let menstrualSheet = spreadsheet.getSheetByName("MenstrualDay");
      if (!menstrualSheet) {
        menstrualSheet = spreadsheet.insertSheet("MenstrualDay");
      }
      menstrualSheet.clear();
      menstrualSheet.appendRow(["Date", "Period Started", "Flow", "Vital Energy (1-10)", "Mood Swings", "Notes"]);

      let moodSheet = spreadsheet.getSheetByName("MoodSwings");
      if (!moodSheet) {
        moodSheet = spreadsheet.insertSheet("MoodSwings");
      }
      moodSheet.clear();
      moodSheet.appendRow(["Date", "Mood Swings", "Vital Energy (1-10)", "Notes"]);

      const periodLogs = postData.periodLogs || [];
      periodLogs.forEach(function(log) {
        const moodStr = Array.isArray(log.moodSwings) && log.moodSwings.length > 0
          ? log.moodSwings.join(", ")
          : (Array.isArray(log.moodLevels) && log.moodLevels.length > 0 ? log.moodLevels.join(", ") : "");
        
        const energyVal = log.energyLevel !== undefined ? log.energyLevel : "";

        if (log.isPeriodStart || (log.flow && log.flow !== "none") || (log.notes && log.notes.trim() !== "") || moodStr !== "" || energyVal !== "") {
          const trackerRow = [
            log.date,
            log.isPeriodStart ? "Yes" : "No",
            log.flow || "none",
            energyVal,
            moodStr,
            log.notes || ""
          ];
          trackerSheet.appendRow(trackerRow);
          menstrualSheet.appendRow(trackerRow);
        }
        
        if (moodStr !== "" || energyVal !== "" || (log.notes && log.notes.trim() !== "")) {
          moodSheet.appendRow([
            log.date,
            moodStr,
            energyVal,
            log.notes || ""
          ]);
        }
      });

      trackerSheet.getRange("A1:F1").setFontWeight("bold").setBackground("#fee2e2");
      menstrualSheet.getRange("A1:F1").setFontWeight("bold").setBackground("#fee2e2");
      moodSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#f3e8ff");
    }

    // 4. Update PeriodSettings sheet ONLY IF postData.updatePeriodSettings === true or postData.periodSettings provided
    if (postData.updatePeriodSettings === true || postData.periodSettings) {
      let settingsSheet = spreadsheet.getSheetByName("PeriodSettings");
      if (!settingsSheet) {
        settingsSheet = spreadsheet.insertSheet("PeriodSettings");
      }
      settingsSheet.clear();
      settingsSheet.appendRow(["Setting", "Value"]);
      const settings = postData.periodSettings || { periodLength: 5 };
      settingsSheet.appendRow(["periodLength", settings.periodLength || 5]);
      settingsSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#f0fdf4");
    }

    // 5. Update WeatherLogs sheet ONLY IF postData.updateWeatherLogs === true or postData.weatherLogs provided
    if (postData.updateWeatherLogs === true || Array.isArray(postData.weatherLogs)) {
      let weatherSheet = spreadsheet.getSheetByName("WeatherLogs");
      if (!weatherSheet) {
        weatherSheet = spreadsheet.insertSheet("WeatherLogs");
      }
      weatherSheet.clear();
      weatherSheet.appendRow(["Date", "Temperature (°C)", "Condition", "Humidity (%)", "Pressure (hPa)", "Advice"]);

      const weatherLogs = postData.weatherLogs || [];
      weatherLogs.forEach(function(w) {
        if (w.date) {
          weatherSheet.appendRow([
            w.date,
            w.temp !== undefined ? w.temp : "",
            w.condition || "",
            w.humidity !== undefined ? w.humidity : "",
            w.pressure !== undefined ? w.pressure : "",
            w.advice || ""
          ]);
        }
      });
      weatherSheet.getRange("A1:F1").setFontWeight("bold").setBackground("#fef3c7");
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getColumnLetter(colIndex) {
  let letter = "";
  while (colIndex > 0) {
    let temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    colIndex = (colIndex - temp - 1) / 26;
  }
  return letter;
}
