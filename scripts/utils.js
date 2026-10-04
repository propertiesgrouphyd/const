"use strict";

/*
 * CONSTITUTION 365
 * Shared Utility Functions
 *
 * Centralizes:
 * - Constitution 365 start date
 * - IST day calculation
 * - day number validation
 * - day filename generation
 * - JSON file helpers
 * - date formatting
 *
 * IMPORTANT:
 * Constitution 365 uses Asia/Kolkata / IST.
 * Do not calculate the program day from the GitHub runner's
 * local timezone.
 */

const fs = require("fs");
const path = require("path");


/*
 * ------------------------------------------------------------
 * CONSTANTS
 * ------------------------------------------------------------
 */

const TOTAL_DAYS = 365;

const PROGRAM_START_DATE =
  "2026-08-30";

const TIMEZONE =
  "Asia/Kolkata";

const DATA_DIRECTORY =
  path.resolve(
    __dirname,
    "..",
    "data"
  );


/*
 * ------------------------------------------------------------
 * VALIDATE DAY
 * ------------------------------------------------------------
 */

function assertValidDay(day) {
  const number =
    Number(day);

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > TOTAL_DAYS
  ) {
    throw new Error(
      `Invalid Constitution 365 day: ${day}. Expected 1-${TOTAL_DAYS}.`
    );
  }

  return number;
}


/*
 * ------------------------------------------------------------
 * DAY FILENAME
 * ------------------------------------------------------------
 */

function getDayFilename(day) {
  const number =
    assertValidDay(day);

  return (
    `day-${String(number).padStart(3, "0")}.json`
  );
}


/*
 * ------------------------------------------------------------
 * DAY FILE PATH
 * ------------------------------------------------------------
 */

function getDayFilePath(
  day,
  dataDirectory = DATA_DIRECTORY
) {
  return path.join(
    dataDirectory,
    getDayFilename(day)
  );
}


/*
 * ------------------------------------------------------------
 * IST DATE
 * ------------------------------------------------------------
 *
 * Returns YYYY-MM-DD in Asia/Kolkata.
 *
 * We use Intl.DateTimeFormat instead of relying on the
 * machine's timezone.
 * ------------------------------------------------------------
 */

function getISTDate(
  date = new Date()
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    );

  return formatter.format(
    date
  );
}


/*
 * ------------------------------------------------------------
 * PARSE YYYY-MM-DD
 * ------------------------------------------------------------
 *
 * Creates a UTC date representing the calendar date.
 *
 * This is safe for day-difference calculations because both
 * dates represent calendar days rather than local timestamps.
 * ------------------------------------------------------------
 */

function parseCalendarDate(
  dateString
) {
  if (
    typeof dateString !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      dateString
    )
  ) {
    throw new Error(
      `Invalid calendar date: ${dateString}`
    );
  }

  const date =
    new Date(
      `${dateString}T00:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      `Invalid calendar date: ${dateString}`
    );
  }

  return date;
}


/*
 * ------------------------------------------------------------
 * DATE DIFFERENCE
 * ------------------------------------------------------------
 */

function differenceInCalendarDays(
  startDate,
  endDate
) {
  const start =
    parseCalendarDate(
      startDate
    );

  const end =
    parseCalendarDate(
      endDate
    );

  return Math.floor(
    (
      end.getTime() -
      start.getTime()
    ) /
    86400000
  );
}


/*
 * ------------------------------------------------------------
 * GET PROGRAM DAY
 * ------------------------------------------------------------
 *
 * Day 1:
 * 2026-08-30
 *
 * Day 2:
 * 2026-08-31
 *
 * ...
 *
 * Day 365:
 * 2027-08-29
 *
 * Before start → null
 * After Day 365 → null
 * ------------------------------------------------------------
 */

function getProgramDay(
  date = new Date()
) {
  const currentDate =
    getISTDate(
      date
    );

  const difference =
    differenceInCalendarDays(
      PROGRAM_START_DATE,
      currentDate
    );

  const day =
    difference + 1;

  if (
    day < 1 ||
    day > TOTAL_DAYS
  ) {
    return null;
  }

  return day;
}


/*
 * ------------------------------------------------------------
 * GET PROGRAM DAY OR THROW
 * ------------------------------------------------------------
 */

function requireProgramDay(
  date = new Date()
) {
  const day =
    getProgramDay(
      date
    );

  if (day === null) {
    const currentDate =
      getISTDate(
        date
      );

    throw new Error(
      `Current IST date ${currentDate} is outside the Constitution 365 program period ${PROGRAM_START_DATE} through 2027-08-29.`
    );
  }

  return day;
}


/*
 * ------------------------------------------------------------
 * GET PROGRAM DATE FOR DAY
 * ------------------------------------------------------------
 *
 * Useful for testing and verification.
 * ------------------------------------------------------------
 */

function getProgramDate(
  day
) {
  const number =
    assertValidDay(day);

  const start =
    parseCalendarDate(
      PROGRAM_START_DATE
    );

  const result =
    new Date(
      start.getTime() +
      (
        number - 1
      ) *
      86400000
    );

  return result
    .toISOString()
    .slice(
      0,
      10
    );
}


/*
 * ------------------------------------------------------------
 * CHECK PROGRAM DATE
 * ------------------------------------------------------------ */

function isProgramDate(
  dateString
) {
  try {
    const date =
      parseCalendarDate(
        dateString
      );

    const day =
      getProgramDay(
        date
      );

    return day !== null;
  } catch {
    return false;
  }
}


/*
 * ------------------------------------------------------------
 * READ JSON
 * ------------------------------------------------------------ */

function readJson(
  filePath
) {
  if (
    !fs.existsSync(
      filePath
    )
  ) {
    throw new Error(
      `File not found: ${filePath}`
    );
  }

  const content =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  try {
    return JSON.parse(
      content
    );
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${filePath}: ${error.message}`
    );
  }
}


/*
 * ------------------------------------------------------------
 * WRITE JSON
 * ------------------------------------------------------------ */

function writeJson(
  filePath,
  data
) {
  fs.mkdirSync(
    path.dirname(
      filePath
    ),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      data,
      null,
      2
    ) + "\n",
    "utf8"
  );
}


/*
 * ------------------------------------------------------------
 * FILE EXISTS
 * ------------------------------------------------------------ */

function fileExists(
  filePath
) {
  return fs.existsSync(
    filePath
  );
}


/*
 * ------------------------------------------------------------
 * GET ALL DAY FILES
 * ------------------------------------------------------------ */

function getExistingDayFiles(
  dataDirectory = DATA_DIRECTORY
) {
  if (
    !fs.existsSync(
      dataDirectory
    )
  ) {
    return [];
  }

  return fs
    .readdirSync(
      dataDirectory
    )
    .filter(
      filename =>
        /^day-\d{3}\.json$/.test(
          filename
        )
    )
    .sort();
}


/*
 * ------------------------------------------------------------
 * EXTRACT DAY FROM FILENAME
 * ------------------------------------------------------------ */

function getDayFromFilename(
  filename
) {
  if (
    typeof filename !== "string"
  ) {
    return null;
  }

  const match =
    filename.match(
      /^day-(\d{3})\.json$/
    );

  if (!match) {
    return null;
  }

  const day =
    Number(
      match[1]
    );

  if (
    day < 1 ||
    day > TOTAL_DAYS
  ) {
    return null;
  }

  return day;
}


/*
 * ------------------------------------------------------------
 * GENERATION DATE INFORMATION
 * ------------------------------------------------------------ */

function getGenerationInfo(
  date = new Date()
) {
  const istDate =
    getISTDate(
      date
    );

  const programDay =
    getProgramDay(
      date
    );

  return {
    timezone: TIMEZONE,
    ist_date: istDate,
    program_start_date:
      PROGRAM_START_DATE,
    total_days:
      TOTAL_DAYS,
    program_day:
      programDay
  };
}


/*
 * ------------------------------------------------------------
 * CLI TEST
 * ------------------------------------------------------------
 *
 * Usage:
 *
 * node scripts/utils.js
 * ------------------------------------------------------------
 */

function runCli() {
  console.log(
    "\n=========================================="
  );

  console.log(
    "CONSTITUTION 365 — UTILITY TEST"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Timezone: ${TIMEZONE}`
  );

  console.log(
    `Program start: ${PROGRAM_START_DATE}`
  );

  console.log(
    `Total days: ${TOTAL_DAYS}`
  );

  console.log(
    `Current IST date: ${getISTDate()}`
  );

  console.log(
    `Current program day: ${
      getProgramDay() ?? "Outside program period"
    }`
  );

  console.log(
    "\nBoundary checks:"
  );

  console.log(
    `Day 1  → ${getProgramDate(1)}`
  );

  console.log(
    `Day 2  → ${getProgramDate(2)}`
  );

  console.log(
    `Day 365 → ${getProgramDate(365)}`
  );

  console.log(
    "\nFilename checks:"
  );

  console.log(
    `Day 1   → ${getDayFilename(1)}`
  );

  console.log(
    `Day 365 → ${getDayFilename(365)}`
  );

  console.log(
    "\nGeneration information:"
  );

  console.log(
    JSON.stringify(
      getGenerationInfo(),
      null,
      2
    )
  );

  console.log(
    "\nUtility test completed."
  );
}


/*
 * ------------------------------------------------------------
 * EXPORTS
 * ------------------------------------------------------------
 */

module.exports = {
  TOTAL_DAYS,
  PROGRAM_START_DATE,
  TIMEZONE,
  DATA_DIRECTORY,

  assertValidDay,
  getDayFilename,
  getDayFilePath,

  getISTDate,
  parseCalendarDate,
  differenceInCalendarDays,

  getProgramDay,
  requireProgramDay,
  getProgramDate,
  isProgramDate,

  readJson,
  writeJson,
  fileExists,

  getExistingDayFiles,
  getDayFromFilename,

  getGenerationInfo
};


/*
 * ------------------------------------------------------------
 * CLI ENTRY
 * ------------------------------------------------------------
 */

if (
  require.main === module
) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `\nUTILITY ERROR: ${error.message}`
    );

    process.exit(1);
  }
}
