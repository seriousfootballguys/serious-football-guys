import fs from "node:fs/promises";

const SEASON = 2026;
const MAX_LEAGUE_WEEK = 13;

const scoring = {
  pass_yd: 1 / 25,
  pass_td: 4,
  pass_int: -2,
  rush_yd: 1 / 10,
  rush_td: 6,
  rec: 0,
  rec_yd: 1 / 10,
  rec_td: 6,
  fum_lost: -2
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
  const today = new Date().toISOString().slice(0, 10);

  const rosterNames = [
    ...new Set(
      league.teams.flatMap(team => Object.values(team.roster))
    )
  ];

  const cached = await readJSON(cacheFile);

  if (
    cached &&
    cached.season === SEASON &&
    cached.generatedOn === today &&
    rosterNames.every(name => cached.players[name])
  ) {
    return cached.players;
  }

  console.log("Refreshing Sleeper player directory...");

  const players = await fetchJSON(
    "https://api.sleeper.app/v1/players/nfl?active=true"
  );

  const byName = {};

  for (const [playerId, player] of Object.entries(players)) {
    const fullName = normalize(
      `${player.first_name || ""} ${player.last_name || ""}`
    );

    if (fullName) {
      byName[fullName] = playerId;
    }
  }

  const ids = {};
  const missing = [];

  for (const name of rosterNames) {
    const lookupName = name === "Luther Burden III" ? "Luther Burden" : name;
const id = byName[normalize(lookupName)];

    if (id) {
      ids[name] = id;
    } else {
      missing.push(name);
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

    for (const [position, name] of Object.entries(team.roster)) {
      const playerId = playerIds[name];
      const playerStats = stats[playerId] || {};
      const points = fantasyPoints(playerStats);

      total += points;

      players.push({
        position,
        name,
        playerId,
        points
      });
    }

    total = Number(total.toFixed(2));

    output.weeks[String(week)][String(team.id)] = total;

    output.details[String(week)][String(team.id)] = {
      team: team.name,
      total,
      players
    };
  }
}

output.updatedAt = new Date().toISOString();

await fs.writeFile(
  "scores.json",
  JSON.stringify(output, null, 2) + "\n"
);

console.log("scores.json updated successfully.");
