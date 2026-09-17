let league = null;
let scores = null;
let audioContext = null;
let musicTimer = null;
let musicPlaying = false;
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
const dataNote = document.querySelector("#dataNote");

if (dataNote) {
  dataNote.textContent = scores
    ? "Latest scoring data loaded."
    : "Automated scoring is being configured.";
}
    render();
    renderTeams();
    renderSchedule();
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
  const bonus1 = getBonus(week, team1.id);
  const bonus2 = getBonus(week, team2.id);
  html += `
    <div class="card">
      <div class="teamline">
  <strong>${team1.name}</strong>
  <span class="score">${score1}</span>
  ${bonus1 ? `<span class="bonus-earned">${bonus1}</span>` : ""}
</div>

      <div class="versus">VS.</div>

     <div class="teamline">
  <strong>${team2.name}</strong>
  <span class="score">${score2}</span>
  ${bonus2 ? `<span class="bonus-earned">${bonus2}</span>` : ""}
</div>
    </div>
  `;
});
  
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

return Number(scores.weeks[week][teamId]).toFixed(2);
}

function getBonus(week, teamId) {
  if (
    !scores ||
    !scores.details ||
    !scores.details[week] ||
    !scores.details[week][teamId]
  ) {
    return "";
  }

  const bonus = Number(scores.details[week][teamId].bonus || 0);

  return bonus > 0 ? `+${bonus} BONUS` : "";
}
function renderTeams() {
  const teamGrid = document.querySelector("#teamGrid");

  if (!teamGrid || !league) {
    return;
  }

  teamGrid.innerHTML = league.teams.map(team => {
    const roster = Object.entries(team.roster)
      .map(([position, name]) => {
        return `<div><b>${position}:</b> ${name}</div>`;
      })
      .join("");

    return `
      <div class="card">
        <h3>${team.name}</h3>
        <div class="roster">${roster}</div>
      </div>
    `;
  }).join("");
}
function renderSchedule() {
  const sched = document.querySelector("#sched");

  if (!sched || !league) {
    return;
  }

  const teamById = {};

  league.teams.forEach(team => {
    teamById[team.id] = team;
  });

  sched.innerHTML = Object.entries(league.schedule)
    .map(([week, matchups]) => {
      const games = matchups
        .map(pair => {
          const team1 = teamById[pair[0]];
          const team2 = teamById[pair[1]];

          return `<div>${team1.name} vs. ${team2.name}</div>`;
        })
        .join("");

      return `
        <div class="weekrow">
          <b>WEEK ${week}</b>
          ${games}
        </div>
      `;
    })
    .join("");
}
function playMusicBar() {
  if (!audioContext || !musicPlaying) {
    return;
  }

  const now = audioContext.currentTime;

  const notes = [
    [0.00, 130.81, 0.25],
    [0.35, 196.00, 0.25],
    [0.70, 261.63, 0.30],
    [1.10, 311.13, 0.25],
    [1.45, 392.00, 0.35],
    [1.95, 349.23, 0.25],
    [2.30, 311.13, 0.25],
    [2.65, 261.63, 0.50]
  ];

  notes.forEach(([offset, frequency, duration]) => {
    const horn = audioContext.createOscillator();
    const volume = audioContext.createGain();

    horn.type = "sawtooth";
    horn.frequency.value = frequency;

    volume.gain.setValueAtTime(0.0001, now + offset);
    volume.gain.exponentialRampToValueAtTime(
      0.06,
      now + offset + 0.02
    );
    volume.gain.exponentialRampToValueAtTime(
      0.0001,
      now + offset + duration
    );

    horn.connect(volume);
    volume.connect(audioContext.destination);

    horn.start(now + offset);
    horn.stop(now + offset + duration + 0.05);
  });
    const drumTimes = [0, 0.7, 1.45, 2.3];

  drumTimes.forEach(offset => {
    const drum = audioContext.createOscillator();
    const drumVolume = audioContext.createGain();

    drum.type = "sine";
    drum.frequency.setValueAtTime(110, now + offset);
    drum.frequency.exponentialRampToValueAtTime(
      45,
      now + offset + 0.15
    );

    drumVolume.gain.setValueAtTime(0.15, now + offset);
    drumVolume.gain.exponentialRampToValueAtTime(
      0.0001,
      now + offset + 0.2
    );

    drum.connect(drumVolume);
    drumVolume.connect(audioContext.destination);

    drum.start(now + offset);
    drum.stop(now + offset + 0.22);
  });
}
function startMusic() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  audioContext.resume();
  musicPlaying = true;

  playMusicBar();
  musicTimer = setInterval(playMusicBar, 3200);
}

function stopMusic() {
  musicPlaying = false;

  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const navButtons = document.querySelectorAll("nav button[data-view]");
  const sections = document.querySelectorAll("main > section");

navButtons.forEach(button => {
  button.addEventListener("click", () => {
    const target = button.dataset.view;

    sections.forEach(section => {
      section.hidden = section.id !== target;
    });
  });
});
  const weekSelect = document.querySelector("#week");

  if (weekSelect) {
    weekSelect.addEventListener("change", render);
  }

  const updateButton = document.querySelector("#updateScores");

  if (updateButton) {
    updateButton.addEventListener("click", start);
  }

    start();

  setInterval(start, 60 * 1000);
  const musicButton = document.querySelector("#musicToggle");

if (musicButton) {
  musicButton.addEventListener("click", () => {
    if (musicPlaying) {
      stopMusic();
      musicButton.textContent = "▶ PLAY MUSIC";
    } else {
      startMusic();
      musicButton.textContent = "■ STOP MUSIC";
    }
  });
}
});
