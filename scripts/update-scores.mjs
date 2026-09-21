import fs from "node:fs/promises";

const SEASON = 2026;
const MAX_LEAGUE_WEEK = 13;

const scoring = {
  pass_yd: 1 / 25,
  pass_td: 4,
  pass_int: -1,
  rush_yd: 1 / 10,
  rush_td: 6,
  rec: 0,
  rec_yd: 1 / 10,
  rec_td: 6,
  fum_lost: -1
};

const injuryReplacements = {
  "1": {
    "Brock Bowers": "Michael Mayer"
  },
  "2": {
    "Brock Bowers": "Michael Mayer"
  }
};

const inGameInjuryAdditions = {
  "2": {
    "Caleb Williams": "Tyson Bagent",
    "Cole Kmet": "Colston Loveland"
  }
};

function normalize(name) {
  return String(name)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function fantasyPoints(stats = {}) {
  const total =
    (stats.pass_yd || 0) * scoring.pass_yd +
    (stats.pass_td || 0) * scoring.pass_td +
    (stats.pass_int || 0) * scoring.pass_int +
    (stats.rush_yd || 0) * scoring.rush_yd +
    (stats.rush_td || 0) * scoring.rush_td +
    (stats.rec || 0) * scoring.rec +
    (stats.rec_yd || 0) * scoring.rec_yd +
    (stats.rec_td || 0) * scoring.rec_td +
    (stats.fum_lost || 0) * scoring.fum_lost;

  return Number(total.toFixed(2));
}

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${response.status} from ${url}`);
  }

  return response.json();
}

async function readJSON(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function getPlayerIds(league) {
  const cacheFile = "player-ids.json";
  const cacheVersion = 2;
  const today = new Date().toISOString().slice(0, 10);

  const positionByName = {};

  for (const team of league.teams) {
    for (const [position, name] of Object.entries(team.roster)) {
      positionByName[name] = position;
    }
  }

  const replacementNames = [];

  for (const replacements of Object.values(injuryReplacements)) {
    for (const [injuredName, replacementName] of Object.entries(replacements)) {
      const position = positionByName[injuredName];

      if (position) {
        positionByName[replacementName] = position;
      }

      replacementNames.push(replacementName);
    }
  }

  for (const additions of Object.values(inGameInjuryAdditions)) {
  for (const [injuredName, backupName] of Object.entries(additions)) {
    const position = positionByName[injuredName];

    if (position) {
      positionByName[backupName] = position;
    }

    replacementNames.push(backupName);
  }
}

  const rosterNames = [
    ...new Set([
      ...league.teams.flatMap(team => Object.values(team.roster)),
      ...replacementNames
    ])
  ];

  const cached = await readJSON(cacheFile);

  if (
    cached &&
    cached.season === SEASON &&
    cached.cacheVersion === cacheVersion &&
    cached.generatedOn === today &&
    rosterNames.every(name => cached.players[name])
  ) {
    return cached.players;
  }

  console.log("Refreshing Sleeper player directory...");

  const players = await fetchJSON(
    "https://api.sleeper.app/v1/players/nfl?active=true"
  );

  const byNameAndPosition = {};

  for (const [playerId, player] of Object.entries(players)) {
    const fullName = normalize(
      `${player.first_name || ""} ${player.last_name || ""}`
    );

    const positions = [
      player.position,
      ...(Array.isArray(player.fantasy_positions)
        ? player.fantasy_positions
        : [])
    ].filter(Boolean);

    for (const position of new Set(positions)) {
      byNameAndPosition[`${fullName}|${position}`] = playerId;
    }
  }

  const ids = {};
  const missing = [];

  for (const name of rosterNames) {
    const lookupName =
      name === "Luther Burden III" ? "Luther Burden" : name;

    const expectedPosition = positionByName[name];

    const id =
      byNameAndPosition[
        `${normalize(lookupName)}|${expectedPosition}`
      ];

    if (id) {
      ids[name] = id;
    } else {
      missing.push(`${name} (${expectedPosition})`);
    }
  }

  if (missing.length) {
    throw new Error(
      `Could not find Sleeper IDs for: ${missing.join(", ")}`
    );
  }

  await fs.writeFile(
    cacheFile,
    JSON.stringify(
      {
        season: SEASON,
        cacheVersion,
        generatedOn: today,
        players: ids
      },
      null,
      2
    ) + "\n"
  );

  return ids;
}
async function getWeeklyStats(week) {
  const urls = [
    `https://api.sleeper.com/stats/nfl/${SEASON}/${week}?season_type=regular`,
    `https://api.sleeper.com/stats/nfl/regular/${SEASON}/${week}`
  ];

  for (const url of urls) {
    try {
      const data = await fetchJSON(url);

      if (Array.isArray(data)) {
        return data;
      }

      if (data && typeof data === "object") {
        return Object.entries(data).map(([player_id, stats]) => ({
          player_id,
          stats
        }));
      }
    } catch (error) {
      console.log(`Stats URL failed: ${error.message}`);
    }
  }

  throw new Error(`Unable to retrieve stats for Week ${week}`);
}

function makeStatMap(rows) {
  const map = {};

  for (const row of rows) {
    const id = String(
      row.player_id ??
      row.player?.player_id ??
      ""
    );

    if (id) {
      map[id] = row.stats || row;
    }
  }

  return map;
}

const league = await readJSON("league.json");

if (!league) {
  throw new Error("league.json could not be loaded");
}

const nflState = await fetchJSON(
  "https://api.sleeper.app/v1/state/nfl"
);

const currentWeek = Math.max(
  1,
  Math.min(
    MAX_LEAGUE_WEEK,
    Number(nflState.week || 1)
  )
);

console.log(`Updating Weeks 1-${currentWeek}`);

const playerIds = await getPlayerIds(league);

const output =
  (await readJSON("scores.json")) || {
    season: SEASON,
    scoring,
    weeks: {},
    details: {}
  };

output.season = SEASON;
output.scoring = scoring;

for (let week = 1; week <= currentWeek; week++) {
  console.log(`Scoring Week ${week}...`);

  const rows = await getWeeklyStats(week);
  const stats = makeStatMap(rows);

  output.weeks[String(week)] = {};
  output.details[String(week)] = {};

  for (const team of league.teams) {
    let total = 0;
    const players = [];
   let qbInterceptions = 0;
let fumblesLost = 0;
let passingTDs = 0;
let tightEndTDs = 0;
let runningBackTDs = 0;
let qbRushingTDs = 0;
let qbRushingYards = 0;
let longestTD = 0;
let totalYards = 0;;

for (const [position, name] of Object.entries(team.roster)) {
  const replacement =
    injuryReplacements[String(week)]?.[name] || null;

  const scoringName = replacement || name;
  const playerId = playerIds[scoringName];
  const playerStats = stats[playerId] || {};
  const points = fantasyPoints(playerStats);

  const injuryAddition =
  inGameInjuryAdditions[String(week)]?.[name] || null;

let injuryAdditionPoints = 0;
let injuryAdditionStats = {};

if (injuryAddition) {
  const backupId = playerIds[injuryAddition];
  injuryAdditionStats = stats[backupId] || {};

  injuryAdditionPoints = fantasyPoints(injuryAdditionStats);
}
 for (const bonusStats of [playerStats, injuryAdditionStats]) {
  fumblesLost += Number(bonusStats.fum_lost || 0);
  passingTDs += Number(bonusStats.pass_td || 0);

  totalYards +=
    Number(bonusStats.pass_yd || 0) +
    Number(bonusStats.rush_yd || 0) +
    Number(bonusStats.rec_yd || 0);

  longestTD = Math.max(
    longestTD,
    Number(bonusStats.rush_td_lng || 0),
    Number(bonusStats.rec_td_lng || 0)
  );

  if (position === "QB") {
    qbInterceptions += Number(bonusStats.pass_int || 0);
    qbRushingTDs += Number(bonusStats.rush_td || 0);
    qbRushingYards += Number(bonusStats.rush_yd || 0);
  }

  if (position === "TE") {
    tightEndTDs +=
      Number(bonusStats.rush_td || 0) +
      Number(bonusStats.rec_td || 0);
  }

  if (position === "RB") {
    runningBackTDs +=
      Number(bonusStats.rush_td || 0) +
      Number(bonusStats.rec_td || 0);
  }
}
  
  total += points + injuryAdditionPoints;

 players.push({
  position,
  name,
  replacement,
  scoringName,
  playerId,
  points,
  injuryAddition,
  injuryAdditionPoints
});
}

    total = Number(total.toFixed(2));

    output.weeks[String(week)][String(team.id)] = total;

   output.details[String(week)][String(team.id)] = {
  team: team.name,
  total,
  qbInterceptions,
  fumblesLost,
  passingTDs,
  tightEndTDs,
  runningBackTDs,
  qbRushingTDs,
  qbRushingYards,
  longestTD,
  totalYards,
  players
};
  
}

const automaticBonusRules = {
  "1": { field: "qbInterceptions", direction: "max" },
  "2": { field: "fumblesLost", direction: "max" },
  "4": { field: "passingTDs", direction: "max" },
  "5": { field: "tightEndTDs", direction: "max" },
  "6": { field: "runningBackTDs", direction: "max" },
  "7": { field: "qbRushingTDs", direction: "max" },
  "8": { field: "qbRushingYards", direction: "max" },
  "9": { field: "longestTD", direction: "max" },
  "11": { field: "total", direction: "min" },
  "13": { field: "totalYards", direction: "max" }
};

const bonusRule = automaticBonusRules[String(week)];

if (bonusRule) {
  const weekDetails = output.details[String(week)];

  const values = Object.values(weekDetails).map(
    team => Number(team[bonusRule.field] || 0)
  );

  const winningValue =
    bonusRule.direction === "min"
      ? Math.min(...values)
      : Math.max(...values);

  for (const [teamId, teamDetail] of Object.entries(weekDetails)) {
    const teamValue = Number(teamDetail[bonusRule.field] || 0);

    if (teamValue === winningValue) {
      teamDetail.bonus = 10;
      teamDetail.total = Number(
        (teamDetail.total + 10).toFixed(2)
      );

      output.weeks[String(week)][teamId] = teamDetail.total;
    } else {
      teamDetail.bonus = 0;
    }
  }
}
  const pickBonusWeeks = ["3", "10", "12"];

if (pickBonusWeeks.includes(String(week))) {
  const weekKey = String(week);
  const winningPick = league.bonusWinners?.[weekKey];
  const picks = league.bonusPicks?.[weekKey] || {};

  for (const [teamId, teamDetail] of Object.entries(
    output.details[weekKey]
  )) {
    const teamPick = picks[teamId];

    if (winningPick && teamPick === winningPick) {
      teamDetail.bonus = 10;
      teamDetail.total = Number(
        (teamDetail.total + 10).toFixed(2)
      );

      output.weeks[weekKey][teamId] = teamDetail.total;
    } else {
      teamDetail.bonus = 0;
    }
  }
}
}
output.updatedAt = new Date().toISOString();

await fs.writeFile(
  "scores.json",
  JSON.stringify(output, null, 2) + "\n"
);

console.log("scores.json updated successfully.");
