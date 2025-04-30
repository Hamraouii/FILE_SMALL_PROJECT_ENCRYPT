// File: utils/fileUtils.js

const exceljs = require('exceljs');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

/**
 * Detect file type based on extension or mime type
 * @param {string} filename - Original file name
 * @param {string} mimeType - The mime type of the file (optional)
 * @returns {string} The detected file type
 */
function detectFileType(filename, mimeType) {
  const ext = path.extname(filename).toLowerCase();
  
  if (['.csv'].includes(ext)) {
    return 'csv';
  } else if (['.xls', '.xlsx', '.xlsm'].includes(ext)) {
    return 'excel';
  } else if (['.txt', '.text'].includes(ext)) {
    return 'text';
  } else if (['.json'].includes(ext)) {
    return 'json';
  } else if (['.pdf'].includes(ext)) {
    return 'pdf';
  } else {
    return 'binary';
  }
}

/**
 * Process CSV file
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {Function} callback - Callback function
 */
function processCSV(fileBuffer, callback) {
  const results = [];
  const readable = new Readable();
  readable.push(fileBuffer);
  readable.push(null);
  
  readable
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      callback(null, {
        type: 'csv',
        data: results
      });
    })
    .on('error', (err) => {
      callback(err);
    });
}

/**
 * Process Excel file
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {Function} callback - Callback function
 */
async function processExcel(fileBuffer, callback) {
  try {
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const result = {
      type: 'excel',
      sheets: {}
    };
    
    workbook.eachSheet((worksheet, sheetId) => {
      const sheetName = worksheet.name;
      const rows = [];
      
      worksheet.eachRow((row, rowNumber) => {
        rows.push(row.values.slice(1)); // Remove the first undefined element
      });
      
      result.sheets[sheetName] = rows;
    });
    
    callback(null, result);
  } catch (error) {
    callback(error);
  }
}

/**
 * Process file based on its type
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} filename - Original file name
 * @param {Function} callback - Callback function
 */
function processFile(fileBuffer, filename, callback) {
  const fileType = detectFileType(filename);
  
  switch (fileType) {
    case 'csv':
      return processCSV(fileBuffer, callback);
    case 'excel':
      return processExcel(fileBuffer, callback);
    default:
      // For other file types, just return the buffer
      return callback(null, {
        type: fileType,
        data: fileBuffer
      });
  }
}

module.exports = {
  detectFileType,
  processFile
};