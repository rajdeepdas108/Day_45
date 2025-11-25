// =============================
// 45-Day Study Challenge Logic
// =============================

const DAYS = 45;
const GOAL_HOURS = 8;
const STORAGE_KEY = "study45_state_v2";

// =============================
// Firebase Configuration
// =============================
const firebaseConfig = {
  apiKey: "AIzaSyA7HDA2OuN4QijPd1Jakdk6MfkwRO9MHJ0",
  authDomain: "day45-ddf57.firebaseapp.com",
  projectId: "day45-ddf57",
  storageBucket: "day45-ddf57.firebasestorage.app",
  messagingSenderId: "443505111604",
  appId: "1:443505111604:web:a6595a25698bf638ded061"
};

// Initialize Firebase
let db, auth, userUid;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
  
  // Enable offline persistence
  db.enablePersistence().catch(err => {
    if (err.code == 'failed-precondition') {
        console.warn("Persistence failed: Multiple tabs open");
    } else if (err.code == 'unimplemented') {
        console.warn("Persistence not supported by browser");
    }
  });
} catch (e) {
  console.warn("Firebase not initialized. Check config.");
}

function _(s) {
  return document.querySelector(s);
}

// Format seconds → HH:MM:SS
function formatTime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function toHours(sec) {
  return +(sec / 3600).toFixed(2);
}

// =============================
// State Management
// =============================

let state = {
  startDate: null,
  days: Array(DAYS).fill(0),
  sessions: [], // { dayIndex, startISO, endISO, seconds }
  forest: [], // { id, date, dayIndex, growthStage, type, createdAt }
  theme: "light",
  remindersEnabled: false,
  updatedAt: 0
};

// Load from LocalStorage first
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const local = JSON.parse(raw);
      // Merge to ensure new fields exist
      state = { ...state, ...local };
    } catch (e) {
      console.warn("State corrupted, resetting...");
    }
  } else {
    state.startDate = new Date().toISOString().slice(0, 10);
  }
  updateReminderButton();
}

function saveState() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  debouncedSaveToCloud();
}

// =============================
// Cloud Sync
// =============================

function initAuth() {
  if (!auth) return;
  auth.signInAnonymously().catch((error) => {
    console.error("Auth Error:", error);
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      userUid = user.uid;
      console.log("Signed in as", userUid);
      loadFromCloud();
    }
  });
}

function loadFromCloud() {
  if (!db || !userUid) return;
  
  db.collection("users").doc(userUid).get().then((doc) => {
    if (doc.exists) {
      const remote = doc.data();
      // Simple conflict resolution: Last write wins based on updatedAt
      if (remote.updatedAt > (state.updatedAt || 0)) {
        console.log("Cloud data is newer, syncing...");
        state = { ...state, ...remote };
        saveState(); // Update local storage
        init(); // Re-render UI
      } else {
        console.log("Local data is newer or same.");
      }
    } else {
      // First time user in cloud
      saveToCloud();
    }
  }).catch((error) => {
    console.error("Error getting document:", error);
  });
}

let saveTimeout;
function debouncedSaveToCloud() {
  if (!db || !userUid) return;
  
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveToCloud();
  }, 2000); // 2 seconds debounce
}

function saveToCloud() {
  if (!db || !userUid) return;
  
  db.collection("users").doc(userUid).set(state, { merge: true })
    .then(() => console.log("Saved to cloud"))
    .catch((error) => console.error("Error writing document: ", error));
}

// =============================
// Day Calculation Helpers
// =============================

function getTodayIndex() {
  if (!state.startDate) return null;
  const start = new Date(state.startDate + "T00:00:00");
  const today = new Date();
  // Reset time part for accurate day diff
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diff = Math.floor((todayMidnight - startMidnight) / (1000 * 60 * 60 * 24));
  if (diff < 0 || diff >= DAYS) return null;
  return diff;
}

// =============================
// Streak Calculations
// =============================

function computeStreaks() {
  let current = 0,
    longest = 0,
    run = 0;

  for (let i = 0; i < DAYS; i++) {
    if (state.days[i] / 3600 >= GOAL_HOURS) run++;
    else {
      longest = Math.max(longest, run);
      run = 0;
    }
  }
  longest = Math.max(longest, run);

  const today = getTodayIndex();
  if (today !== null) {
    for (let i = today; i >= 0; i--) {
      if (state.days[i] / 3600 >= GOAL_HOURS) current++;
      else break;
    }
  }

  return { current, longest };
}

// =============================
// Render Grid
// =============================

const daysGrid = _("#daysGrid");

function renderDays() {
  daysGrid.innerHTML = "";
  const start = new Date(state.startDate + "T00:00:00");

  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    // Manually format date to YYYY-MM-DD to avoid timezone issues with toISOString()
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const hours = toHours(state.days[i]);
    const el = document.createElement("div");
    el.className = "day-card";
    el.dataset.index = i;

    el.innerHTML = `
      <div class="day-title">Day ${i + 1} — <span class="small">${dateStr}</span></div>
      <div>${hours.toFixed(2)} hrs</div>
      ${hours >= GOAL_HOURS ? `<div class="complete">COMPLETED</div>` : ""}
      <button class="btn" data-action="edit" style="margin-top:10px; width:100%">Edit</button>
    `;

    daysGrid.appendChild(el);
  }
}

// =============================
// Chart.js Integration
// =============================

let chartInstance = null;

function renderChart() {
  const ctx = _("#progressChart").getContext("2d");
  const labels = Array.from({ length: DAYS }, (_, i) => `Day ${i + 1}`);
  const data = state.days.map((sec) => toHours(sec));

  const color = state.theme === "dark" ? "#5fb0ff" : "#007aff";
  const gridColor = state.theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";
  const textColor = state.theme === "dark" ? "#e2e8f0" : "#1f2937";

  if (chartInstance) {
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = color;
    chartInstance.data.datasets[0].borderColor = color;
    chartInstance.options.scales.x.grid.color = gridColor;
    chartInstance.options.scales.y.grid.color = gridColor;
    chartInstance.options.scales.x.ticks.color = textColor;
    chartInstance.options.scales.y.ticks.color = textColor;
    chartInstance.update();
  } else {
    chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Hours Studied",
            data: data,
            backgroundColor: color,
            borderColor: color,
            borderWidth: 0,
            borderRadius: 6,
            hoverBackgroundColor: state.theme === "dark" ? "#8ec8ff" : "#005ecb",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 1000,
            easing: 'easeOutQuart'
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 12, 
            grid: { color: gridColor, borderDash: [5, 5] },
            ticks: { color: textColor }
          },
          x: {
            grid: { display: false },
            ticks: { color: textColor, maxTicksLimit: 10 }
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
              backgroundColor: state.theme === "dark" ? "#2d3748" : "#fff",
              titleColor: state.theme === "dark" ? "#fff" : "#000",
              bodyColor: state.theme === "dark" ? "#fff" : "#000",
              borderColor: state.theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
              borderWidth: 1,
              padding: 10,
              displayColors: false,
          }
        },
      },
    });
  }
}

// =============================
// Summary Panel Updates
// =============================

function updateSummary() {
  const totalSec = state.days.reduce((a, b) => a + b, 0);
  const totalHours = toHours(totalSec);
  const completed = state.days.filter((s) => s / 3600 >= GOAL_HOURS).length;
  const avg = totalHours / DAYS;
  const best = Math.max(...state.days);
  const bestIndex = state.days.indexOf(best);
  const percent = Math.round((completed / DAYS) * 100);

  _("#totalHours").textContent = totalHours.toFixed(2) + " hrs";
  _("#daysCompleted").textContent = `${completed} / ${DAYS} days`;

  const streak = computeStreaks();
  _("#streak").textContent = streak.current;
  _("#longest").textContent = streak.longest;

  _("#avgDay").textContent = avg.toFixed(2) + " hrs";
  _("#bestDay").textContent =
    best > 0
      ? `Day ${bestIndex + 1} — ${toHours(best).toFixed(2)} hrs`
      : "-";
  _("#percent").textContent = percent + "%";

  updateTodayStats();
  renderDays();
  renderChart();
}

// =============================
// Today's Stats
// =============================

function updateTodayStats() {
  const today = getTodayIndex();
  if (today === null) {
    _("#todayLabel").textContent = "Challenge not started or ended";
    return;
  }
  
  const start = new Date(state.startDate + "T00:00:00");
  const d = new Date(start);
  d.setDate(start.getDate() + today);
  _("#todayLabel").textContent = d.toDateString();

  const sec = state.days[today];
  const hrs = toHours(sec);

  _("#todayHours").textContent = hrs.toFixed(2) + " hrs";
  _("#hourProgress").style.width = `${Math.min((sec / (GOAL_HOURS * 3600)) * 100, 100)}%`;
}

// =============================
// Timer Logic & Session Tracking
// =============================

let timer = {
  running: false,
  sec: 0,
  id: null,
  sessionStart: null,
  startTime: null,
  startTotalSeconds: 0
};

function loadTodayTimer() {
  const idx = getTodayIndex();
  if (idx !== null) timer.sec = state.days[idx];
  _("#displayTimer").textContent = formatTime(timer.sec);
}

function startTimer() {
  if (timer.running) return;
  
  const idx = getTodayIndex();
  if (idx === null) {
    alert("Please set a valid start date first!");
    return;
  }

  timer.running = true;
  timer.sessionStart = new Date().toISOString();
  
  // Fix for background throttling:
  // Store the timestamp when we started, and the total seconds at that moment.
  timer.startTime = Date.now();
  timer.startTotalSeconds = timer.sec;
  
  _("#startBtn").disabled = true;
  _("#pauseBtn").disabled = false;
  _("#startBtn").classList.add("active");

  timer.id = setInterval(() => {
    // Calculate elapsed time based on system clock difference
    const now = Date.now();
    const elapsed = Math.floor((now - timer.startTime) / 1000);
    const newTotal = timer.startTotalSeconds + elapsed;
    
    // Only update if time has actually advanced (prevents glitches if system time changes backwards slightly)
    if (newTotal > timer.sec) {
        timer.sec = newTotal;
        _("#displayTimer").textContent = formatTime(timer.sec);

        const idx = getTodayIndex();
        if (idx !== null) {
          state.days[idx] = timer.sec;
          // We don't save to cloud every second, but we update local state
          // Debounced save is called here to ensure we don't lose too much data on crash
          if (timer.sec % 60 === 0) {
              saveState(); 
          }
          updateSummary();
          renderTodayTree(); // Update tree growth in real-time
        }

        if (timer.sec === GOAL_HOURS * 3600) {
          sendNotification("Goal Reached!", "You've studied for 8 hours today!");
          showMotivation("Wow! You completed 8 hours today!");
          plantTree(idx); // Plant tree when goal reached
        }

        // Hourly Reminder
        if (state.remindersEnabled && timer.sec > 0 && timer.sec % 3600 === 0) {
          const hours = timer.sec / 3600;
          sendNotification("Hourly Update", `You've studied for ${hours} hour${hours > 1 ? 's' : ''}. Keep it up!`);
        }
    }
  }, 1000);
}

function pauseTimer() {
  if (!timer.running) return;
  
  clearInterval(timer.id);
  timer.running = false;
  _("#startBtn").disabled = false;
  _("#pauseBtn").disabled = true;
  _("#startBtn").classList.remove("active");

  // Log Session
  if (timer.sessionStart) {
      const idx = getTodayIndex();
      const endISO = new Date().toISOString();
      const startISO = timer.sessionStart;
      const start = new Date(startISO);
      const end = new Date(endISO);
      const durationSeconds = Math.round((end - start) / 1000);

      if (durationSeconds > 0 && idx !== null) {
          const session = {
              dayIndex: idx,
              startISO: startISO,
              endISO: endISO,
              seconds: durationSeconds
          };
          state.sessions.push(session);
          
          // Cloud Sync: Append session using arrayUnion if possible, 
          // but since we sync whole state object for simplicity in this architecture:
          saveState();
      }
      timer.sessionStart = null;
  }
}

function resetTimer() {
  if(confirm("Reset today's timer?")) {
    pauseTimer();
    const idx = getTodayIndex();
    if (idx !== null) {
      state.days[idx] = 0;
      saveState();
      timer.sec = 0;
      updateSummary();
      loadTodayTimer();
    }
  }
}

// =============================
// Motivation
// =============================

const MESSAGES = [
  "You got this! Stay focused.",
  "Small steps daily = big wins.",
  "Consistency beats intensity.",
  "Keep going. You're doing great.",
  "Focus on the process, not the outcome.",
  "Every hour counts.",
];

function showMotivation(m) {
  _("#motivation").textContent = m;
}

function rotateMotivation() {
  showMotivation(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
}

// =============================
// Theme Toggle
// =============================

function applyTheme() {
  document.documentElement.setAttribute(
    "data-theme",
    state.theme === "dark" ? "dark" : "light"
  );
  renderChart(); // Re-render chart to update colors
}

// =============================
// Notifications
// =============================

function updateReminderButton() {
  const btn = _("#notifyBtn");
  if (state.remindersEnabled) {
    btn.textContent = "🔔 Reminders: On";
    btn.classList.add("active");
  } else {
    btn.textContent = "🔔 Reminders: Off";
    btn.classList.remove("active");
  }
}

function toggleReminders() {
  if (!("Notification" in window)) {
    alert("This browser does not support desktop notification");
    return;
  }

  if (Notification.permission === "granted") {
    state.remindersEnabled = !state.remindersEnabled;
    saveState();
    updateReminderButton();
    if (state.remindersEnabled) {
      new Notification("Reminders Enabled", { body: "We'll notify you every hour." });
    }
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        state.remindersEnabled = true;
        saveState();
        updateReminderButton();
        new Notification("Reminders Enabled", { body: "We'll notify you every hour." });
      }
    });
  } else {
    alert("Notifications are denied. Please enable them in browser settings.");
  }
}

function sendNotification(title, body) {
  if (state.remindersEnabled && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

// =============================
// Export
// =============================

function exportCSV() {
  let csvContent = "data:text/csv;charset=utf-8,Day,Date,Hours,Status\n";
  const start = new Date(state.startDate + "T00:00:00");

  state.days.forEach((sec, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    
    // Use local date components to avoid timezone shifts
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const hrs = toHours(sec);
    const status = hrs >= GOAL_HOURS ? "Completed" : "Incomplete";
    csvContent += `${i + 1},${dateStr},${hrs},${status}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "study_challenge_progress.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("45-Day Study Challenge Report", 14, 22);
  
  doc.setFontSize(11);
  doc.text(`Start Date: ${state.startDate}`, 14, 30);
  doc.text(`Total Hours: ${toHours(state.days.reduce((a,b)=>a+b,0)).toFixed(2)}`, 14, 36);

  const tableData = state.days.map((sec, i) => {
      const start = new Date(state.startDate + "T00:00:00");
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      
      // Use local date components to avoid timezone shifts
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const hrs = toHours(sec);
      return [i + 1, dateStr, hrs.toFixed(2), hrs >= GOAL_HOURS ? "Yes" : "No"];
  });

  doc.autoTable({
      startY: 45,
      head: [['Day', 'Date', 'Hours', 'Completed']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [49, 130, 206] }
  });

  doc.save("study_challenge_report.pdf");
}

// =============================
// Tree & Forest Logic
// =============================

const TREE_STAGES = 5;

// SVG Generators for Tree Stages
function getTreeSVG(stage, type = 'normal') {
    const colors = {
        normal: { trunk: '#8B5A2B', leaf: '#34C759', leafDark: '#248A3D' },
        golden: { trunk: '#B8860B', leaf: '#FFD700', leafDark: '#DAA520' },
        crystal: { trunk: '#5F9EA0', leaf: '#A7FFE4', leafDark: '#40E0D0' },
        mythic: { trunk: '#4B0082', leaf: '#AB7CFF', leafDark: '#8A2BE2' }
    };
    
    const c = colors[type] || colors.normal;
    
    // Stage 1: Sprout
    if (stage === 1) return `
        <svg viewBox="0 0 100 100" class="tree-svg grow-pop">
            <path d="M50 90 Q50 70 40 60" stroke="${c.leaf}" stroke-width="3" fill="none" />
            <path d="M50 90 Q50 75 60 65" stroke="${c.leaf}" stroke-width="3" fill="none" />
            <ellipse cx="40" cy="60" rx="5" ry="8" fill="${c.leaf}" transform="rotate(-20 40 60)" />
            <ellipse cx="60" cy="65" rx="5" ry="8" fill="${c.leaf}" transform="rotate(20 60 65)" />
        </svg>`;

    // Stage 2: Seedling
    if (stage === 2) return `
        <svg viewBox="0 0 100 100" class="tree-svg grow-pop">
            <path d="M50 90 L50 60" stroke="${c.trunk}" stroke-width="4" stroke-linecap="round" />
            <path d="M50 70 Q30 60 35 50" stroke="${c.leaf}" stroke-width="3" fill="none" />
            <path d="M50 75 Q70 65 65 55" stroke="${c.leaf}" stroke-width="3" fill="none" />
            <circle cx="35" cy="50" r="6" fill="${c.leaf}" />
            <circle cx="65" cy="55" r="6" fill="${c.leaf}" />
            <circle cx="50" cy="55" r="8" fill="${c.leafDark}" />
        </svg>`;

    // Stage 3: Sapling
    if (stage === 3) return `
        <svg viewBox="0 0 100 100" class="tree-svg grow-pop">
            <path d="M50 90 L50 50" stroke="${c.trunk}" stroke-width="6" stroke-linecap="round" />
            <circle cx="50" cy="45" r="20" fill="${c.leaf}" />
            <circle cx="40" cy="55" r="15" fill="${c.leafDark}" opacity="0.8" />
            <circle cx="60" cy="55" r="15" fill="${c.leafDark}" opacity="0.8" />
        </svg>`;

    // Stage 4: Young Tree
    if (stage === 4) return `
        <svg viewBox="0 0 100 100" class="tree-svg grow-pop sway">
            <path d="M50 90 L50 40" stroke="${c.trunk}" stroke-width="8" stroke-linecap="round" />
            <path d="M50 40 L30 20" stroke="${c.trunk}" stroke-width="4" />
            <path d="M50 40 L70 20" stroke="${c.trunk}" stroke-width="4" />
            <circle cx="50" cy="30" r="25" fill="${c.leaf}" />
            <circle cx="30" cy="40" r="18" fill="${c.leafDark}" />
            <circle cx="70" cy="40" r="18" fill="${c.leafDark}" />
            <circle cx="50" cy="15" r="15" fill="${c.leaf}" />
        </svg>`;

    // Stage 5: Mature Tree
    return `
        <svg viewBox="0 0 100 100" class="tree-svg grow-pop sway">
            <path d="M50 95 L50 40" stroke="${c.trunk}" stroke-width="10" stroke-linecap="round" />
            <circle cx="50" cy="35" r="30" fill="${c.leaf}" />
            <circle cx="25" cy="50" r="20" fill="${c.leafDark}" />
            <circle cx="75" cy="50" r="20" fill="${c.leafDark}" />
            <circle cx="35" cy="25" r="22" fill="${c.leaf}" />
            <circle cx="65" cy="25" r="22" fill="${c.leaf}" />
            ${type === 'golden' ? '<circle cx="50" cy="35" r="35" fill="url(#goldGrad)" opacity="0.3"/>' : ''}
            ${type === 'mythic' ? '<circle cx="50" cy="35" r="40" stroke="#AB7CFF" stroke-width="1" fill="none" opacity="0.5"/>' : ''}
        </svg>`;
}

function getTreeStage(seconds) {
    const progress = Math.min(seconds / (GOAL_HOURS * 3600), 1);
    if (progress < 0.2) return 1;
    if (progress < 0.4) return 2;
    if (progress < 0.6) return 3;
    if (progress < 0.8) return 4;
    return 5;
}

function getTreeType(streak) {
    if (streak >= 20) return 'mythic';
    if (streak >= 10) return 'crystal';
    if (streak >= 5) return 'golden';
    return 'normal';
}

function renderTodayTree() {
    const idx = getTodayIndex();
    if (idx === null) return;
    
    const sec = state.days[idx];
    const stage = getTreeStage(sec);
    const streak = computeStreaks().current;
    const type = getTreeType(streak);
    
    const container = _("#todayTreeContainer");
    const label = _("#treeStageLabel");
    
    // Only update if changed to avoid re-animating constantly
    const currentStage = container.dataset.stage;
    if (currentStage != stage) {
        container.innerHTML = getTreeSVG(stage, type);
        container.dataset.stage = stage;
        
        const names = ["Seed Sprout 🌱", "Small Plant 🌿", "Sapling 🌳", "Young Tree 🌲", "Mature Tree 🌳✨"];
        label.textContent = names[stage - 1];
        
        if (stage === 5 && currentStage != 5) {
            // Celebration
            showMotivation("Tree Fully Grown! 🌳✨");
            // Plant tree logic handled in timer loop or markComplete
        }
    }
}

function plantTree(dayIndex) {
    // Check if tree already exists for this day
    if (state.forest.some(t => t.dayIndex === dayIndex)) return;
    
    const streak = computeStreaks().current;
    const type = getTreeType(streak);
    
    const tree = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2), // Ensure unique ID
        dayIndex: dayIndex,
        date: new Date().toISOString().slice(0, 10),
        growthStage: 5,
        type: type,
        createdAt: Date.now()
    };
    
    state.forest.push(tree);
    saveState();
    renderForest();
    
    // Show modal celebration
    openTreeModal(tree);
}

function backfillForest() {
    // Check for completed days that don't have trees yet
    let added = false;
    for (let i = 0; i < DAYS; i++) {
        if (state.days[i] / 3600 >= GOAL_HOURS) {
            if (!state.forest.some(t => t.dayIndex === i)) {
                // Create a tree without showing modal
                const streak = 0; // We can't easily calculate historical streak per day without replay, defaulting to normal
                // Or we could try to estimate type based on current streak if it was recent, but simple is better.
                // Let's just make them normal trees for backfill.
                
                const tree = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2) + i,
                    dayIndex: i,
                    date: new Date().toISOString().slice(0, 10), // We don't have exact date easily unless we calc it
                    growthStage: 5,
                    type: 'normal',
                    createdAt: Date.now()
                };
                
                // Calculate correct date for that day
                if (state.startDate) {
                    const start = new Date(state.startDate + "T00:00:00");
                    const d = new Date(start);
                    d.setDate(start.getDate() + i);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    tree.date = `${year}-${month}-${day}`;
                }

                state.forest.push(tree);
                added = true;
            }
        }
    }
    if (added) {
        saveState();
        renderForest();
    }
}

function renderForest() {
    const grid = _("#forestGrid");
    grid.innerHTML = "";
    
    state.forest.forEach(tree => {
        const el = document.createElement("div");
        el.className = `tree-card ${tree.type}`;
        el.innerHTML = `
            <div class="tree-preview">${getTreeSVG(5, tree.type)}</div>
            <div class="tree-info">
                <div class="day-num">Day ${tree.dayIndex + 1}</div>
                <div class="date">${tree.date}</div>
            </div>
        `;
        el.onclick = () => openTreeModal(tree);
        grid.appendChild(el);
    });
}

function deleteTree(treeId) {
    if (!confirm("Are you sure you want to delete this tree? This cannot be undone.")) return;
    
    state.forest = state.forest.filter(t => t.id !== treeId);
    saveState();
    renderForest();
    _("#treeModal").classList.add("hidden");
}

function openTreeModal(tree) {
    const modal = _("#treeModal");
    const view = _("#modalTreeView");
    
    view.innerHTML = getTreeSVG(5, tree.type);
    _("#modalTreeTitle").textContent = `Tree of Day ${tree.dayIndex + 1}`;
    _("#modalTreeDate").textContent = tree.date;
    _("#modalTreeType").textContent = tree.type.charAt(0).toUpperCase() + tree.type.slice(1);
    
    // Find hours for that day
    const hours = toHours(state.days[tree.dayIndex]);
    _("#modalTreeHours").textContent = hours.toFixed(2);
    
    // Bind delete button
    _("#deleteTreeBtn").onclick = () => deleteTree(tree.id);
    
    modal.classList.remove("hidden");
}

// Bind Forest UI
_("#forestBtn").onclick = () => {
    const gallery = _("#forestGallery");
    const grid = _("#daysGrid");
    const btn = _("#forestBtn");
    
    if (gallery.classList.contains("hidden")) {
        gallery.classList.remove("hidden");
        grid.classList.add("hidden");
        btn.classList.add("active");
        renderForest();
    } else {
        gallery.classList.add("hidden");
        grid.classList.remove("hidden");
        btn.classList.remove("active");
    }
};

_("#closeTreeModal").onclick = () => {
    _("#treeModal").classList.add("hidden");
};

// Close modal on outside click
_("#treeModal").onclick = (e) => {
    if (e.target === _("#treeModal")) {
        _("#treeModal").classList.add("hidden");
    }
};

// =============================
// UI Bindings
// =============================

function bindUI() {
  _("#startBtn").onclick = startTimer;
  _("#pauseBtn").onclick = pauseTimer;
  _("#resetTimerBtn").onclick = resetTimer;

  _("#markComplete").onclick = () => {
    const t = getTodayIndex();
    if (t !== null) {
      const newSec = GOAL_HOURS * 3600;
      state.days[t] = newSec;

      if (timer.running) {
          timer.sec = newSec;
          timer.startTime = Date.now();
          timer.startTotalSeconds = newSec;
      }

      saveState();
      updateSummary();
      loadTodayTimer();
      renderTodayTree(); // Update visual
      plantTree(t); // Plant tree immediately
      showMotivation("Day marked as complete! Great work.");
    }
  };

  _("#manualEdit").onclick = () => {
    const idx = getTodayIndex();
    if (idx === null) return;

    const current = toHours(state.days[idx]);
    const input = prompt("Enter hours for today:", current);
    if (input === null) return;

    const h = Math.min(parseFloat(input), 24); // Max 24 hours
    const newSec = Math.floor(h * 3600);
    state.days[idx] = newSec;

    // Fix: If timer is running, sync it so it doesn't overwrite the manual edit
    if (timer.running && idx === getTodayIndex()) {
        timer.sec = newSec;
        timer.startTime = Date.now();
        timer.startTotalSeconds = newSec;
        _("#displayTimer").textContent = formatTime(timer.sec);
    }

    saveState();
    updateSummary();
  };

  daysGrid.onclick = (e) => {
    if (e.target.dataset.action === "edit") {
      const card = e.target.closest(".day-card");
      const idx = Number(card.dataset.index);
      const current = toHours(state.days[idx]);
      const input = prompt(`Edit hours for Day ${idx + 1}:`, current);

      if (input !== null) {
        const h = Math.min(parseFloat(input), 24);
        const newSec = Math.floor(h * 3600);
        state.days[idx] = newSec;

        // Fix: If timer is running AND we are editing today's card
        if (timer.running && idx === getTodayIndex()) {
            timer.sec = newSec;
            timer.startTime = Date.now();
            timer.startTotalSeconds = newSec;
            _("#displayTimer").textContent = formatTime(timer.sec);
        }

        saveState();
        updateSummary();
      }
    }
  };

  _("#resetBtn").onclick = () => {
    if (confirm("Reset whole challenge? This cannot be undone.")) {
      state.startDate = new Date().toISOString().slice(0, 10);
      state.days = Array(DAYS).fill(0);
      state.sessions = [];
      saveState();
      init();
    }
  };

  _("#themeBtn").onclick = () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    applyTheme();
    saveState();
  };

  _("#styleBtn").onclick = () => {
    state.design = state.design === "modern" ? "classic" : "modern";
    applyDesign();
    saveState();
  };

  _("#setStartBtn").onclick = () => {
    const val = _("#startDateInput").value;
    if (!val) return;

    // Only ask for confirmation if there is actual progress to lose
    const hasProgress = state.days.some(d => d > 0);
    if (hasProgress && !confirm("Changing start date will reset progress. Continue?")) {
      return;
    }

    state.startDate = val;
    state.days = Array(DAYS).fill(0);
    state.sessions = [];
    saveState();
    init();
  };

  _("#notifyBtn").onclick = toggleReminders;
  _("#exportCsvBtn").onclick = exportCSV;
  _("#exportPdfBtn").onclick = exportPDF;
}

// =============================
// Initialization
// =============================

function applyDesign() {
  document.body.setAttribute("data-design", state.design || "modern");
  _("#styleBtn").textContent = state.design === "classic" ? "🎨 Style: Classic" : "🎨 Style: Modern";
}

function init() {
  loadState();
  backfillForest(); // Ensure past completed days have trees
  applyTheme();
  applyDesign();
  _("#startDateInput").value = state.startDate;
  loadTodayTimer();
  updateSummary();
  renderTodayTree(); // Initial render
  bindUI();
  rotateMotivation();
  initAuth(); // Initialize Firebase Auth
  
  // Initial button state
  _("#pauseBtn").disabled = true;
}

// Wait for Chart.js to load if it's not ready yet (though script tag is blocking usually)
if (typeof Chart !== 'undefined') {
    init();
} else {
    window.onload = init;
}
