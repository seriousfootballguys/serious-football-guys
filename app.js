let league = null;
let scores = null;

async function loadJSON(file) {
  const response = await fetch(file + "?v=" + Date.now());

  if (!response.ok) {
    throw new Error(`Could not load ${file}`);
  }

  return response.json();
}

async function start() {
  try {
    league = await loadJSON("./league.json");

    try {
      scores = await loadJSON("./scores.json");
    } catch {
      scores = null;
    }

    document.querySelector("#status").textContent =
      scores ? "SCORES LOADED" : "LEAGUE ONLINE";

    render();
  } catch (error) {
    console.error(error);

    document.querySelector("#status").textContent = "DATA ERROR";

    document.querySelector("#matchups").innerHTML =
      `<p>Unable to load league data: ${error.message}</p>`;
  }
}

function render() {
  const weekSelect = document.querySelector("#week");
  const week = weekSelect ? weekSelect.value : "1";

  const matchups = league.schedule[week] || [];

  const bonus =
    league.bonuses && league.bonuses[week]
      ? league.bonuses[week]
      : "No weekly bonus listed.";

  const bonusBox = document.querySelector("#bonus");
  if (bonusBox) {
    bonusBox.textContent = `★ 10-POINT WEEKLY BONUS ★ ${bonus}`;
  }

  const teamById = {};
  league.teams.forEach(team => {
    teamById[team.id] = team;
  });

  let html = `<h2>THIS WEEK'S MATCHUPS</h2>`;

  matchups.forEach(pair => {
    const team1 = teamById[pair[0]];
    const team2 = teamById[pair[1]];

    const score1 = getScore(week, team1.id);
    const score2 = getScore(week, team2.id);

    html += `
      <div class="matchup">
        <div>
          <strong>${team1.name}</strong>
          <span>${score1}</span>
        </div>

        <div class="vs">VS.</div>

        <div>
          <strong>${team2.name}</strong>
          <span>${score2}</span>
        </div>
      </div>
    `;
  });

  if (!scores) {
    html += `
      <p class="data-status">
        LIVE DATA STATUS: League site connected.
        Automated scoring is being configured.
      </p>
    `;
  }

  document.querySelector("#matchups").innerHTML = html;
}

function getScore(week, teamId) {
  if (
    !scores ||
    !scores.weeks ||
    !scores.weeks[week] ||
    scores.weeks[week][teamId] === undefined
  ) {
    return "--";
  }

  return Number(scores.weeks[week][teamId]).toFixed(1);
}

document.addEventListener("DOMContentLoaded", () => {
  const weekSelect = document.querySelector("#week");

  if (weekSelect) {
    weekSelect.addEventListener("change", render);
  }

  const updateButton = document.querySelector("#updateScores");

  if (updateButton) {
    updateButton.addEventListener("click", start);
  }

  start();
});
