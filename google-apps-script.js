/**
 * Google Apps Script for Health Tracker Spreadsheet Storage.
 * Paste this code into Extensions > Apps Script in your Google Sheet.
 * 
 * Google Sheet URL: https://docs.google.com/spreadsheets/d/1YNPRKs4AT9ipLiZ-97mElz7dipgiRUHQBaropNV8nIc/edit
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
    // Skip header row
    for (let i = 1; i < paramData.length; i++) {
      if (paramData[i][0]) {
        parameters.push({
          id: paramData[i][0].toString(),
          label: paramData[i][1].toString()
        });
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
      const headers = logsData[0].map(h => h.toString());
      // Skip header row
      for (let i = 1; i < logsData.length; i++) {
        const row = logsData[i];
        if (!row[0]) continue;
        
        const id = row[0].toString();
        
        // Handle Date conversion cleanly
        let dateVal = row[1];
        let dateStr = "";
        if (dateVal instanceof Date) {
          // Format date as YYYY-MM-DD in local time zone
          dateStr = Utilities.formatDate(dateVal, spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else {
          dateStr = dateVal ? dateVal.toString() : "";
        }
        
        const notes = row[2] ? row[2].toString() : "";
        const painLevels = {};
        
        // Map other columns (parameter IDs)
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
    
    const response = {
      parameters: parameters,
      logs: logs
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
    
    // 1. Update Parameters sheet
    let paramSheet = spreadsheet.getSheetByName("Parameters");
    if (paramSheet) {
      paramSheet.clear();
    } else {
      paramSheet = spreadsheet.insertSheet("Parameters");
    }
    paramSheet.appendRow(["ID", "Label"]);
    
    const parameters = postData.parameters || [];
    parameters.forEach(p => {
      paramSheet.appendRow([p.id, p.label]);
    });
    
    // Format the parameters table headers
    paramSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#f3f4f6");
    
    // 2. Update Logs sheet
    let logsSheet = spreadsheet.getSheetByName("Logs");
    if (logsSheet) {
      logsSheet.clear();
    } else {
      logsSheet = spreadsheet.insertSheet("Logs");
    }
    
    const paramIds = parameters.map(p => p.id);
    const headers = ["ID", "Date", "Notes"].concat(paramIds);
    logsSheet.appendRow(headers);
    
    const logs = postData.logs || [];
    logs.forEach(log => {
      const row = [
        log.id,
        log.date,
        log.notes || ""
      ];
      paramIds.forEach(paramId => {
        const val = log.painLevels && log.painLevels[paramId] !== undefined ? log.painLevels[paramId] : 0;
        row.push(val);
      });
      logsSheet.appendRow(row);
    });
    
    // Format the logs table headers
    if (headers.length > 0) {
      const lastColLetter = getColumnLetter(headers.length);
      logsSheet.getRange("A1:" + lastColLetter + "1").setFontWeight("bold").setBackground("#e0f2fe");
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper function to convert column index to letter (e.g. 1 -> A, 27 -> AA)
function getColumnLetter(colIndex) {
  let letter = "";
  while (colIndex > 0) {
    let temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    colIndex = (colIndex - temp - 1) / 26;
  }
  return letter;
}
