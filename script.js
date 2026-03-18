// ── FIREBASE ──
const firebaseConfig = {
  apiKey: "AIzaSyAhSs91u9b-ETE8fs6k7i3ndOXzaZ4kx_E",
  authDomain: "study-tracker-5b83c.firebaseapp.com",
  projectId: "study-tracker-5b83c",
  storageBucket: "study-tracker-5b83c.firebasestorage.app",
  messagingSenderId: "240870660447",
  appId: "1:240870660447:web:375901105b3650a11a7eea",
};
try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.log("Firebase:", e);
}
var db;
try {
  db = firebase.firestore();
} catch (e) {
  db = null;
}

// ── DATA ──
const DEFAULT_SUBJECTS = [
  "History & Civics",
  "Geography",
  "English Language",
  "English Literature",
  "Bengali",
  "Hindi",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Applications",
  "Economic Applications",
];

let chapters = JSON.parse(localStorage.getItem("st_chapters")) || [];
let revisions = JSON.parse(localStorage.getItem("st_revisions")) || [];
let subjects = JSON.parse(localStorage.getItem("st_subjects")) || [
  ...DEFAULT_SUBJECTS,
];
let profile = JSON.parse(localStorage.getItem("st_profile")) || null;
let streak = JSON.parse(localStorage.getItem("st_streak")) || {
  count: 0,
  lastDate: "",
};
let weeklyLog = JSON.parse(localStorage.getItem("st_weekly")) || {};
let coins = parseInt(localStorage.getItem("st_coins") || "0", 10);
let currentFilter = "all";
let missedRevisions = JSON.parse(localStorage.getItem("st_missed")) || [];
let graceTimerInterval = null;
let flipClockInterval = null;
let groupCode = localStorage.getItem("st_group") || "";
let groupName = localStorage.getItem("st_grpname") || "";
let lbUnsubscribe = null;
let groupNameUnsubscribe = null;
let activityUnsubscribe = null;
let isCreator = localStorage.getItem("st_isCreator") === "true";
let groupDisplayName = localStorage.getItem("st_groupDisplayName") || "";

// Stable unique member ID per device/profile for group doc identity
let memberId = localStorage.getItem("st_memberId") || "";
if (!memberId) {
  memberId = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  localStorage.setItem("st_memberId", memberId);
}

// ── HELPERS ──
const IST_TZ = "Asia/Kolkata";

function dateKeyToUTC(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function weekdayShortIST(dateStr) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TZ,
    weekday: "short",
  }).format(dateKeyToUTC(dateStr));
}

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function sanitize(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str || "")));
  return div.innerHTML;
}

function todayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateStr, n) {
  // IST-safe date math using UTC midnight on the date key
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function fmtDate(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-IN", {
    timeZone: IST_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysFromToday(dateStr) {
  const today = todayStr(); // IST YYYY-MM-DD
  const a = dateKeyToUTC(today);
  const b = dateKeyToUTC(dateStr);
  const diff = Math.round((b - a) / 86400000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return Math.abs(diff) + " days ago";
  return "In " + diff + " days";
}
function save() {
  localStorage.setItem("st_chapters", JSON.stringify(chapters));
  localStorage.setItem("st_revisions", JSON.stringify(revisions));
  localStorage.setItem("st_subjects", JSON.stringify(subjects));
  localStorage.setItem("st_streak", JSON.stringify(streak));
  localStorage.setItem("st_weekly", JSON.stringify(weeklyLog));
  localStorage.setItem("st_coins", String(coins || 0));
  localStorage.setItem("st_missed", JSON.stringify(missedRevisions));
}

// ── SOUND FX (mobile-friendly) ──
let audioCtx = null;
let soundUnlocked = false;

function getAudioCtx() {
  try {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  } catch (e) {
    return null;
  }
}

function unlockSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(() => {
        soundUnlocked = true;
      })
      .catch(() => {});
  } else {
    soundUnlocked = true;
  }
}

function primeSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch (e) {}
}

function beep(freq = 660, dur = 0.1, type = "sine", vol = 0.08) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") return; // avoid silent fail on phones
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.03);
  } catch (e) {}
}

function playSaveSound() {
  beep(540, 0.07, "triangle", 0.07);
  setTimeout(() => beep(700, 0.09, "triangle", 0.06), 70);
}
function playDoneSound() {
  beep(720, 0.08, "sine", 0.08);
  setTimeout(() => beep(920, 0.11, "sine", 0.07), 90);
}
function playCoinSound() {
  beep(900, 0.06, "triangle", 0.07);
  setTimeout(() => beep(1200, 0.07, "triangle", 0.06), 65);
  setTimeout(() => beep(1500, 0.1, "triangle", 0.06), 130);
}
function playDeleteSound() {
  // gentle downward remove sound
  beep(520, 0.05, "triangle", 0.045);
  setTimeout(() => beep(390, 0.06, "sawtooth", 0.04), 50);
  setTimeout(() => beep(280, 0.07, "sawtooth", 0.03), 110);
}

function playCopySound() {
  // tiny sparkle
  beep(900, 0.03, "triangle", 0.03);
  setTimeout(() => beep(1200, 0.035, "triangle", 0.025), 28);
}

function playGroupCreateSound() {
  // short celebration
  beep(660, 0.05, "triangle", 0.04);
  setTimeout(() => beep(880, 0.06, "triangle", 0.035), 45);
  setTimeout(() => beep(1100, 0.07, "sine", 0.03), 95);
}

function playGroupJoinSound() {
  // connected feel
  beep(540, 0.04, "sine", 0.03);
  setTimeout(() => beep(720, 0.05, "triangle", 0.03), 40);
  setTimeout(() => beep(960, 0.05, "triangle", 0.025), 85);
}

function playLeaveGroupSound() {
  // softer exit
  beep(500, 0.04, "triangle", 0.035);
  setTimeout(() => beep(420, 0.05, "triangle", 0.03), 45);
  setTimeout(() => beep(320, 0.06, "sine", 0.025), 95);
}

function playErrorSound() {
  // optional error tone
  beep(340, 0.05, "square", 0.03);
  setTimeout(() => beep(300, 0.07, "square", 0.025), 55);
}
// ── COINS ──
function coinForOffset(dayOffset) {
  if (dayOffset === 1) return 5;
  if (dayOffset === 3) return 10;
  if (dayOffset === 7) return 15;
  if (dayOffset === 30) return 20;
  return 0;
}
function updateCoinsUI() {
  const pill = document.getElementById("coinPill");
  if (pill) pill.textContent = "🪙 " + (coins || 0);
}
function flyCoinsFromRect(fromRect, amount) {
  const pill = document.getElementById("coinPill");
  if (!pill || !fromRect) return;
  const to = pill.getBoundingClientRect();
  const coin = document.createElement("div");
  coin.textContent = "🪙";
  coin.style.cssText = `
          position:fixed;
          left:${fromRect.left + fromRect.width / 2}px;
          top:${fromRect.top + fromRect.height / 2}px;
          font-size:1.4rem;
          z-index:9999;
          pointer-events:none;
          transition: none;
          transform: translate(-50%,-50%) scale(1);
          filter: drop-shadow(0 0 6px gold);
        `;
  document.body.appendChild(coin);
  const label = document.createElement("div");
  label.textContent = "+" + amount + "🪙";
  label.style.cssText = `
          position:fixed;
          left:${fromRect.left + fromRect.width / 2}px;
          top:${fromRect.top - 10}px;
          font-size:1rem;
          font-weight:800;
          color:#f59e0b;
          z-index:9999;
          pointer-events:none;
          transform:translate(-50%,-50%);
          text-shadow:0 0 8px rgba(245,158,11,0.8);
          transition:opacity 0.35s, transform 0.35s;
        `;
  document.body.appendChild(label);
  requestAnimationFrame(() => {
    label.style.transform = "translate(-50%, -200%)";
    label.style.opacity = "0";
  });
  setTimeout(() => {
    const dx = to.left + to.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = to.top + to.height / 2 - (fromRect.top + fromRect.height / 2);
    coin.style.transition =
      "left 0.55s cubic-bezier(.4,0,.2,1), top 0.55s cubic-bezier(.4,0,.2,1), transform 0.55s, opacity 0.15s 0.45s";
    coin.style.left = fromRect.left + fromRect.width / 2 + dx + "px";
    coin.style.top = fromRect.top + fromRect.height / 2 + dy + "px";
    coin.style.transform = "translate(-50%,-50%) scale(0.4)";
    coin.style.opacity = "0";
  }, 80);
  setTimeout(() => {
    coin.remove();
    label.remove();
  }, 750);
  setTimeout(() => {
    pill.style.transition = "transform 0.15s";
    pill.style.transform = "scale(1.25)";
    setTimeout(() => {
      pill.style.transform = "scale(1)";
    }, 150);
  }, 620);
}
// ── TOAST ──
function showToast(main, type, sub) {
  const t = document.getElementById("toast");
  t.className = "toast" + (type ? " " + type : "");
  t.innerHTML = `<div class="toast-main">${main}</div>${sub ? `<div class="toast-sub">${sub}</div>` : ""}`;
  t.classList.remove("hidden");
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}

// ── SERVICE WORKER ──
function registerSW() {
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ── NOTIFICATIONS ── (kept as-is, per your request)
function checkNotifBanner() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    document.getElementById("notifBanner").style.display = "none";
    return;
  }
  if (Notification.permission === "denied") {
    const b = document.getElementById("notifBanner");
    b.style.display = "flex";
    b.querySelector(".btn-allow").textContent = "How to Enable";
    b.querySelector(".btn-allow").onclick = () =>
      alert(
        "To enable:\n1. Tap 🔒 lock icon in address bar\n2. Tap Permissions\n3. Set Notifications → Allow\n4. Refresh",
      );
    return;
  }
  const dismissedAt = localStorage.getItem("notifDismissedAt");
  if (!dismissedAt) {
    document.getElementById("notifBanner").style.display = "flex";
    return;
  }
  const daysSince =
    (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
  if (daysSince >= 3) {
    localStorage.removeItem("notifDismissedAt");
    document.getElementById("notifBanner").style.display = "flex";
  }
}
function askNotifPermission() {
  if (!("Notification" in window)) return;
  Notification.requestPermission().then((p) => {
    document.getElementById("notifBanner").style.display = "none";
    if (p === "granted") {
      localStorage.removeItem("notifDismissedAt");
      localStorage.setItem("notifEnabled", "true");
      showToast(
        "Utho Parth! 🏹🚩",
        "",
        "Aaj revision ka yuddh ladna hai. Notifications on!",
      );
      fireNotification();
    } else {
      showToast(
        "Notifications block ho gayi! 🚫🔔",
        "error",
        "Browser settings se enable karo.",
      );
    }
  });
}
function dismissBanner() {
  document.getElementById("notifBanner").style.display = "none";
  localStorage.setItem("notifDismissedAt", Date.now().toString());
}
function fireNotification() {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;
  const t = todayStr();
  const due = revisions.filter(
    (r) => r.dueDate === t && !r.done && !r.missedPermanently,
  );
  if (due.length === 0) return;
  const name = profile ? profile.name : "";
  const names =
    due
      .slice(0, 3)
      .map((r) => r.chapterName + " (" + r.subject + ")")
      .join(", ") + (due.length > 3 ? " +" + (due.length - 3) + " more" : "");
  new Notification(
    "📚 " + (name ? name + ", you have" : "You have") + " revisions due!",
    {
      body: due.length + " revision(s) today: " + names,
      tag: "st-daily",
      icon: "icon.png",
    },
  );
}
function scheduleDailyReminder() {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;
  const last = localStorage.getItem("st_last_notified");
  const t = todayStr();
  if (last !== t) {
    localStorage.setItem("st_last_notified", t);
    fireNotification();
  }
}

// ── ONBOARDING ──
function checkOnboard() {
  if (!profile) {
    document.getElementById("onboardOverlay").classList.remove("hidden");
    return false;
  }
  document.getElementById("onboardOverlay").classList.add("hidden");
  return true;
}

function checkSyllabusProfile() {
  // Old users who completed onboarding before stream/lang2/elective fields existed
  // will have profile but no stream — show a focused one-time prompt to collect missing fields
  if (!profile || profile.stream) return; // already has it, skip
  if (localStorage.getItem("st_syllabus_prompted")) return; // already prompted once

  const box = document.getElementById("onboardBox");
  box.innerHTML = `
    <span class="emoji">🎓</span>
    <h2>One Quick Update</h2>
    <p>We've added full syllabus support! Tell us your subjects so we can personalise your progress.</p>
    <div class="field">
      <label>Stream</label>
      <select id="ob-stream">
        <option value="science">Science (Physics, Chemistry, Biology)</option>
        <option value="commerce">Commerce</option>
      </select>
    </div>
    <div class="field">
      <label>Second Language</label>
      <select id="ob-lang2">
        <option value="hindi">Hindi</option>
        <option value="bengali">Bengali</option>
      </select>
    </div>
    <div class="field">
      <label>Group III Elective</label>
      <select id="ob-elective">
        <option value="computer">Computer Applications</option>
        <option value="eco_apps">Economic Applications</option>
        <option value="physical_ed">Physical Education</option>
      </select>
    </div>
    <button class="btn btn-primary full" onclick="finishSyllabusPrompt()">Save & Continue 🚀</button>
  `;
  document.getElementById("onboardOverlay").classList.remove("hidden");
}

function finishSyllabusPrompt() {
  profile.stream = document.getElementById("ob-stream").value;
  profile.lang2 = document.getElementById("ob-lang2").value;
  profile.elective = document.getElementById("ob-elective").value;
  localStorage.setItem("st_profile", JSON.stringify(profile));
  localStorage.setItem("st_syllabus_prompted", "1");
  document.getElementById("onboardOverlay").classList.add("hidden");
  // Rebuild subjects with newly set preferences
  rebuildSubjectsFromSyllabus();
  populateSubjectDropdown();
  updateChapterSuggestions();
  renderAll();
  showToast(
    "Syllabus personalised! 🎓",
    "",
    "Progress tab now reflects your exact subjects.",
  );
}
function finishOnboard() {
  const name = document.getElementById("ob-name").value.trim();
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Pehle apna naam likho.",
    );
    return;
  }
  const cls = document.getElementById("ob-class").value;
  const exam = document.getElementById("ob-exam").value;
  const stream = document.getElementById("ob-stream").value;
  const lang2 = document.getElementById("ob-lang2").value;
  const elective = document.getElementById("ob-elective").value;
  const deadline = document.getElementById("ob-deadline").value;
  if (exam && deadline) {
    const err = _validateDeadline(deadline, exam);
    if (err) {
      showToast(err, "error", "Invalid deadline");
      return;
    }
  }
  profile = {
    name,
    cls,
    examDate: exam,
    stream,
    lang2,
    elective,
    deadline: deadline || "",
    dateCreated: todayStr(),
    setupSeen: !!(exam && deadline),
  };
  localStorage.setItem("st_profile", JSON.stringify(profile));
  document.getElementById("onboardOverlay").classList.add("hidden");
  loadSyllabusAndInit();
}

function _deadlineBounds(examDateStr) {
  const examMs = dateKeyToUTC(examDateStr);
  const minMs = examMs - 60 * 86400000; // earliest allowed = 60 days before exam
  const maxMs = examMs - 10 * 86400000; // latest allowed  = 10 days before exam
  const toStr = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const toLabel = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  return {
    minDate: toStr(minMs),
    maxDate: toStr(maxMs),
    minLabel: toLabel(minMs),
    maxLabel: toLabel(maxMs),
  };
}

function _validateDeadline(deadlineStr, examStr) {
  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(examStr);
  if (deadlineStr < minDate)
    return `Too early — must be on or after ${minLabel} (2 months before exam).`;
  if (deadlineStr > maxDate)
    return `Too close — must be on or before ${maxLabel} (10 days before exam).`;
  return null;
}

function updateDeadlineLimits() {
  const exam = document.getElementById("ob-exam").value;
  const field = document.getElementById("ob-deadline-field");
  const hint = document.getElementById("ob-deadline-hint");
  const inp = document.getElementById("ob-deadline");
  if (!exam) {
    field.style.display = "none";
    return;
  }
  const daysToExam = Math.round(
    (dateKeyToUTC(exam) - dateKeyToUTC(todayStr())) / 86400000,
  );
  if (daysToExam < 15) {
    field.style.display = "none";
    return;
  }
  field.style.display = "block";
  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(exam);
  inp.min = minDate;
  inp.max = maxDate;
  hint.textContent = `Pick a date between ${minLabel} and ${maxLabel}.`;
}

function updateProfileDeadlineLimits() {
  const exam = document.getElementById("prof-exam").value;
  const hint = document.getElementById("prof-deadline-hint");
  const inp = document.getElementById("prof-deadline");
  if (!exam || !hint || !inp) return;
  if (profile && profile.examDate && exam !== profile.examDate) {
    inp.value = "";
  }
  const daysToExam = Math.round(
    (dateKeyToUTC(exam) - dateKeyToUTC(todayStr())) / 86400000,
  );
  const wrapper = inp.closest(".field");
  if (daysToExam < 15) {
    if (wrapper) wrapper.style.display = "none";
    hint.textContent = "";
    return;
  }
  const _psCheck = _computePaceState();
  if (_psCheck && _psCheck.isEmergency) {
    if (wrapper) wrapper.style.display = "none";
    hint.textContent =
      "Deadline has passed and you're in emergency mode — focus on chapters, not dates.";
    return;
  }
  if (wrapper) wrapper.style.display = "";
  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(exam);
  inp.min = minDate;
  inp.max = maxDate;
  const _ps9b = _computePaceState();
  const _sug9b = (() => {
    if (!_ps9b || _ps9b.effectivePace <= 0 || _ps9b.remaining === 0)
      return null;
    const _buf = _ps9b.paceSlipping ? 10 : _ps9b.paceImproving ? 3 : 5;
    const _proj = addDays(
      todayStr(),
      Math.ceil(_ps9b.remaining / _ps9b.effectivePace) + _buf,
    );
    const _min = addDays(exam, -60);
    const _max = addDays(exam, -10);
    if (dateKeyToUTC(_proj) > dateKeyToUTC(_max)) return null;
    if (dateKeyToUTC(_proj) < dateKeyToUTC(_min))
      return { key: _min, label: fmtDate(_min) };
    return { key: _proj, label: fmtDate(_proj) };
  })();
  const _hasDeadline9b = profile && profile.deadline;
  const _behindDeadline9b =
    _hasDeadline9b &&
    _sug9b &&
    dateKeyToUTC(_sug9b.key) > dateKeyToUTC(profile.deadline);
  hint.textContent = _behindDeadline9b
    ? `Between ${minLabel} and ${maxLabel}. At your current pace: ${_sug9b.label} — later than your existing deadline. Pushing it back won't change the work needed.`
    : _sug9b
      ? `Between ${minLabel} and ${maxLabel}. Suggested: ${_sug9b.label} — based on your current pace.`
      : `Between ${minLabel} and ${maxLabel}.`;
}

// ── GREETING ──
function _setupNotReady() {
  if (!profile) return;
  const noExam = !profile.examDate;
  const dte = profile.examDate
    ? Math.max(
        0,
        Math.round(
          (dateKeyToUTC(profile.examDate) - dateKeyToUTC(todayStr())) /
            86400000,
        ),
      )
    : null;
  const noDeadline = !profile.deadline && (dte === null || dte >= 15);
  if (noExam && noDeadline) {
    showToast(
      "Exam date and deadline missing",
      "error",
      "Set both in Profile to unlock.",
    );
  } else if (noExam) {
    showToast("Exam date missing", "error", "Set it in Profile → Exam Date.");
  } else if (noDeadline) {
    showToast("Study deadline missing", "error", "Set it in the Progress tab.");
  }
}

function _setupDismiss() {
  if (!profile) return;
  const _dte = profile.examDate
    ? Math.max(
        0,
        Math.round(
          (dateKeyToUTC(profile.examDate) - dateKeyToUTC(todayStr())) /
            86400000,
        ),
      )
    : null;
  const _noExam = !profile.examDate;
  const _noDeadline = !profile.deadline && (_dte === null || _dte >= 15);

  if (_noExam && _noDeadline) {
    showConfirmModal(
      "Your exam date and study deadline are not set yet. Sure you want to dismiss?",
      () => {
        profile.setupSeen = true;
        localStorage.setItem("st_profile", JSON.stringify(profile));
        renderCoachTab();
      },
    );
  } else if (_noExam) {
    showConfirmModal(
      "Your exam date is not set yet — without it the app can't track anything. Sure you want to dismiss?",
      () => {
        profile.setupSeen = true;
        localStorage.setItem("st_profile", JSON.stringify(profile));
        renderCoachTab();
      },
    );
  } else if (_noDeadline) {
    showConfirmModal(
      "Your study deadline is not set yet — pace calculations won't be personalised. Sure you want to dismiss?",
      () => {
        profile.setupSeen = true;
        localStorage.setItem("st_profile", JSON.stringify(profile));
        renderCoachTab();
      },
    );
  } else {
    profile.setupSeen = true;
    localStorage.setItem("st_profile", JSON.stringify(profile));
    renderCoachTab();
  }
}

function _updateHamInitial() {
  const el = document.getElementById("ham-initial");
  if (!el) return;
  const name = profile && profile.name ? profile.name.trim() : "";
  el.textContent = name ? name.charAt(0).toUpperCase() : "?";
}

function updateGreeting() {
  _updateHamInitial();
  if (!profile) {
    document.getElementById("greeting").textContent = "";
    return;
  }
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: IST_TZ,
    }).format(new Date()),
  );
  const greet =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const t = todayStr();
  const due = revisions.filter(
    (r) => r.dueDate === t && !r.done && !r.missedPermanently,
  );
  const overdue = revisions.filter(
    (r) => r.dueDate < t && !r.done && !r.missedPermanently,
  );
  let msg = `${greet}, ${profile.name}!`;
  const yesterday = addDays(t, -1);
  const grace = revisions.filter(
    (r) =>
      r.dueDate === yesterday &&
      !r.done &&
      !r.missedPermanently &&
      isInGrace(yesterday),
  );
  if (grace.length > 0)
    msg += ` ${grace.length} in grace + ${due.length} due today ⚠️`;
  else if (due.length > 0)
    msg += ` ${due.length} revision${due.length > 1 ? "s" : ""} due today 💪`;
  else msg += " No revisions today 🎉";
  document.getElementById("greeting").textContent = msg;
}
// ── STREAK ──
function updateStreak() {
  const t = todayStr();
  const yesterday = addDays(t, -1);

  // Grace expiry check — only reset if grace has fully expired (not just missed yesterday)
  const graceExpired = isGraceExpired(yesterday);
  const yesterdayDue = revisions.filter(
    (r) => r.dueDate === yesterday && !r.missedPermanently,
  ).length;
  const yesterdayDone = revisions.filter(
    (r) => r.dueDate === yesterday && r.done,
  ).length;
  const yesterdayAllDone = yesterdayDue === 0 || yesterdayDone >= yesterdayDue;

  if (graceExpired && !yesterdayAllDone && streak.lastDate !== t) {
    streak.count = 0;
    save();
  }

  // Increment streak — from today's due OR grace completions (once per day)
  const todayDone = revisions.filter((r) => r.dueDate === t && r.done).length;
  const graceCompletedToday = revisions.filter(
    (r) => r.dueDate === yesterday && r.done && r.completedInGrace,
  ).length;

  if ((todayDone > 0 || graceCompletedToday > 0) && streak.lastDate !== t) {
    if (streak.lastDate === yesterday) streak.count++;
    else streak.count = 1;
    streak.lastDate = t;
    save();
  }

  document.getElementById("streakPill").innerHTML =
    '<span class="streak-fire">🔥</span> ' + streak.count;
  document.getElementById("stat-streak").textContent = streak.count;
}

// Grace period helpers
function graceExpireTime(dueDateStr) {
  // Grace expires at midnight IST of TWO days after dueDate
  // i.e. user has the full next calendar day (IST) to complete in grace
  const twoDaysLater = addDays(dueDateStr, 2);
  const [y, m, d] = twoDaysLater.split("-").map(Number);
  const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return new Date(midnightUTC.getTime() - 5.5 * 60 * 60 * 1000);
}

function isGraceExpired(dueDateStr) {
  return Date.now() >= graceExpireTime(dueDateStr).getTime();
}

function isInGrace(dueDateStr) {
  const t = todayStr();
  // Only yesterday's revisions can be in grace
  const yesterday = addDays(t, -1);
  return dueDateStr === yesterday && !isGraceExpired(dueDateStr);
}

// ── EXAM COUNTDOWN ──
function updateExamCountdown() {
  const block = document.getElementById("examCountdownBlock");
  const daysEl = document.getElementById("prof-exam-days");
  if (!block || !daysEl) return;

  if (!profile || !profile.examDate) {
    block.style.display = "none";
    return;
  }

  // IST-only day difference (exact Kolkata date rollover behavior)
  const today = todayStr(); // YYYY-MM-DD in Asia/Kolkata
  const diff = Math.round(
    (dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000,
  );
  if (diff > 0) {
    block.style.display = "flex";
    daysEl.textContent = diff + " days";
  } else {
    block.style.display = "none";
  }
}

// ── FLIP CLOCK COUNTDOWN ──
function renderFlipClock() {
  const el = document.getElementById("today-flip-clock");
  if (!el) return;

  if (flipClockInterval) {
    clearInterval(flipClockInterval);
    flipClockInterval = null;
  }

  if (!profile || !profile.examDate) {
    el.innerHTML = "";
    delete el.dataset.built;
    delete el.dataset.prev;
    const _box = document.getElementById("today-mission");
    if (_box) _box.style.display = "none";
    return;
  }
  const _box = document.getElementById("today-mission");
  if (_box) _box.style.display = "";

  function _render() {
    // Guard — exam date cleared while interval was running
    if (!profile || !profile.examDate) {
      if (flipClockInterval) {
        clearInterval(flipClockInterval);
        flipClockInterval = null;
      }
      el.innerHTML = "";
      delete el.dataset.built;
      delete el.dataset.prev;
      const _box2 = document.getElementById("today-mission");
      if (_box2) _box2.style.display = "none";
      return;
    }

    const now = new Date();
    const [ey, em, ed] = profile.examDate.split("-").map(Number);
    const examMidnightIST = new Date(
      Date.UTC(ey, em - 1, ed, 0, 0, 0) - 5.5 * 3600000,
    );
    const diff = examMidnightIST - now;

    if (diff <= 0) {
      el.innerHTML = `<div class="today-flip-clock-wrap"><div class="today-flip-goodluck">🎓 Good luck!</div></div>`;
      if (flipClockInterval) {
        clearInterval(flipClockInterval);
        flipClockInterval = null;
      }
      delete el.dataset.built;
      delete el.dataset.prev;
      return;
    }

    // Days = pure IST calendar difference (always correct regardless of time of day)
    const todayIST = todayStr();
    const calDays = Math.round(
      (dateKeyToUTC(profile.examDate) - dateKeyToUTC(todayIST)) / 86400000,
    );

    // Hours/mins/secs = time left within today IST until midnight IST
    const [ty, tm, td] = todayIST.split("-").map(Number);
    const tomorrowMidnightIST = new Date(
      Date.UTC(ty, tm - 1, td, 0, 0, 0) - 5.5 * 3600000 + 86400000,
    );
    const secsLeft = Math.max(
      0,
      Math.floor((tomorrowMidnightIST - now) / 1000),
    );
    const days = calDays;
    const hours = Math.floor(secsLeft / 3600);
    const minutes = Math.floor((secsLeft % 3600) / 60);
    const seconds = secsLeft % 60;

    // Days uses 3 digits when >= 100, 2 digits otherwise
    const padDays = (n) => (n >= 100 ? String(n) : String(n).padStart(2, "0"));
    const pad2 = (n) => String(n).padStart(2, "0");

    const units = [
      { val: padDays(days), label: "Days" },
      { val: pad2(hours), label: "Hours" },
      { val: pad2(minutes), label: "Mins" },
      { val: pad2(seconds), label: "Secs" },
    ];

    // If digit count of days changed (e.g. 100 → 99 or 99 → 100), force full rebuild
    const prevDaysLen = el.dataset.prevDaysLen || "2";
    const currDaysLen = String(units[0].val).length;
    if (currDaysLen !== parseInt(prevDaysLen)) {
      delete el.dataset.built;
    }

    // First render — build full HTML
    if (!el.dataset.built) {
      el.dataset.built = "1";
      el.dataset.prevDaysLen = String(currDaysLen);
      let html = `<div class="today-flip-clock-wrap">
        <div class="today-flip-clock-label">Exam Countdown</div>
        <div class="today-flip-clock-units">`;
      units.forEach((u, i) => {
        const digits = u.val.split("");
        const cards = digits
          .map(
            (ch, d) =>
              `<div class="today-flip-card" id="fc-${i}-${d}">${ch}</div>`,
          )
          .join("");
        html += `<div class="today-flip-unit">
          <div class="today-flip-digits">${cards}</div>
          <div class="today-flip-unit-label">${u.label}</div>
        </div>`;
        if (i < 3) html += `<div class="today-flip-sep">:</div>`;
      });
      html += `</div></div>`;
      el.innerHTML = html;
      el.dataset.prev = units.map((u) => u.val).join(",");
      return;
    }

    // Subsequent renders — flip only changed digits
    const prev = (el.dataset.prev || "").split(",");
    units.forEach((u, i) => {
      const oldVal = prev[i] || "";
      u.val.split("").forEach((ch, d) => {
        if (ch !== oldVal[d]) {
          const card = document.getElementById(`fc-${i}-${d}`);
          if (card) {
            card.classList.remove("flipping");
            void card.offsetWidth;
            card.textContent = ch;
            card.classList.add("flipping");
          }
        }
      });
    });
    el.dataset.prev = units.map((u) => u.val).join(",");
    el.dataset.prevDaysLen = String(currDaysLen);
  }

  _render();
  flipClockInterval = setInterval(_render, 1000);
}

// ── TODAY TAB SITUATIONAL QUOTES ──
const _TODAY_QUOTES = {
  zero_days: [
    {
      text: "You don't have to be great to start, but you have to start to be great.",
      author: "Zig Ziglar",
    },
    {
      text: "The secret of getting ahead is getting started.",
      author: "Mark Twain",
    },
    {
      text: "A year from now you will wish you had started today.",
      author: "Karen Lamb",
    },
    {
      text: "The future depends on what you do today.",
      author: "Mahatma Gandhi",
    },
    {
      text: "Start where you are. Use what you have. Do what you can.",
      author: "Arthur Ashe",
    },
    {
      text: "You are never too old to set another goal or to dream a new dream.",
      author: "C.S. Lewis",
    },
    {
      text: "The pain of discipline is far less than the pain of regret.",
      author: "Unknown",
    },
    {
      text: "It always seems impossible until it's done.",
      author: "Nelson Mandela",
    },
    {
      text: "Small steps every day. That's how mountains are moved.",
      author: "Unknown",
    },
    {
      text: "Arise, awake, and stop not till the goal is reached.",
      author: "Swami Vivekananda",
    },
    { text: "Dreams don't work unless you do.", author: "John C. Maxwell" },
    {
      text: "The best time to start was yesterday. The next best time is now.",
      author: "Unknown",
    },
    {
      text: "Even the longest journey begins with a single step — take yours today.",
      author: "Lao Tzu",
    },
    {
      text: "You have exactly the same number of hours in a day as everyone who ever achieved anything great.",
      author: "Unknown",
    },
  ],
  behind: [
    {
      text: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.",
      author: "Thomas Edison",
    },
    {
      text: "Strength does not come from physical capacity. It comes from an indomitable will.",
      author: "Mahatma Gandhi",
    },
    {
      text: "Be like water — not powerful because of force, but unstoppable because of persistence.",
      author: "Bruce Lee",
    },
    {
      text: "The man who moves a mountain begins by carrying away small stones.",
      author: "Confucius",
    },
    {
      text: "Hardships often prepare ordinary people for an extraordinary destiny.",
      author: "C.S. Lewis",
    },
    {
      text: "The harder the conflict, the greater the triumph.",
      author: "George Washington",
    },
    {
      text: "Perseverance is not a long race; it is many short races, one after another.",
      author: "Walter Elliot",
    },
    {
      text: "Energy and persistence conquer all things.",
      author: "Benjamin Franklin",
    },
    {
      text: "Every day you don't give up is a day you're still in the race.",
      author: "Unknown",
    },
    {
      text: "Being behind doesn't mean being out. It means you have more reason to move faster.",
      author: "Unknown",
    },
    {
      text: "The gap between where you are and where you need to be closes one chapter at a time.",
      author: "Unknown",
    },
    {
      text: "Character is not built in comfort — it's built in exactly moments like this one.",
      author: "Unknown",
    },
    {
      text: "You have survived every hard day so far. Today is just another one to get through.",
      author: "Unknown",
    },
    {
      text: "It is not the mountain we conquer, but ourselves.",
      author: "Edmund Hillary",
    },
  ],
  zone3: [
    {
      text: "When everything seems to be going against you, remember that the aeroplane takes off against the wind.",
      author: "Henry Ford",
    },
    { text: "The only way out is through.", author: "Robert Frost" },
    { text: "Pressure makes diamonds.", author: "George S. Patton" },
    {
      text: "Do not pray for an easy life — pray for the strength to endure a difficult one.",
      author: "Bruce Lee",
    },
    {
      text: "The darkest hour has only sixty minutes.",
      author: "Morris Mandel",
    },
    {
      text: "If you're going through hell, keep going.",
      author: "Winston Churchill",
    },
    {
      text: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
      author: "Winston Churchill",
    },
    {
      text: "Take up one idea. Make that one idea your life — your every thought, every action.",
      author: "Swami Vivekananda",
    },
    {
      text: "Late is better than never. Moving is better than standing still.",
      author: "Unknown",
    },
    {
      text: "Every chapter you finish now is one less thing standing between you and that result.",
      author: "Unknown",
    },
    {
      text: "The situation is hard. You are harder. Prove it today.",
      author: "Unknown",
    },
    {
      text: "It's not about how much time you have left — it's about what you do with the time that remains.",
      author: "Unknown",
    },
    {
      text: "Panic wastes the very time you're running out of. Work instead.",
      author: "Unknown",
    },
    {
      text: "You don't need perfect conditions to do great work. You never did.",
      author: "Unknown",
    },
  ],
  recovery: [
    { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
    {
      text: "The greatest glory in living lies not in never falling, but in rising every time we fall.",
      author: "Nelson Mandela",
    },
    {
      text: "It's not whether you get knocked down — it's whether you get up.",
      author: "Vince Lombardi",
    },
    {
      text: "Rock bottom became the solid foundation on which I rebuilt my life.",
      author: "J.K. Rowling",
    },
    {
      text: "The comeback is always stronger than the setback.",
      author: "Unknown",
    },
    {
      text: "You may have to fight a battle more than once to win it.",
      author: "Margaret Thatcher",
    },
    {
      text: "Success is stumbling from failure to failure with no loss of enthusiasm.",
      author: "Winston Churchill",
    },
    {
      text: "Only those who dare to fail greatly can ever achieve greatly.",
      author: "Robert F. Kennedy",
    },
    {
      text: "You've already done the hardest thing — you started again.",
      author: "Unknown",
    },
    {
      text: "A setback is a setup for a comeback. You're in the setup phase — embrace it.",
      author: "Unknown",
    },
    {
      text: "The fact that you're back is the most important thing. Everything else follows from here.",
      author: "Unknown",
    },
    {
      text: "Resilience is not about bouncing back. It's about moving forward.",
      author: "Unknown",
    },
    {
      text: "Every expert was once a beginner who refused to quit.",
      author: "Unknown",
    },
    {
      text: "You didn't come this far only to come this far.",
      author: "Unknown",
    },
  ],
  streak: [
    {
      text: "We are what we repeatedly do. Excellence is not an act but a habit.",
      author: "Aristotle",
    },
    {
      text: "Consistency is the true foundation of trust — trust in yourself most of all.",
      author: "Roy T. Bennett",
    },
    {
      text: "Small daily improvements over time lead to stunning results.",
      author: "Robin Sharma",
    },
    {
      text: "Success is the sum of small efforts, repeated day in and day out.",
      author: "Robert Collier",
    },
    {
      text: "Motivation gets you going, but discipline keeps you growing.",
      author: "John C. Maxwell",
    },
    {
      text: "Long-term consistency trumps short-term intensity.",
      author: "Bruce Lee",
    },
    {
      text: "If you light a lamp for somebody, it will also brighten your path.",
      author: "Gautama Buddha",
    },
    {
      text: "The secret of your future is hidden in your daily routine.",
      author: "Mike Murdock",
    },
    {
      text: "You will never always be motivated. That's exactly why you built this habit.",
      author: "Unknown",
    },
    {
      text: "Champions keep playing until they get it right.",
      author: "Billie Jean King",
    },
    {
      text: "Every day you show up is a vote for the kind of student you want to become.",
      author: "Unknown",
    },
    {
      text: "The goal is not to be perfect — it's to be consistent. You are doing that.",
      author: "Unknown",
    },
    {
      text: "Streaks don't build themselves. You built this one, one day at a time.",
      author: "Unknown",
    },
    {
      text: "Where the mind is without fear and the head is held high — into that heaven of freedom, let me awake.",
      author: "Rabindranath Tagore",
    },
  ],
  on_track: [
    {
      text: "The only way to do great work is to love what you do.",
      author: "Steve Jobs",
    },
    {
      text: "An investment in knowledge pays the best interest.",
      author: "Benjamin Franklin",
    },
    {
      text: "Where there is righteousness in the heart, there is beauty in the character.",
      author: "A.P.J. Abdul Kalam",
    },
    {
      text: "The trees that are slow to grow bear the best fruit.",
      author: "Molière",
    },
    {
      text: "Believe you can and you're halfway there.",
      author: "Theodore Roosevelt",
    },
    {
      text: "Don't count the days — make the days count.",
      author: "Muhammad Ali",
    },
    {
      text: "What you get by achieving your goals is not as important as what you become.",
      author: "Henry David Thoreau",
    },
    {
      text: "You are braver than you believe, stronger than you seem, smarter than you think.",
      author: "A.A. Milne",
    },
    {
      text: "The difference between ordinary and extraordinary is that little extra.",
      author: "Jimmy Johnson",
    },
    {
      text: "Being on track is not luck. It's the result of every small decision you made correctly.",
      author: "Unknown",
    },
    {
      text: "Don't slow down because it's going well. That's exactly when most people do.",
      author: "Unknown",
    },
    {
      text: "Good things take time. You're putting in the time. Trust the process.",
      author: "Unknown",
    },
    {
      text: "The work you do today is building something you'll be grateful for on results day.",
      author: "Unknown",
    },
    {
      text: "You have a plan and you're executing it. That alone puts you ahead of most.",
      author: "Unknown",
    },
  ],
  revision_mode: [
    {
      text: "The roots of education are bitter, but the fruit is sweet.",
      author: "Aristotle",
    },
    {
      text: "Education is the most powerful weapon which you can use to change the world.",
      author: "Nelson Mandela",
    },
    {
      text: "Repetition is the mother of learning, the father of action, the architect of accomplishment.",
      author: "Zig Ziglar",
    },
    {
      text: "Live as if you were to die tomorrow. Learn as if you were to live forever.",
      author: "Mahatma Gandhi",
    },
    {
      text: "The beautiful thing about learning is that no one can take it away from you.",
      author: "B.B. King",
    },
    {
      text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.",
      author: "Benjamin Franklin",
    },
    {
      text: "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.",
      author: "Brian Herbert",
    },
    {
      text: "You've done the chapters. Now let revision do what it was always meant to — lock it in forever.",
      author: "Unknown",
    },
    {
      text: "Memory isn't built in one sitting. It's built in the revisits. You're doing exactly that.",
      author: "Unknown",
    },
    {
      text: "Revision is not repetition — it's refinement. Each time you go back, you understand more.",
      author: "Unknown",
    },
    {
      text: "The syllabus is done. The real work now is making sure it stays.",
      author: "Unknown",
    },
    {
      text: "What is learned in youth is carved in stone.",
      author: "Arabic Proverb",
    },
    {
      text: "Review what you know. Strengthen what you don't. That's how exams are won.",
      author: "Unknown",
    },
    {
      text: "You're in the final straight. Every revision session from here is a mark in the bank.",
      author: "Unknown",
    },
  ],
};

function _getTodayQuote() {
  if (!profile || !profile.examDate) return null;

  const today = todayStr();

  // Return stored quote if already picked today — same quote all day, survives tab changes and reopen
  try {
    const stored = JSON.parse(localStorage.getItem("st_daily_quote"));
    if (stored && stored.date === today) {
      return { text: stored.text, author: stored.author };
    }
  } catch (e) {}

  // First call today — pick based on current state
  const ps = _computePaceState();
  const syllabusChaps = chapters.filter((c) => !c.isCustom);
  const completed = syllabusChaps.filter(
    (c) => c.status === "Completed",
  ).length;
  const total = _syllabusGrandTotal() || syllabusChaps.length;
  const remaining = total - completed;

  let studiedDaysThisWeek = 0;
  for (let d = 0; d < 7; d++) {
    if (weeklyLog[addDays(today, -d)] > 0) studiedDaysThisWeek++;
  }

  const streakCount = streak ? streak.count : 0;

  // Exam day — one specific quote, shown regardless of other state
  const daysToExam = profile.examDate
    ? Math.round(
        (dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000,
      )
    : null;
  if (daysToExam === 0) {
    return {
      text: "You are more prepared than you feel, more capable than you think, and closer than you realise.",
      author: "Unknown",
    };
  }

  let pool = null;
  if (studiedDaysThisWeek === 0) pool = _TODAY_QUOTES.zero_days;
  else if (ps && ps.isEmergency) pool = _TODAY_QUOTES.zone3;
  else if (ps && ps.paceRecovering) pool = _TODAY_QUOTES.recovery;
  else if (
    ps &&
    !ps.onTrackForSafe &&
    !ps.inRevisionWindow &&
    ps.studyDaysCount >= 2
  )
    pool = _TODAY_QUOTES.behind;
  else if (remaining === 0 && total > 0) pool = _TODAY_QUOTES.revision_mode;
  else if (streakCount >= 7) pool = _TODAY_QUOTES.streak;
  else if (ps && ps.onTrackForSafe) pool = _TODAY_QUOTES.on_track;
  if (!pool && studiedDaysThisWeek > 0) pool = _TODAY_QUOTES.on_track;

  if (!pool) return null;

  // Date-seeded pick — deterministic, same result if called again today before storage is set
  const seed = parseInt(today.replace(/-/g, "")) % pool.length;
  const q = pool[seed];

  // Lock in for the rest of the day
  try {
    localStorage.setItem(
      "st_daily_quote",
      JSON.stringify({
        date: today,
        text: q.text,
        author: q.author,
      }),
    );
  } catch (e) {}

  return q;
}

function _renderTodayQuote() {
  const el = document.getElementById("today-quote");
  if (!el) return;
  const q = _getTodayQuote();
  if (!q) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<div class="today-quote-wrap">
    <div class="today-quote-text">"${q.text}"</div>
    <div class="today-quote-author">— ${q.author}</div>
  </div>`;
}

// ── PROCESS MISSED REVISIONS ON APP OPEN ──
function processMissedRevisions() {
  const t = todayStr();
  const yesterday = addDays(t, -1);
  const penaltyFiredKey = "st_penalty_" + yesterday;
  const alreadyPenalized = localStorage.getItem(penaltyFiredKey);

  // Find all undone revisions older than yesterday — permanently missed, with penalty per missed day
  const veryOld = revisions.filter(
    (r) =>
      !r.done &&
      !r.missedPermanently &&
      r.dueDate < yesterday &&
      isGraceExpired(r.dueDate),
  );
  if (veryOld.length > 0) {
    const missedDays = [...new Set(veryOld.map((r) => r.dueDate))];
    missedDays.forEach((day) => {
      const penaltyKey = "st_penalty_" + day;
      if (!localStorage.getItem(penaltyKey)) {
        coins = Math.max(0, (coins || 0) - 3);
        streak.count = 0;
        localStorage.setItem(penaltyKey, "1");
      }
    });
    veryOld.forEach((r) => {
      // Auto-flag chapter as weak if it already has 1+ permanently missed revisions (this will be the 2nd)
      const ch = chapters.find((c) => c.id === r.chapterId);
      if (ch && !ch.isWeak) {
        const alreadyMissed = revisions.filter(
          (rv) =>
            rv.chapterId === r.chapterId &&
            rv.missedPermanently &&
            rv.id !== r.id,
        ).length;
        if (alreadyMissed >= 1) {
          ch.isWeak = true;
          ch._autoFlagged = true;
          showToast(
            "⚠ Auto-flagged Weak!",
            "warn",
            `"${ch.name}" missed 2+ revisions — auto-marked as weak.`,
          );
        }
      }
      r.missedPermanently = true;
      missedRevisions.push({
        id: r.id,
        chapterName: r.chapterName,
        subject: r.subject,
        dueDate: r.dueDate,
        dayOffset: r.dayOffset,
        missedAt: t,
      });
    });
    save();
    showToast(
      "Kuch din ki chutti li? 😤📅",
      "error",
      `${missedDays.length} missed day(s) — streak reset, coins deducted.`,
    );
  }

  // Find yesterday's undone revisions where grace has expired
  const graceExpiredYesterday = revisions.filter(
    (r) =>
      !r.done &&
      !r.missedPermanently &&
      r.dueDate === yesterday &&
      isGraceExpired(yesterday),
  );

  if (graceExpiredYesterday.length > 0 && !alreadyPenalized) {
    coins = Math.max(0, (coins || 0) - 3);
    streak.count = 0;
    localStorage.setItem(penaltyFiredKey, "1");

    graceExpiredYesterday.forEach((r) => {
      r.missedPermanently = true;
      missedRevisions.push({
        id: r.id,
        chapterName: r.chapterName,
        subject: r.subject,
        dueDate: r.dueDate,
        dayOffset: r.dayOffset,
        missedAt: t,
      });
    });

    save();
    showToast(
      "Grace period khatam! 😔⏰",
      "error",
      "-3🪙 aur streak reset. Aaj se fresh start karo!",
    );
  }
}

// ── WEEKLY LOG ──
function logTodayActivity() {
  const t = todayStr();
  const revsDone = revisions.filter((r) => r.dueDate === t && r.done).length;
  const chapsDoneToday = chapters.filter(
    (c) => c.status === "Completed" && (c.completedDate || c.dateAdded) === t,
  ).length;
  weeklyLog[t] = revsDone + (chapsDoneToday > 0 ? 1 : 0);
  save();
}
function renderWeekly() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = "";

  const today7 = todayStr();
  const last7vals = Array.from(
    { length: 7 },
    (_, i) => weeklyLog[addDays(today7, -i)] || 0,
  );
  const max = Math.max(...last7vals, 1);
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today7, -i);
    const count = weeklyLog[d] || 0;
    const pct = Math.round((count / max) * 100);
    const dayName = weekdayShortIST(d);

    html += `<div class="week-day">
      <span class="week-day-name">${dayName}</span>
      <div class="week-bar-wrap"><div class="week-bar" style="width:${pct}%"></div></div>
      <span class="week-count">${count}</span>
    </div>`;
  }

  document.getElementById("weeklyChart").innerHTML = html;
}

// ── TABS ──
function switchTab(e, name) {
  if (name !== "today" && graceTimerInterval) {
    clearInterval(graceTimerInterval);
    graceTimerInterval = null;
  }
  if (name !== "today" && flipClockInterval) {
    clearInterval(flipClockInterval);
    flipClockInterval = null;
  }
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  e.currentTarget.classList.add("active");
  if (name === "today") renderTodayRevisions();
  if (name === "group") renderGroup();
  if (name === "weak") renderWeak();
  if (name === "chapters") renderSubjectGrid();
  if (name === "progress") renderProgress();
  if (name === "coach") renderCoachTab();
}

// ── SUBJECTS ──
function populateSubjectDropdown() {
  const sel = document.getElementById("subjectSelect");
  sel.innerHTML = "";
  subjects.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });

  // Also populate the subject filter in Chapters tab
  const filter = document.getElementById("subjectFilter");
  if (filter) {
    const current = filter.value;
    filter.innerHTML = '<option value="all">All Subjects</option>';
    subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      filter.appendChild(opt);
    });
    filter.value = current && subjects.includes(current) ? current : "all";
  }
}
function addCustomSubject() {
  const input = document.getElementById("customSubject");
  const val = input.value.trim();
  if (!val) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Pehle subject ka naam likho.",
    );
    return;
  }
  if (subjects.includes(val)) {
    showToast(
      "Bhai, ek hi cheez kitni baar padhoge? 😵‍💫🔁",
      "error",
      "Ye subject pehle se hai!",
    );
    return;
  }
  subjects.push(val);
  save();
  populateSubjectDropdown();
  document.getElementById("subjectSelect").value = val;
  input.value = "";
  playSaveSound();
  showToast(
    "Ek aur dukh pal liya? 📚🤯",
    "",
    "Chalo, naya subject add ho gaya!",
  );
}

// ── ADD CHAPTER ──
function addChapter() {
  const subject = document.getElementById("subjectSelect").value;
  const sel = document.getElementById("chapterNameSelect");
  const inp = document.getElementById("chapterName");
  const name =
    sel && sel.style.display !== "none" && sel.value !== "__custom__"
      ? sel.value.trim()
      : inp
        ? inp.value.trim()
        : "";
  const status = document.getElementById("chapterStatus").value;
  const isWeak = document.getElementById("weakToggle").checked;
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Chapter ka naam toh likho bhai.",
    );
    return;
  }
  // Block duplicate: same subject + same name (case-insensitive)
  const alreadyExists = chapters.some(
    (c) =>
      c.subject === subject &&
      c.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (alreadyExists) {
    showToast(
      "Ye chapter toh pehle se hai! 🔁😅",
      "error",
      `"${name}" is already added under ${subject}.`,
    );
    return;
  }
  // Check if this chapter exists in the preloaded syllabus
  let isCustom = true;
  if (window._syllabus) {
    const aliases = { "History & Civics": ["Civics", "History"] };
    const lookFor = aliases[subject] || [subject];
    outer: for (const group of Object.values(window._syllabus.groups)) {
      for (const subj of Object.values(group.subjects)) {
        if (lookFor.includes(subj.name)) {
          for (const ch of subj.chapters) {
            if (ch.name.trim().toLowerCase() === name.trim().toLowerCase()) {
              isCustom = false;
              break outer;
            }
          }
        }
      }
    }
  }

  const chapter = {
    id: uid(),
    subject,
    name,
    status,
    isWeak,
    isCustom,
    dateAdded: todayStr(),
    ...(status === "Completed" ? { completedDate: todayStr() } : {}),
  };
  chapters.push(chapter);
  if (status === "Completed") generateRevisions(chapter);
  save();
  renderAll();
  document.getElementById("chapterName").value = "";
  document.getElementById("chapterStatus").value = "Not Started";
  document.getElementById("weakToggle").checked = false;
  document.getElementById("weakLabel").textContent = "No";
  updateChapterSuggestions(); // refresh dropdown to exclude newly-added chapter
  playSaveSound();
  showToast(
    "Chapter save ho gaya! ✍️😏",
    "",
    "Ab bas padhai shuru karne ki der hai.",
  );
  switchTabByName("today");
  pushGroupUpdate();
}

function switchTabByName(name) {
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  // Fix for your original selector bug:
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (btn.dataset.tab === name) btn.classList.add("active");
  });
}

// ── REVISIONS ──
function generateRevisions(chapter) {
  [1, 3, 7, 30].forEach((n) => {
    revisions.push({
      id: uid(),
      chapterId: chapter.id,
      chapterName: chapter.name,
      subject: chapter.subject,
      dueDate: addDays(chapter.dateAdded, n),
      done: false,
      dayOffset: n,
    });
  });
}
function markRevDone(id) {
  const rev = revisions.find((r) => r.id === id);
  if (!rev) return;
  if (rev.done) return; // prevent double-tap double rewards

  // Capture button rect BEFORE renderAll() destroys the DOM
  const originEl =
    document.activeElement && document.activeElement.classList.contains("btn")
      ? document.activeElement
      : document.querySelector(`button[onclick*="${id}"]`);
  const originRect = originEl ? originEl.getBoundingClientRect() : null;

  rev.done = true;
  rev.completedOn = todayStr();

  const earned = coinForOffset(rev.dayOffset);
  if (earned > 0) {
    coins = (coins || 0) + earned;
  }
  rev.earnedCoins = earned;

  save();
  renderAll();

  playDoneSound();
  if (earned > 0) {
    setTimeout(playCoinSound, 90);
    if (originRect) {
      setTimeout(() => flyCoinsFromRect(originRect, earned), 120);
    }
  }

  showToast(
    `Shabash sher! 🦁💰`,
    "",
    earned > 0
      ? `Teri mehnat ke +${earned}🪙 mil gaye. Party kab hai?`
      : "Revision done! Agli baar coins bhi milenge.",
  );
  pushGroupUpdate();
  checkGroupMilestone();
}
function markGraceDone(id) {
  const rev = revisions.find((r) => r.id === id);
  if (!rev) return;
  if (rev.done) return;

  const originEl =
    document.activeElement && document.activeElement.classList.contains("btn")
      ? document.activeElement
      : document.querySelector(`button[onclick*="${id}"]`);
  const originRect = originEl ? originEl.getBoundingClientRect() : null;

  rev.done = true;
  rev.completedOn = todayStr();
  rev.completedInGrace = true;

  const base = coinForOffset(rev.dayOffset);
  const earned = Math.max(1, base - 2);
  rev.earnedCoins = earned;
  coins = (coins || 0) + earned;

  save();
  renderAll();

  playDoneSound();
  if (earned > 0) {
    setTimeout(playCoinSound, 90);
    if (originRect) {
      setTimeout(() => flyCoinsFromRect(originRect, earned), 120);
    }
  }

  showToast(
    "Grace mein complete! ⚡📚",
    "",
    `Thoda late, par kiya toh! +${earned}🪙 (reduced reward)`,
  );
  pushGroupUpdate();
  checkGroupMilestone();
}

function deleteRevision(id) {
  revisions = revisions.filter((r) => r.id !== id);
  save();
  renderAll();
  playDeleteSound();
  pushGroupUpdate();
}

let _confirmCallback = null;

function showConfirmModal(question, onYes) {
  _confirmCallback = onYes;
  document.getElementById("confirmQuestion").textContent = question;
  document.getElementById("confirmModal").classList.remove("hidden");
}

function closeConfirmModal() {
  _confirmCallback = null;
  document.getElementById("confirmModal").classList.add("hidden");
}

function confirmYes() {
  if (_confirmCallback) _confirmCallback();
  closeConfirmModal();
}

function deleteChapter(id) {
  showConfirmModal("Do you really want to delete this chapter?", () => {
    chapters = chapters.filter((c) => c.id !== id);
    revisions = revisions.filter((r) => r.chapterId !== id);
    save();
    renderAll();
    playDeleteSound();
    showToast(
      "Gaya kaam se! 🚮💨",
      "",
      "Jaise exam ke baad sab bhool jate ho.",
    );
  });
}
function updateStatus(id, newStatus) {
  const ch = chapters.find((c) => c.id === id);
  if (!ch) return;
  const wasCompleted = ch.status === "Completed";
  const nowCompleted = newStatus === "Completed";
  ch.status = newStatus;
  if (nowCompleted && !wasCompleted) {
    const tempDate = ch.dateAdded;
    ch.completedDate = todayStr();
    ch.dateAdded = todayStr();
    revisions = revisions.filter((r) => r.chapterId !== id);
    generateRevisions(ch);
    ch.dateAdded = tempDate;
    playSaveSound();
    showToast(
      "Oho! Aag laga di. 🔥📅",
      "",
      "Revision ka schedule set kar diya hai.",
    );
    pushGroupUpdate();
    checkGroupMilestone();
  }
  if (!nowCompleted && wasCompleted) {
    revisions = revisions.filter((r) => r.chapterId !== id);
    showToast(
      "Aalas ki bhi seema hoti hai! 🧹😴",
      "",
      "Revision schedule saaf kar diya.",
    );
    pushGroupUpdate();
  }
  save();
  renderAll();
}

// ── FILTER ──
function setFilter(f) {
  currentFilter = f;
  ["all", "completed", "pending"].forEach((k) => {
    document.getElementById("f-" + k).classList.remove("btn-primary");
    document.getElementById("f-" + k).classList.add("btn-secondary");
  });
  document.getElementById("f-" + f).classList.remove("btn-secondary");
  document.getElementById("f-" + f).classList.add("btn-primary");
  renderSubjectGrid();
}

// ── RENDER TODAY ──
function renderTodayRevisions() {
  renderFlipClock();
  _renderTodayQuote();
  const grid = document.getElementById("todayGrid");
  const t = todayStr();
  const yesterday = addDays(t, -1);

  const due = revisions.filter(
    (r) => r.dueDate === t && !r.done && !r.missedPermanently,
  );
  const grace = revisions.filter(
    (r) =>
      r.dueDate === yesterday &&
      !r.done &&
      !r.missedPermanently &&
      isInGrace(yesterday),
  );

  document.getElementById("stat-due").textContent = due.length + grace.length;
  document.getElementById("stat-done").textContent = revisions.filter(
    (r) =>
      (r.dueDate === t && r.done) ||
      (r.completedInGrace === true && r.completedOn === t),
  ).length;
  document.getElementById("stat-chapters").textContent = chapters.length;

  if (due.length === 0 && grace.length === 0) {
    grid.innerHTML =
      '<div class="empty"><div class="emoji">🎉</div><p>No revisions due today!</p></div>';
    if (graceTimerInterval) {
      clearInterval(graceTimerInterval);
      graceTimerInterval = null;
    }
    return;
  }

  let html = "";

  if (grace.length > 0) {
    const graceExpiry = graceExpireTime(yesterday);
    const timerHtml = `<div class="grace-timer-block">
      <span class="grace-timer-label">⏳ Grace ends in</span>
      <span class="grace-timer-value" id="graceCountdown">--:--</span>
    </div>`;

    const graceGroups = {};
    grace.forEach((r) => {
      if (!graceGroups[r.subject]) graceGroups[r.subject] = [];
      graceGroups[r.subject].push(r);
    });

    let graceRows = "";
    Object.keys(graceGroups).forEach((subject) => {
      const revs = graceGroups[subject];
      revs.forEach((r) => {
        const reduced = Math.max(1, coinForOffset(r.dayOffset) - 2);
        graceRows += `<div class="rev-row" style="border-left:3px solid #f87171">
          <div style="flex:1;min-width:0">
            <p>${sanitize(r.chapterName)}</p>
            <span style="color:#f87171">⚠ Grace · ${sanitize(r.subject)} · +${r.dayOffset}d · Will earn: ${reduced}🪙 (reduced)</span>
          </div>
          <div class="rev-actions">
            <button class="btn btn-success btn-sm" onclick="markGraceDone('${r.id}')">✓ Done</button>
          </div>
        </div>`;
      });
    });

    html += `<div class="grace-card">
      <h3>⚠️ Missed Yesterday — Grace Period</h3>
      ${timerHtml}
      ${graceRows}
    </div>`;

    if (graceTimerInterval) clearInterval(graceTimerInterval);
    graceTimerInterval = setInterval(() => {
      const el = document.getElementById("graceCountdown");
      if (!el) {
        clearInterval(graceTimerInterval);
        return;
      }
      const diff = graceExpiry.getTime() - Date.now();
      if (diff <= 0) {
        el.textContent = "Expired!";
        clearInterval(graceTimerInterval);
        renderAll();
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      el.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
    }, 10000);
  } else {
    if (graceTimerInterval) {
      clearInterval(graceTimerInterval);
      graceTimerInterval = null;
    }
  }

  const groups = {};
  due.forEach((r) => {
    if (!groups[r.subject]) groups[r.subject] = [];
    groups[r.subject].push(r);
  });
  Object.keys(groups).forEach((subject) => {
    const revs = groups[subject];
    let rows = "";
    revs.forEach((r) => {
      rows += `<div class="rev-row">
        <div style="flex:1;min-width:0"><p>${sanitize(r.chapterName)}</p><span>+${r.dayOffset}d · Will earn: ${coinForOffset(r.dayOffset)}🪙</span></div>
        <div class="rev-actions">
          <button class="btn btn-success btn-sm" onclick="markRevDone('${r.id}')">✓ Done</button>
        </div></div>`;
    });
    html += `<div class="today-card"><h3>📖 ${sanitize(subject)}</h3>${rows}</div>`;
  });

  grid.innerHTML = html;

  if (grace.length > 0) {
    const el2 = document.getElementById("graceCountdown");
    if (el2) {
      const graceExpiry = graceExpireTime(yesterday);
      const diff = graceExpiry.getTime() - Date.now();
      if (diff > 0) {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        el2.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
      }
    }
  }
}
// ── RENDER DONE ──
function renderDoneRevisions() {
  const container = document.getElementById("doneRevList");
  const done = revisions.filter((r) => r.done);
  if (done.length === 0) {
    container.innerHTML =
      '<div class="empty"><div class="emoji">📋</div><p>No completed revisions yet.</p></div>';
  } else {
    const groups = {};
    done.forEach((r) => {
      if (!groups[r.subject]) groups[r.subject] = [];
      groups[r.subject].push(r);
    });
    let html = "";
    Object.keys(groups).forEach((subject) => {
      const revs = groups[subject];
      let items = "";
      revs.forEach((r) => {
        const doneLabel = r.completedOn
          ? r.completedInGrace
            ? `Completed on grace: ${fmtDate(r.completedOn)}`
            : `Completed on: ${fmtDate(r.completedOn)}`
          : fmtDate(r.dueDate);
        const doneCoins =
          r.earnedCoins !== undefined
            ? r.earnedCoins
            : coinForOffset(r.dayOffset);
        items += `<div class="done-item">
  <div class="info"><div class="name">${sanitize(r.chapterName)}</div><div class="meta">+${r.dayOffset}d · ${doneLabel} · +${doneCoins}🪙</div></div>
</div>`;
      });
      html += `<div style="margin-bottom:12px"><p style="color:var(--green);font-size:0.72rem;font-weight:600;text-transform:uppercase;margin-bottom:5px">${sanitize(subject)}</p>${items}</div>`;
    });
    container.innerHTML = html;
  }

  const permCard = document.getElementById("missedPermCard");
  const permList = document.getElementById("missedPermList");
  if (!permCard || !permList) return;

  if (missedRevisions.length === 0) {
    permCard.style.display = "none";
    return;
  }

  permCard.style.display = "block";
  const mGroups = {};
  missedRevisions.forEach((r) => {
    if (!mGroups[r.subject]) mGroups[r.subject] = [];
    mGroups[r.subject].push(r);
  });
  let mHtml = "";
  Object.keys(mGroups).forEach((subject) => {
    const revs = mGroups[subject];
    let items = "";
    revs.forEach((r) => {
      items += `<div class="missed-perm-item">
        <div class="info">
          <div class="name">${sanitize(r.chapterName)}</div>
          <div class="meta">+${r.dayOffset}d · Due ${fmtDate(r.dueDate)} · Missed ${fmtDate(r.missedAt)}</div>
        </div>
      </div>`;
    });
    mHtml += `<div style="margin-bottom:12px"><p style="color:#f87171;font-size:0.72rem;font-weight:600;text-transform:uppercase;margin-bottom:5px">${sanitize(subject)}</p>${items}</div>`;
  });
  permList.innerHTML = mHtml;
}

// ── RENDER CALENDAR ──
function renderCalendar() {
  const container = document.getElementById("calendarList");
  const t = todayStr();
  const upcoming = revisions
    .filter((r) => !r.done && !r.missedPermanently && r.dueDate >= t)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (upcoming.length === 0) {
    container.innerHTML =
      '<div class="empty"><div class="emoji">📭</div><p>No upcoming revisions.</p></div>';
    return;
  }
  const byDate = {};
  upcoming.forEach((r) => {
    if (!byDate[r.dueDate]) byDate[r.dueDate] = [];
    byDate[r.dueDate].push(r);
  });
  let html = "";
  Object.keys(byDate).forEach((date) => {
    const revs = byDate[date];
    let chips = "";
    revs.forEach((r) => {
      chips += `<div class="cal-chip"><p class="chip-name">${sanitize(r.chapterName)}</p><p class="chip-meta">${sanitize(r.subject)} · +${r.dayOffset}d · Will earn: ${coinForOffset(r.dayOffset)}🪙</p></div>`;
    });
    html += `<div class="cal-day">
      <div class="cal-day-header">
        <div><p class="cal-date">${fmtDate(date)}</p><p class="cal-relative">${daysFromToday(date)}</p></div>
        <span class="cal-badge">${revs.length} revision${revs.length > 1 ? "s" : ""}</span>
      </div>
      <div class="cal-chips">${chips}</div>
    </div>`;
  });
  container.innerHTML = html;
}

// ── RENDER SUBJECT GRID ──
function renderSubjectGrid() {
  const grid = document.getElementById("subjectGrid");
  const subjectFilterEl = document.getElementById("subjectFilter");
  const selectedSubject = subjectFilterEl ? subjectFilterEl.value : "all";
  let filtered = chapters.slice();
  if (currentFilter === "completed")
    filtered = filtered.filter((c) => c.status === "Completed");
  if (currentFilter === "pending")
    filtered = filtered.filter((c) => c.status !== "Completed");
  if (selectedSubject !== "all")
    filtered = filtered.filter((c) => c.subject === selectedSubject);
  const groups = {};
  filtered.forEach((c) => {
    if (!groups[c.subject]) groups[c.subject] = [];
    groups[c.subject].push(c);
  });
  if (Object.keys(groups).length === 0) {
    grid.innerHTML =
      '<div class="empty"><div class="emoji">📚</div><p>No chapters found.</p></div>';
    return;
  }
  let html = "";
  Object.keys(groups).forEach((subject) => {
    const chs = groups[subject];
    let cards = "";
    chs.forEach((ch) => {
      cards += chapterCard(ch);
    });
    html += `<div class="subj-card">
      <div class="subj-card-header"><h3>📖 ${sanitize(subject)}</h3><span>${chs.length} chapter${chs.length > 1 ? "s" : ""}</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
    </div>`;
  });
  grid.innerHTML = html;
}

// ── RENDER WEAK ──
function renderWeak() {
  const grid = document.getElementById("weakGrid");
  const weak = chapters.filter((c) => c.isWeak);
  if (weak.length === 0) {
    grid.innerHTML =
      '<div class="empty"><div class="emoji">💪</div><p>No weak chapters! Great job!</p></div>';
    return;
  }
  const groups = {};
  weak.forEach((c) => {
    if (!groups[c.subject]) groups[c.subject] = [];
    groups[c.subject].push(c);
  });
  let html = "";
  Object.keys(groups).forEach((subject) => {
    const chs = groups[subject];
    let cards = "";
    chs.forEach((ch) => {
      cards += chapterCard(ch);
    });
    html += `<div class="subj-card">
      <div class="subj-card-header"><h3>📖 ${sanitize(subject)}</h3><span>${chs.length} weak</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
    </div>`;
  });
  grid.innerHTML = html;
}

// ── TOGGLE REVISIONS INSIDE CHAPTER CARD ──
function toggleRevisions(chId) {
  const el = document.getElementById("rev-expand-" + chId);
  const btn = document.getElementById("rev-btn-" + chId);
  if (!el || !btn) return;
  const isOpen = el.style.display !== "none";
  el.style.display = isOpen ? "none" : "block";
  btn.textContent = isOpen ? "📋 See Revisions" : "🔼 Hide Revisions";
}

// ── CHAPTER CARD ──
function chapterCard(ch) {
  const badgeClass =
    ch.status === "Completed"
      ? "badge-cp"
      : ch.status === "In Progress"
        ? "badge-ip"
        : "badge-ns";
  const upcoming = revisions
    .filter((r) => r.chapterId === ch.id && !r.done && !r.missedPermanently)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const t = todayStr();
  let nextRev = "";
  if (upcoming[0]) {
    nextRev = `<p class="next-rev">⏰ Next: ${fmtDate(upcoming[0].dueDate)} (${daysFromToday(upcoming[0].dueDate)})</p>`;
  } else if (ch.status === "Completed") {
    nextRev = `<p class="all-done">✅ All revisions done!</p>`;
  }
  const weakBadge = ch.isWeak ? `<span class="weak-badge">⚠ Weak</span>` : "";
  const customBadge = ch.isCustom
    ? `<span class="custom-badge">✦ Custom</span>`
    : "";

  let dots = "";
  [1, 3, 7, 30].forEach((n) => {
    const rev = revisions.find(
      (r) => r.chapterId === ch.id && r.dayOffset === n,
    );
    if (!rev) return;
    const cls = rev.done
      ? "done"
      : rev.missedPermanently
        ? "missed"
        : rev.dueDate === t
          ? "today"
          : "pending";
    dots += `<div class="rev-dot ${cls}" title="+${n}d">${n}</div>`;
  });
  const dotsHtml = dots ? `<div class="rev-dots">${dots}</div>` : "";

  // Build See Revisions sections
  const chRevs = revisions.filter((r) => r.chapterId === ch.id);
  const completedRevs = chRevs.filter((r) => r.done);
  const upcomingRevs = chRevs.filter((r) => !r.done && !r.missedPermanently);
  const missedRevs = chRevs.filter((r) => r.missedPermanently);

  let completedHtml = "";
  completedRevs.forEach((r) => {
    if (!r.completedOn) return; // skip old revisions with no date
    const graceLabel = r.completedInGrace ? " (grace)" : "";
    const dateLabel = r.completedInGrace
      ? `Completed on grace: ${fmtDate(r.completedOn)}`
      : `Completed on: ${fmtDate(r.completedOn)}`;
    const earned =
      r.earnedCoins !== undefined ? r.earnedCoins : coinForOffset(r.dayOffset);
    completedHtml += `<div class="see-rev-item see-rev-done">
      <span class="see-rev-interval">+${r.dayOffset}d${graceLabel}</span>
      <span class="see-rev-date">${dateLabel}</span>
      <span class="see-rev-coins">+${earned}🪙</span>
    </div>`;
  });
  if (!completedHtml)
    completedHtml = `<div class="see-rev-empty">No completed revisions yet.</div>`;

  let upcomingHtml = "";
  upcomingRevs.forEach((r) => {
    upcomingHtml += `<div class="see-rev-item see-rev-upcoming">
      <span class="see-rev-interval">+${r.dayOffset}d</span>
      <span class="see-rev-date">Upcoming on: ${fmtDate(r.dueDate)}</span>
      <span class="see-rev-coins">Will earn: ${coinForOffset(r.dayOffset)}🪙</span>
    </div>`;
  });
  if (!upcomingHtml)
    upcomingHtml = `<div class="see-rev-empty">No upcoming revisions.</div>`;

  let missedHtml = "";
  missedRevs.forEach((r) => {
    const missedDate = r.missedAt ? fmtDate(r.missedAt) : fmtDate(r.dueDate);
    missedHtml += `<div class="see-rev-item see-rev-missed">
      <span class="see-rev-interval">+${r.dayOffset}d</span>
      <span class="see-rev-date">Missed on: ${missedDate}</span>
      <span class="see-rev-coins">0🪙 earned</span>
    </div>`;
  });
  if (!missedHtml)
    missedHtml = `<div class="see-rev-empty">No missed revisions.</div>`;

  const chRevs_lock = revisions.filter((r) => r.chapterId === ch.id);
  const r1 = chRevs_lock.find((r) => r.dayOffset === 1);
  const isLocked =
    r1 && (r1.done || r1.missedPermanently || r1.completedInGrace);

  return `<div class="chapter-card">
    <div class="chapter-card-top">
      <div style="flex:1;min-width:0">
        <span class="chapter-name">${sanitize(ch.name)}</span>${weakBadge}${customBadge}
        <div><span class="badge ${badgeClass}">${ch.status}</span></div>
        ${nextRev}${dotsHtml}
        <p class="added-date">Added: ${fmtDate(ch.dateAdded)}</p>
      </div>
${
  isLocked
    ? `<div onclick="showToast('Revision attempted! 🔒', 'error', 'One revision is already attempted! Can\\'t change status or delete this chapter now.')" style="cursor:pointer">
            <select class="status-select" disabled style="opacity:0.4;pointer-events:none">
              <option value="Not Started"${ch.status === "Not Started" ? " selected" : ""}>Not Started</option>
              <option value="In Progress"${ch.status === "In Progress" ? " selected" : ""}>In Progress</option>
              <option value="Completed"${ch.status === "Completed" ? " selected" : ""}>Completed</option>
            </select>
           </div>`
    : `<select class="status-select" onchange="updateStatus('${ch.id}',this.value)">
            <option value="Not Started"${ch.status === "Not Started" ? " selected" : ""}>Not Started</option>
            <option value="In Progress"${ch.status === "In Progress" ? " selected" : ""}>In Progress</option>
            <option value="Completed"${ch.status === "Completed" ? " selected" : ""}>Completed</option>
           </select>`
}
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn btn-secondary btn-xs" style="flex:1" id="rev-btn-${ch.id}" onclick="toggleRevisions('${ch.id}')">📋 See Revisions</button>
      ${
        !isLocked
          ? `<button class="btn btn-danger btn-xs" style="flex:1" onclick="deleteChapter('${ch.id}')">🗑 Delete Chapter</button>`
          : `<button class="btn btn-danger btn-xs" style="flex:1;opacity:0.4" onclick="showToast('Revision attempted! 🔒', 'error', 'One revision is already attempted! Can\\'t change status or delete this chapter now.')">🗑 Delete Chapter</button>`
      }
    </div>
    <div id="rev-expand-${ch.id}" style="display:none;margin-top:10px">
      <div class="see-rev-section">
        <div class="see-rev-label see-rev-label-done">✅ Completed</div>
        ${completedHtml}
      </div>
      <div class="see-rev-section">
        <div class="see-rev-label see-rev-label-upcoming">⏰ Upcoming</div>
        ${upcomingHtml}
      </div>
      <div class="see-rev-section">
        <div class="see-rev-label see-rev-label-missed">❌ Missed</div>
        ${missedHtml}
      </div>
    </div>
  </div>`;
}

// ── MODAL ──
function showNotifModal() {
  const t = todayStr();
  const due = revisions.filter(
    (r) => r.dueDate === t && !r.done && !r.missedPermanently,
  );
  if (due.length === 0) return;
  let html = "";
  due.forEach((r) => {
    html += `<li class="notif-item">
      <div><p class="nname">${sanitize(r.chapterName)}</p><p class="nsub">${sanitize(r.subject)} · +${r.dayOffset} day · ${coinForOffset(r.dayOffset)}🪙</p></div>
      <span class="ntag">Due Today</span>
    </li>`;
  });
  document.getElementById("notifList").innerHTML = html;
  document.getElementById("notifModal").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("notifModal").classList.add("hidden");
}

// ── GROUP SYSTEM ──
function generateGroupCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function createGroup() {
  if (groupCode) {
    showToast(
      "Ek group kaafi nahi tha kya? 😏",
      "error",
      "Pehle current group chhodo.",
    );
    return;
  }
  const name = profile && profile.name ? profile.name.trim() : "";
  if (!name) {
    showToast(
      "Pehle profile mein naam set karo! 👤",
      "error",
      "Profile drawer kholo aur naam likho.",
    );
    return;
  }
  const grpNameVal =
    document.getElementById("grp-groupname").value.trim() || name + "'s Group";
  const code = generateGroupCode();
  groupCode = code;
  groupName = name;
  groupDisplayName = grpNameVal;
  isCreator = true;
  localStorage.setItem("st_group", code);
  localStorage.setItem("st_grpname", name);
  localStorage.setItem("st_isCreator", "true");
  localStorage.setItem("st_groupDisplayName", grpNameVal);
  if (db) {
    try {
      await db.collection("groups").doc(code).set({
        groupName: grpNameVal,
        creatorId: memberId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.log("Root doc error:", e);
    }
  }
  await pushGroupUpdate(true);
  renderGroup();
  playGroupCreateSound();
  showToast(
    "Apna ilaaka ban gaya! 🏰😎",
    "",
    "Code: " + code + " — doston ko fansao.",
  );
}
function showJoinGroup() {
  document.getElementById("joinGroupPanel").style.display = "block";
  document.getElementById("grp-groupname-field").style.display = "none";
}

async function joinGroup() {
  if (groupCode) {
    showToast(
      "Ek group kaafi nahi tha kya? 😏",
      "error",
      "Pehle current group chhodo.",
    );
    return;
  }
  const name = profile && profile.name ? profile.name.trim() : "";
  const code = document
    .getElementById("grp-code-input")
    .value.trim()
    .toUpperCase();
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Group mein dikhne ke liye naam chahiye.",
    );
    return;
  }
  if (code.length !== 6) {
    showToast(
      "Galat code! Kya jasusi karne ka irada hai? 🕵️‍♂️❌",
      "error",
      "6 character ka sahi code daalo.",
    );
    return;
  }
  if (!db) {
    showToast(
      "Internet ne saath chhod diya! 📶😭",
      "error",
      "Jaise exam mein dimaag chhodta hai. Try karo.",
    );
    return;
  }
  showToast("Checking code…", "info");
  try {
    const snap = await db.collection("groups").doc(code).get();
    if (!snap.exists) {
      showToast(
        "Galat code! Kya jasusi karne ka irada hai? 🕵️‍♂️❌",
        "error",
        "Koi group nahi mila. Code check karo.",
      );
      return;
    }
  } catch (e) {
    showToast(
      "Internet ne saath chhod diya! 📶😭",
      "error",
      "Group check nahi ho paya. Dobara try karo.",
    );
    return;
  }
  groupCode = code;
  groupName = name;
  isCreator = false;
  localStorage.setItem("st_group", code);
  localStorage.setItem("st_grpname", name);
  localStorage.setItem("st_isCreator", "false");
  if (db) {
    try {
      const rootDoc = await db.collection("groups").doc(code).get();
      if (rootDoc.exists) {
        groupDisplayName = rootDoc.data().groupName || "";
        localStorage.setItem("st_groupDisplayName", groupDisplayName);
      }
    } catch (e) {
      console.log("Root doc read error:", e);
    }
  }
  await pushGroupUpdate(true);
  renderGroup();
  playGroupJoinSound();
  showToast(
    "Swagat hai! 🤝🥳",
    "",
    "Ab akele fail nahi hoge, group mein maza aayega.",
  );
}

async function leaveGroup() {
  showConfirmModal("Do you really want to leave this group?", async () => {
    if (lbUnsubscribe) {
      lbUnsubscribe();
      lbUnsubscribe = null;
    }
    if (activityUnsubscribe) {
      activityUnsubscribe();
      activityUnsubscribe = null;
    }
    if (groupNameUnsubscribe) {
      groupNameUnsubscribe();
      groupNameUnsubscribe = null;
    }

    // Remove this device/user from Firestore so others see real-time removal
    try {
      if (groupCode && db && memberId) {
        await db
          .collection("groups")
          .doc(groupCode)
          .collection("members")
          .doc(memberId)
          .delete();
      }
    } catch (e) {
      console.log("Leave group delete error:", e);
    }
    groupCode = "";
    groupName = "";
    groupDisplayName = "";
    isCreator = false;
    localStorage.removeItem("st_group");
    localStorage.removeItem("st_grpname");
    localStorage.removeItem("st_isCreator");
    localStorage.removeItem("st_groupDisplayName");
    document.getElementById("groupMain").style.display = "none";
    document.getElementById("groupSetup").style.display = "block";
    document.getElementById("joinGroupPanel").style.display = "none";
    document.getElementById("grp-groupname-field").style.display = "flex";
    playLeaveGroupSound();
    showToast(
      "Akela rahi... 🚶‍♂️💔",
      "",
      "Group chhod diya par padhai mat chhodna!",
    );
  });
}
function copyGroupCode() {
  navigator.clipboard
    .writeText(groupCode)
    .then(() => {
      playCopySound();
      showToast(
        "Code copy ho gaya! 📋✨",
        "",
        "Ab bas gyaan baantna baaki hai.",
      );
    })
    .catch(() => showToast("Couldn't copy code", "error"));
}

let _pushDebounceTimer = null;

async function _doPushGroupUpdate(isJoin) {
  if (!groupCode || !db || !memberId) return;
  const t = todayStr();

  // keeping your original metric behavior (completedChapters is total completed, not "today")

  try {
    await db
      .collection("groups")
      .doc(groupCode)
      .collection("members")
      .doc(memberId)
      .set(
        {
          memberId,
          displayName: groupName,
          name: groupName,
          streak: streak.count,
          coins: coins || 0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    // Log activity (skip on join)
    if (!isJoin) {
      const activity = {
        memberId,
        member: groupName,
        coins: coins || 0,
        date: t,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await db
        .collection("groups")
        .doc(groupCode)
        .collection("activity")
        .add(activity);
    }
  } catch (e) {
    console.log("Firebase error:", e);
  }
}

function pushGroupUpdate(isJoin) {
  if (!groupCode || !db || !memberId) return;
  if (isJoin) {
    // Join and create calls fire immediately — they need instant confirmation
    return _doPushGroupUpdate(true);
  }
  // Non-join calls: debounce so rapid bursts (marking 6 revisions done) only hit Firestore once
  clearTimeout(_pushDebounceTimer);
  _pushDebounceTimer = setTimeout(() => _doPushGroupUpdate(false), 2000);
}

async function checkGroupMilestone() {
  if (!groupCode || !db) return;
  const completed = chapters.filter((c) => c.status === "Completed").length;
  if (completed > 0 && completed % 5 === 0) {
    try {
      await db
        .collection("groups")
        .doc(groupCode)
        .collection("milestones")
        .add({
          memberId,
          member: groupName,
          milestone: completed + " chapters completed!",
          date: todayStr(),
          ts: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {}
  }
}

function toggleRenameGroup() {
  const section = document.getElementById("renameGroupSection");
  if (!section) return;
  const isVisible = section.style.display !== "none";
  section.style.display = isVisible ? "none" : "block";
  if (!isVisible) {
    const inp = document.getElementById("rename-grp-input");
    if (inp) inp.value = groupDisplayName;
  }
}

async function renameGroup() {
  if (!isCreator || !groupCode || !db) return;
  const inp = document.getElementById("rename-grp-input");
  const newName = inp ? inp.value.trim() : "";
  if (!newName) {
    showToast("Naam toh do bhai! 😤🚫", "error", "Group ka naya naam likho.");
    return;
  }
  try {
    await db.collection("groups").doc(groupCode).update({ groupName: newName });
    groupDisplayName = newName;
    localStorage.setItem("st_groupDisplayName", newName);
    const nameEl = document.getElementById("groupNameDisplay");
    if (nameEl) nameEl.textContent = newName;
    document.getElementById("renameGroupSection").style.display = "none";
    playSaveSound();
    showToast(
      "Naya naam, wahi purane kaand! 🏷️🎭",
      "",
      "Group update ho gaya.",
    );
  } catch (e) {
    showToast(
      "Naam badalna itna mushkil kyun hai? 😤",
      "error",
      "Rename fail hua. Dobara try karo.",
    );
  }
}

function loadGroupName() {
  if (!db || !groupCode) return;
  if (groupNameUnsubscribe) groupNameUnsubscribe();
  groupNameUnsubscribe = db
    .collection("groups")
    .doc(groupCode)
    .onSnapshot(
      (doc) => {
        if (doc.exists) {
          const data = doc.data();
          groupDisplayName = data.groupName || "";
          localStorage.setItem("st_groupDisplayName", groupDisplayName);
          const nameEl = document.getElementById("groupNameDisplay");
          if (nameEl) nameEl.textContent = groupDisplayName;
        }
      },
      (e) => console.log("Group name listener error:", e),
    );
}

function renderGroup() {
  if (!groupCode) {
    document.getElementById("groupSetup").style.display = "block";
    document.getElementById("groupMain").style.display = "none";
    return;
  }
  document.getElementById("groupSetup").style.display = "none";
  document.getElementById("groupMain").style.display = "block";
  document.getElementById("groupCodeDisplay").textContent = groupCode;
  const nameEl = document.getElementById("groupNameDisplay");
  if (nameEl) nameEl.textContent = groupDisplayName || "";
  const renameBtn = document.getElementById("renameGroupBtn");
  if (renameBtn) renameBtn.style.display = isCreator ? "flex" : "none";
  loadLeaderboard();
  loadActivity();
  loadGroupName();
}

function loadLeaderboard() {
  if (!db) {
    document.getElementById("leaderboard").innerHTML =
      '<div class="empty"><p>Group feature requires internet.</p></div>';
    return;
  }
  if (lbUnsubscribe) lbUnsubscribe();

  lbUnsubscribe = db
    .collection("groups")
    .doc(groupCode)
    .collection("members")
    .onSnapshot(
      (snap) => {
        const members = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          members.push({ id: doc.id, ...d });
        });
        members.sort((a, b) => {
          const coinDiff = (b.coins || 0) - (a.coins || 0);
          if (coinDiff !== 0) return coinDiff;
          const streakDiff = (b.streak || 0) - (a.streak || 0);
          if (streakDiff !== 0) return streakDiff;
          return (a.displayName || a.name || "").localeCompare(
            b.displayName || b.name || "",
          );
        });
        const medals = ["🥇", "🥈", "🥉"];
        let html = "";
        members.forEach((m, i) => {
          const isYou = m.id === memberId;
          const display = m.displayName || m.name || "Member";
          html += `<div class="lb-card${isYou ? " lb-you" : ""}">
          <div class="lb-rank">${medals[i] || "#" + (i + 1)}</div>
          <div class="lb-info">
            <div class="lb-name">${sanitize(display)}${isYou ? " (You)" : ""}</div>
            <div class="lb-stats">
              <span class="lb-stat">🪙 <span>${m.coins || 0}</span> coins</span>
              <span class="lb-stat">🔥 <span>${m.streak || 0}</span> streak</span>
            </div>
          </div>
        </div>`;
        });
        if (!html)
          html =
            '<div class="empty"><div class="emoji">👥</div><p>No members yet. Share your group code!</p></div>';
        document.getElementById("leaderboard").innerHTML = html;
      },
      (err) => {
        console.log("Leaderboard listener error:", err);
        document.getElementById("leaderboard").innerHTML =
          '<div class="empty"><p>Could not load leaderboard.</p></div>';
      },
    );
}
// real-time activity listener
function loadActivity() {
  if (!db) {
    document.getElementById("activityFeed").innerHTML =
      '<div class="empty"><p>Activity requires internet.</p></div>';
    return;
  }
  const t = todayStr();

  if (activityUnsubscribe) activityUnsubscribe();

  activityUnsubscribe = db
    .collection("groups")
    .doc(groupCode)
    .collection("activity")
    .where("date", "==", t)
    .orderBy("ts", "desc")
    .limit(20)
    .onSnapshot(
      (snap) => {
        let html = "";
        snap.forEach((doc) => {
          const d = doc.data() || {};
          const name = d.member || "Member";
          html += `<div class="activity-item">
          <div class="activity-dot"></div>
          <div>
        <div class="activity-text"><strong>${sanitize(name)}</strong> · 🪙 ${d.coins || 0} coins</div>
            <div class="activity-time">Today</div>
          </div>
        </div>`;
        });
        if (!html)
          html =
            '<div class="empty"><div class="emoji">⚡</div><p>No activity today yet. Be the first!</p></div>';
        document.getElementById("activityFeed").innerHTML = html;
      },
      (err) => {
        console.error("Activity listener error:", err);
        document.getElementById("activityFeed").innerHTML =
          '<div class="empty"><p>⚠️ Activity unavailable. Create a composite index for <em>date + ts</em> in Firebase Console.</p></div>';
      },
    );
}

// ── REBUILD SUBJECTS FROM SYLLABUS ──
function rebuildSubjectsFromSyllabus() {
  if (!window._syllabus || !profile) return;
  // No guard — always rebuild subject list from profile preferences

  const stream = profile.stream || "science";
  const lang2 = profile.lang2 || "hindi";
  const elective = profile.elective || "computer";

  const toLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  if (stream === "science") toLoad.push("physics", "chemistry", "biology");
  else toLoad.push("commerce", "economics_g2");
  toLoad.push(lang2);
  toLoad.push(elective);

  const subjDefs = {};
  Object.values(window._syllabus.groups).forEach((group) => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      subjDefs[key] = subj;
    });
  });

  subjects = [
    ...new Set(
      toLoad
        .filter((key) => subjDefs[key] && subjDefs[key].chapters.length > 0)
        .map((key) => subjDefs[key].name),
    ),
  ]
    .map((s) => (s === "History" || s === "Civics" ? "History & Civics" : s))
    .filter((s, i, arr) => arr.indexOf(s) === i);
  save();
}

// ── CHAPTER AUTOFILL ──
function updateChapterSuggestions() {
  const sel = document.getElementById("chapterNameSelect");
  const inp = document.getElementById("chapterName");
  if (!sel) return;
  const selectedSubject = document.getElementById("subjectSelect").value;
  const aliases = { "History & Civics": ["Civics", "History"] };
  const lookFor = aliases[selectedSubject] || [selectedSubject];
  const addedNames = new Set(
    chapters
      .filter((c) => c.subject === selectedSubject)
      .map((c) => c.name.trim().toLowerCase()),
  );
  const allChapters = [];
  if (window._syllabus) {
    Object.values(window._syllabus.groups).forEach((group) => {
      Object.values(group.subjects).forEach((subj) => {
        if (lookFor.includes(subj.name)) {
          subj.chapters.forEach((ch) => {
            if (!addedNames.has(ch.name.trim().toLowerCase())) {
              allChapters.push(ch.name);
            }
          });
        }
      });
    });
  }
  if (allChapters.length > 0) {
    sel.style.display = "block";
    if (inp) inp.style.display = "none";
    sel.innerHTML =
      `<option value="" disabled selected>— Select a chapter —</option>` +
      allChapters
        .map((n) => `<option value="${sanitize(n)}">${sanitize(n)}</option>`)
        .join("") +
      `<option value="__custom__">✦ Type custom name...</option>`;
  } else {
    sel.style.display = "none";
    if (inp) {
      inp.style.display = "block";
      inp.value = "";
    }
  }
}

function onChapterSelectChange() {
  const sel = document.getElementById("chapterNameSelect");
  const inp = document.getElementById("chapterName");
  if (!sel || !inp) return;
  if (sel.value === "__custom__") {
    inp.style.display = "block";
    inp.value = "";
    inp.focus();
  } else {
    inp.style.display = "none";
  }
}

// ── RENDER ALL ──
function renderAll() {
  renderTodayRevisions();
  renderDoneRevisions();
  renderCalendar();
  renderSubjectGrid();
  logTodayActivity();
  renderWeekly();
  updateGreeting();
  updateStreak();
  updateCoinsUI();
  if (document.getElementById("tab-progress").classList.contains("active")) {
    renderProgress();
  }
  if (document.getElementById("tab-coach").classList.contains("active")) {
    renderCoachTab();
  }
}

// ── SHARED PACE STATE — single source of truth for Progress and Coach ──
function _computePaceState() {
  if (!profile || !profile.examDate) return null;
  const today = todayStr();
  const syllabusChaps = chapters.filter((c) => !c.isCustom);
  const total = _syllabusGrandTotal() || syllabusChaps.length;
  if (total === 0) return null;
  const completed = syllabusChaps.filter(
    (c) => c.status === "Completed",
  ).length;
  const remaining = total - completed;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const examDate = profile.examDate;
  const daysToExam = Math.max(
    0,
    Math.round((dateKeyToUTC(examDate) - dateKeyToUTC(today)) / 86400000),
  );
  const safeFinishDate =
    profile && profile.deadline ? profile.deadline : addDays(examDate, -15);
  const safeDaysLeft = Math.max(
    0,
    Math.round((dateKeyToUTC(safeFinishDate) - dateKeyToUTC(today)) / 86400000),
  );
  const inSilentZone = daysToExam <= 5;
  const inRevisionWindow = safeDaysLeft === 0 && !inSilentZone;
  const isEmergency = inRevisionWindow && completionPct < 50 && remaining > 0;
  const nearZoneDrop =
    !inRevisionWindow && safeDaysLeft <= 20 && safeDaysLeft > 15;
  const activeDays = new Set(
    revisions
      .filter((r) => r.done && r.completedOn && r.dayOffset === 1)
      .map((r) => r.completedOn),
  );
  const fallbackDays = new Set(
    syllabusChaps
      .filter((c) => c.status === "Completed" && c.dateAdded)
      .map((c) => c.dateAdded),
  );
  const studyDaysCount =
    activeDays.size > 0 ? activeDays.size : fallbackDays.size;
  const rawPace = studyDaysCount > 0 ? completed / studyDaysCount : 0;
  // Elapsed days since profile was created — penalises idle time correctly
  const daysSinceStart = profile.dateCreated
    ? Math.max(
        1,
        Math.round(
          (dateKeyToUTC(today) - dateKeyToUTC(profile.dateCreated)) / 86400000,
        ),
      )
    : null;
  // Cap: bulk-entry (>5 chapters, 1 day) OR single-session inflation vs actual elapsed time
  const currentPace =
    activeDays.size === 0 && fallbackDays.size === 1 && completed > 5
      ? completed / 30
      : daysSinceStart && rawPace > completed / daysSinceStart
        ? completed / daysSinceStart
        : rawPace;
  let last7completed = 0,
    prev7completed = 0;
  for (let d = 0; d < 7; d++)
    last7completed += syllabusChaps.filter(
      (c) =>
        c.status === "Completed" &&
        (c.completedDate || c.dateAdded) === addDays(today, -d),
    ).length;
  for (let d = 7; d < 14; d++)
    prev7completed += syllabusChaps.filter(
      (c) =>
        c.status === "Completed" &&
        (c.completedDate || c.dateAdded) === addDays(today, -d),
    ).length;
  const last7studyDays = new Set(
    syllabusChaps
      .filter(
        (c) =>
          c.status === "Completed" &&
          (c.completedDate || c.dateAdded) &&
          dateKeyToUTC(c.completedDate || c.dateAdded) >=
            dateKeyToUTC(addDays(today, -6)),
      )
      .map((c) => c.completedDate || c.dateAdded),
  ).size;
  const prev7studyDays = new Set(
    syllabusChaps
      .filter(
        (c) =>
          c.status === "Completed" &&
          (c.completedDate || c.dateAdded) &&
          dateKeyToUTC(c.completedDate || c.dateAdded) >=
            dateKeyToUTC(addDays(today, -13)) &&
          dateKeyToUTC(c.completedDate || c.dateAdded) <
            dateKeyToUTC(addDays(today, -6)),
      )
      .map((c) => c.completedDate || c.dateAdded),
  ).size;
  const last7pace = last7studyDays > 0 ? last7completed / last7studyDays : 0;
  const prev7pace = prev7studyDays > 0 ? prev7completed / prev7studyDays : 0;
  const paceImproving = last7pace > prev7pace + 0.3 && last7completed >= 2;
  const paceSlipping = prev7pace > last7pace + 0.3 && prev7completed >= 2;
  const paceRecovering =
    paceImproving &&
    prev7completed === 0 &&
    last7completed >= 2 &&
    studyDaysCount > 1;
  const effectivePace =
    paceImproving && last7pace > currentPace
      ? last7pace
      : paceSlipping && last7pace < currentPace
        ? last7pace
        : currentPace;
  const paceNeededForSafe = safeDaysLeft > 0 ? remaining / safeDaysLeft : null;
  const onTrackForSafe =
    paceNeededForSafe !== null && effectivePace >= paceNeededForSafe * 0.9;
  const projectedFinish =
    effectivePace > 0 && remaining > 0
      ? addDays(today, Math.ceil(remaining / effectivePace))
      : remaining === 0
        ? today
        : null;
  const projBeforeSafe = onTrackForSafe ?? null;
  return {
    today,
    completed,
    total,
    remaining,
    completionPct,
    examDate,
    daysToExam,
    safeFinishDate,
    safeDaysLeft,
    inSilentZone,
    inRevisionWindow,
    isEmergency,
    nearZoneDrop,
    currentPace,
    effectivePace,
    last7pace,
    prev7pace,
    last7completed,
    prev7completed,
    paceImproving,
    paceSlipping,
    paceRecovering,
    paceNeededForSafe,
    onTrackForSafe,
    projectedFinish,
    projBeforeSafe,
    studyDaysCount,
  };
}

// ── PROGRESS TAB ──
function renderProgress() {
  _renderDeadlineBanner();
  renderReadiness();
  renderPace();
  renderSyllabusMap();
  renderSubjectHealth();
  renderRevisionCoverage();
  renderIntelligenceReport();
}
// ── COACH TAB ──
function renderCoachTab() {
  const block = document.getElementById("coach-voice-block");
  if (!block) return;

  // ── Snapshot key — only re-render when something meaningful changed ──
  const today = todayStr();
  const syllabusChaps = chapters.filter((c) => !c.isCustom);
  const completed = syllabusChaps.filter(
    (c) => c.status === "Completed",
  ).length;
  const totalRevDone = revisions.filter((r) => r.done).length;
  const _snapActiveDays = new Set(
    revisions
      .filter((r) => r.done && r.completedOn && r.dayOffset === 1)
      .map((r) => r.completedOn),
  ).size;
  const _snapWeakCount = chapters.filter((c) => c.isWeak).length;
  const _snapMissedPerm = revisions.filter((r) => r.missedPermanently).length;
  const snap = [
    today,
    completed,
    totalRevDone,
    _snapActiveDays,
    profile ? profile.deadline : "",
    profile ? profile.examDate : "",
    profile ? profile.name : "",
    profile ? profile.stream : "",
    profile ? profile.lang2 : "",
    profile ? profile.elective : "",
    streak ? streak.count : 0,
    coins,
    _snapWeakCount,
    _snapMissedPerm,
    profile ? (profile.setupSeen ? "1" : "0") : "0",
  ].join("|");
  if (block.dataset.snap === snap) return;
  block.dataset.snap = snap;

  // ── All data ──
  const name = profile ? (profile.name || "").split(" ")[0] : "";
  const total = _syllabusGrandTotal() || syllabusChaps.length;
  const remaining = total - completed;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const examDate = profile ? profile.examDate : null;
  const hasDeadline = !!(profile && profile.deadline);
  const streakCount = streak ? streak.count : 0;

  // ── Timeline ──
  const daysToExam = examDate
    ? Math.max(
        0,
        Math.round((dateKeyToUTC(examDate) - dateKeyToUTC(today)) / 86400000),
      )
    : null;
  const safeFinishDate = examDate
    ? profile && profile.deadline
      ? profile.deadline
      : addDays(examDate, -15)
    : null;
  const safeDaysLeft = safeFinishDate
    ? Math.max(
        0,
        Math.round(
          (dateKeyToUTC(safeFinishDate) - dateKeyToUTC(today)) / 86400000,
        ),
      )
    : null;
  const inSilentZone = daysToExam !== null && daysToExam <= 5;
  const inRevisionWindow =
    safeDaysLeft !== null && safeDaysLeft === 0 && !inSilentZone;

  // ── Pace ──
  const activeDays = new Set(
    revisions
      .filter((r) => r.done && r.completedOn && r.dayOffset === 1)
      .map((r) => r.completedOn),
  );
  const fallbackDays = new Set(
    syllabusChaps
      .filter((c) => c.status === "Completed" && c.dateAdded)
      .map((c) => c.dateAdded),
  );
  const studyDaysCount =
    activeDays.size > 0 ? activeDays.size : fallbackDays.size;
  const rawPace = studyDaysCount > 0 ? completed / studyDaysCount : 0;
  const daysSinceStart =
    profile && profile.dateCreated
      ? Math.max(
          1,
          Math.round(
            (dateKeyToUTC(today) - dateKeyToUTC(profile.dateCreated)) /
              86400000,
          ),
        )
      : null;
  const currentPace =
    activeDays.size === 0 && fallbackDays.size === 1 && completed > 5
      ? completed / 30
      : daysSinceStart && rawPace > completed / daysSinceStart
        ? completed / daysSinceStart
        : rawPace;

  // ── Trend: last 7 days vs previous 7 days ──
  let last7completed = 0,
    prev7completed = 0;
  for (let d = 0; d < 7; d++) {
    last7completed += syllabusChaps.filter(
      (c) =>
        c.status === "Completed" &&
        (c.completedDate || c.dateAdded) === addDays(today, -d),
    ).length;
  }
  for (let d = 7; d < 14; d++) {
    prev7completed += syllabusChaps.filter(
      (c) =>
        c.status === "Completed" &&
        (c.completedDate || c.dateAdded) === addDays(today, -d),
    ).length;
  }
  // Divide by actual study days in each window, not calendar days
  // e.g. 4 chapters on 4 days = 1.0/day, not 4/7 = 0.57
  const last7studyDays = new Set(
    syllabusChaps
      .filter(
        (c) =>
          c.status === "Completed" &&
          (c.completedDate || c.dateAdded) &&
          dateKeyToUTC(c.completedDate || c.dateAdded) >=
            dateKeyToUTC(addDays(today, -6)),
      )
      .map((c) => c.completedDate || c.dateAdded),
  ).size;
  const prev7studyDays = new Set(
    syllabusChaps
      .filter(
        (c) =>
          c.status === "Completed" &&
          (c.completedDate || c.dateAdded) &&
          dateKeyToUTC(c.completedDate || c.dateAdded) >=
            dateKeyToUTC(addDays(today, -13)) &&
          dateKeyToUTC(c.completedDate || c.dateAdded) <
            dateKeyToUTC(addDays(today, -6)),
      )
      .map((c) => c.completedDate || c.dateAdded),
  ).size;
  const last7pace = last7studyDays > 0 ? last7completed / last7studyDays : 0;
  const prev7pace = prev7studyDays > 0 ? prev7completed / prev7studyDays : 0;
  const paceImproving = last7pace > prev7pace + 0.3 && last7completed >= 2;
  const paceSlipping = prev7pace > last7pace + 0.3 && prev7completed >= 2;
  const paceRecovering =
    paceImproving &&
    prev7completed === 0 &&
    last7completed >= 2 &&
    studyDaysCount > 1;

  // ── Use recent pace only if it's actually higher than all-time pace ──
  // Prevents a good recent week from replacing a better all-time average
  const effectivePace =
    paceImproving && last7pace > currentPace
      ? last7pace
      : paceSlipping && last7pace < currentPace
        ? last7pace
        : currentPace;

  const projectedFinish =
    effectivePace > 0 && remaining > 0
      ? addDays(today, Math.ceil(remaining / effectivePace))
      : remaining === 0
        ? today
        : null;
  const paceNeededForSafe = safeDaysLeft > 0 ? remaining / safeDaysLeft : null;
  const onTrackForSafe =
    paceNeededForSafe !== null && effectivePace >= paceNeededForSafe * 0.9;
  const projBeforeSafe = onTrackForSafe ?? null;

  // ── Emergency mode ──
  const isEmergency = inRevisionWindow && completionPct < 50 && remaining > 0;
  const paceNeededForExam = daysToExam > 0 ? remaining / daysToExam : null;

  // ── Zone boundary warning ──
  const nearZoneDrop =
    !inRevisionWindow &&
    safeDaysLeft !== null &&
    safeDaysLeft <= 20 &&
    safeDaysLeft > 15;

  // ── Zone ──
  const zone = !examDate
    ? 0
    : inSilentZone
      ? 4
      : isEmergency
        ? 5
        : inRevisionWindow
          ? 3
          : safeDaysLeft > 45
            ? 1
            : safeDaysLeft > 15
              ? 2
              : 3;

  // ── Chapters at risk of losing R4 ──
  // Use actual R4 dueDate from revisions array — dateAdded is restored to original add date
  // and is always earlier than the real completion date, causing systematic underreporting
  const chapsLosingR4 = examDate
    ? syllabusChaps.filter((c) => {
        if (c.status !== "Completed") return false;
        const r4 = revisions.find(
          (r) => r.chapterId === c.id && r.dayOffset === 30,
        );
        if (r4) return dateKeyToUTC(examDate) < dateKeyToUTC(r4.dueDate);
        // Fallback for chapters without R4 scheduled: use dateAdded + 30
        return (
          c.dateAdded &&
          Math.round(
            (dateKeyToUTC(examDate) - dateKeyToUTC(addDays(c.dateAdded, 30))) /
              86400000,
          ) < 0
        );
      }).length
    : 0;

  // ── Weak chapters ──
  const weakCount = chapters.filter((c) => c.isWeak).length;
  const autoWeakCount = chapters.filter(
    (c) => c.isWeak && c._autoFlagged,
  ).length;
  const missedPermCount = revisions.filter((r) => r.missedPermanently).length;

  // ── Today's revisions ──
  const todayRevsDue = revisions.filter(
    (r) => r.dueDate === today && !r.done && !r.missedPermanently,
  ).length;

  // ── Weekly activity ──
  let studiedDaysThisWeek = 0;
  for (let d = 0; d < 7; d++) {
    const ds = addDays(today, -d);
    if (weeklyLog[ds] > 0) studiedDaysThisWeek++;
  }

  // ── Neglected subject ──
  const subjectMap = {};
  syllabusChaps.forEach((c) => {
    if (!subjectMap[c.subject]) subjectMap[c.subject] = [];
    subjectMap[c.subject].push(c);
  });
  // Build full subject list from syllabus so untouched subjects are visible to Coach
  const _cToLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  const _cStream = profile ? profile.stream || "science" : "science";
  if (_cStream === "science") _cToLoad.push("physics", "chemistry", "biology");
  else _cToLoad.push("commerce", "economics_g2");
  _cToLoad.push(
    profile ? profile.lang2 || "hindi" : "hindi",
    profile ? profile.elective || "computer" : "computer",
  );
  const _cMerge = { History: "History & Civics", Civics: "History & Civics" };
  const _cSeen = new Set();
  const _allSubjects = [];
  if (window._syllabus) {
    Object.values(window._syllabus.groups).forEach((group) => {
      Object.entries(group.subjects).forEach(([key, subj]) => {
        if (!_cToLoad.includes(key) || subj.chapters.length === 0) return;
        const dn = _cMerge[subj.name] || subj.name;
        if (!_cSeen.has(dn)) {
          _cSeen.add(dn);
          _allSubjects.push(dn);
        }
      });
    });
  } else {
    Object.keys(subjectMap).forEach((s) => _allSubjects.push(s));
  }

  // ── Group context ──
  const inGroup = !!groupCode;

  // ── Suggested deadline (personalised) ──
  // ── Suggested deadline — dynamic, recalculates every render until student sets their own ──
  // Projects actual finish at current pace + 5-day buffer, clamped to exam-60…exam-10.
  // No pace yet (just started) → exam-35 fallback (preserves full revision cycle).
  const suggestedDeadline = (() => {
    if (!examDate) return null;
    if (daysToExam < 15) return null;
    // No suggestion once inside revision window — deadline concept is meaningless
    if (inRevisionWindow) return null;
    // No pace data yet — can't personalize, show nothing
    if (effectivePace <= 0 || remaining === 0) return null;
    const _sdMin = addDays(examDate, -60);
    const _sdMax = addDays(examDate, -10);
    const daysToFinish = Math.ceil(remaining / effectivePace);
    // Personalized buffer: slipping students get more slack, improving students less
    const _buffer = paceSlipping ? 10 : paceImproving ? 3 : 5;
    const suggested = addDays(today, daysToFinish + _buffer);
    // If projection overshoots _sdMax the student can't hit any valid deadline — don't suggest
    if (dateKeyToUTC(suggested) > dateKeyToUTC(_sdMax)) return null;
    if (dateKeyToUTC(suggested) < dateKeyToUTC(_sdMin)) return _sdMin;
    return suggested;
  })();

  // ── Pick helper ──
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ── Day-of-week & streak tier ──
  const dow = new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
  const isMon = dow === 1,
    isFri = dow === 5,
    isSat = dow === 6,
    isSun = dow === 0;
  const isWeekend = isSat || isSun;
  // Streak tiers: 0=day1/none, 1=days2-6, 2=days7-20, 3=day21+
  const streakTier =
    streakCount >= 21 ? 3 : streakCount >= 7 ? 2 : streakCount >= 2 ? 1 : 0;

  // ════════════════════════════════════════
  // BUILD VOICE — paragraphs + crisp lines
  // ════════════════════════════════════════
  const paras = [];

  // ── POST-EXAM: exam date has passed ──
  if (daysToExam !== null && daysToExam <= 0) {
    const rawDiff = examDate
      ? Math.round(
          (dateKeyToUTC(todayStr()) - dateKeyToUTC(examDate)) / 86400000,
        )
      : 0;
    paras.push(
      `Your exam ${rawDiff === 0 ? "is today" : `was ${rawDiff} day${rawDiff !== 1 ? "s" : ""} ago`}. Hope it went well — you put in the work.`,
    );
    block.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(194,118,42,0.07),rgba(168,94,26,0.03));border:1px solid rgba(194,118,42,0.18);border-top:3px solid var(--indigo2);border-radius:16px;padding:20px 18px;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(194,118,42,0.12)">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--indigo2),var(--kumkum));display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;box-shadow:0 0 12px rgba(194,118,42,0.3)">🎓</div>
          <div>
            <div style="font-size:0.78rem;font-weight:700;color:var(--indigo);font-family:${_PC.font};letter-spacing:0.04em">COACH</div>
            <div style="font-size:0.72rem;color:var(--text2);font-family:${_PC.font}">${name ? name + "'s" : "Your"} personalised assessment</div>
          </div>
        </div>
        ${paras.map((p) => `<p style="font-size:1.02rem;color:${_PC.text};line-height:1.85;font-family:${_PC.font};font-style:italic;margin:0">${p}</p>`).join("")}
      </div>`;
    return;
  }

  // ── SILENT ZONE: last 5 days ──
  if (inSilentZone) {
    const lines =
      remaining > 0
        ? [
            `${name ? name + ", " : ""}${daysToExam} day${daysToExam !== 1 ? "s" : ""} left and ${remaining} chapter${remaining !== 1 ? "s" : ""} still to go. Don't stop — finish what you can and revise everything you've done. Every completed chapter still earns at least one revision before exam day.`,
            `${name ? name + " — " : ""}${daysToExam} day${daysToExam !== 1 ? "s" : ""} to exam. You have ${remaining} chapter${remaining !== 1 ? "s" : ""} remaining. Keep going — complete what's reachable, revise what's done. That's the best use of every hour left.`,
            `${name ? name + ", " : ""}${remaining} chapter${remaining !== 1 ? "s" : ""} unfinished with ${daysToExam} day${daysToExam !== 1 ? "s" : ""} to go. Work through as many as you can — and revise everything you've already completed in parallel.`,
          ]
        : [
            `${name ? name + ", " : ""}exam in ${daysToExam} day${daysToExam !== 1 ? "s" : ""}. Syllabus is done — trust the work you've put in. Revise steadily and show up sharp.`,
            `${daysToExam} day${daysToExam !== 1 ? "s" : ""} left, ${name || ""}. You've covered the syllabus. Now it's about recall and sharpness — revise, rest, and go in clear.`,
            `${name ? name + " — " : ""}this is it. ${daysToExam} day${daysToExam !== 1 ? "s" : ""} left. The preparation is done. Rest well, eat well, show up sharp.`,
            `${name ? name + ", " : ""}${daysToExam} day${daysToExam !== 1 ? "s" : ""} to go. Syllabus complete. Only what you know now — sharper, tighter, ready.`,
            `${name ? name + " — " : ""}final stretch. ${daysToExam} day${daysToExam !== 1 ? "s" : ""} left. Sleep matters as much as revision now. Don't grind yourself hollow.`,
          ];
    paras.push(pick(lines));
    block.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(194,118,42,0.07),rgba(168,94,26,0.03));border:1px solid rgba(194,118,42,0.18);border-top:3px solid var(--indigo2);border-radius:16px;padding:20px 18px;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(194,118,42,0.12)">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--indigo2),var(--kumkum));display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;box-shadow:0 0 12px rgba(194,118,42,0.3)">🎓</div>
          <div>
            <div style="font-size:0.78rem;font-weight:700;color:var(--indigo);font-family:${_PC.font};letter-spacing:0.04em">COACH</div>
            <div style="font-size:0.72rem;color:var(--text2);font-family:${_PC.font}">${name ? name + "'s" : "Your"} personalised assessment</div>
          </div>
        </div>
        ${paras.map((p) => `<p style="font-size:1.02rem;color:${_PC.text};line-height:1.85;font-family:${_PC.font};font-style:italic;margin:0">${p}</p>`).join("")}
      </div>`;
    return;
  }

  // ── SETUP GUIDE — shown to any user who hasn't completed setup (exam date + deadline) ──
  // setupSeen flag is set the moment both dates are saved. Once set, never shows again.
  // Old users with both dates already set get setupSeen backfilled in initApp on first open.
  {
    const _noExam = !examDate;
    const _noDeadlineCounts =
      !hasDeadline && (daysToExam === null || daysToExam >= 15);
    const _showSetup =
      _noExam || _noDeadlineCounts || !(profile && profile.setupSeen);
    const _isLateJoin =
      !_noExam && daysToExam !== null && daysToExam <= 14 && daysToExam > 5;
    const _noDeadline = !hasDeadline;
    const F = _PC.font;
    if (_showSetup) {
      const _step1Html = _noExam
        ? `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${_PC.indigo};border-radius:10px;padding:11px 14px">
          <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;color:${_PC.indigo};font-family:${F};margin-bottom:5px">STEP 1 — SET YOUR EXAM DATE ← START HERE</div>
          <div style="font-size:0.82rem;color:${_PC.text};font-family:${F};line-height:1.6">Open the menu (top left) → Profile → set your <strong style="color:${_PC.text}">Exam Date</strong>. Every single number in this app — pace, urgency, revision schedule — anchors to this date. Without it I'm completely blind.</div>
        </div>`
        : `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${_PC.green};border-radius:10px;padding:11px 14px">
          <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;color:${_PC.green};font-family:${F};margin-bottom:5px">STEP 1 — EXAM DATE ✓</div>
          <div style="font-size:0.82rem;color:${_PC.text2};font-family:${F};line-height:1.6">Set. Everything anchors to ${fmtDate(examDate)}.</div>
        </div>`;

      const _step2Html = _noDeadline
        ? `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${_noExam ? _PC.text3 : _PC.indigo};border-radius:10px;padding:11px 14px">
          <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;color:${_noExam ? _PC.text3 : _PC.indigo};font-family:${F};margin-bottom:5px">STEP 2 — SET YOUR STUDY DEADLINE${_noExam ? "" : " ← DO THIS NOW"}</div>
          <div style="font-size:0.82rem;color:${_noExam ? _PC.text3 : _PC.text};font-family:${F};line-height:1.6">${_noExam ? "Set your exam date first, then come back to this step." : 'Go to the <strong style="color:' + _PC.text + '">Progress tab</strong> → Set Your Study Deadline. This is the date you want to finish all chapters by — <strong style="color:' + _PC.text + '">not your exam date</strong>. I use this for all pace calculations and urgency signals.'}</div>
        </div>`
        : `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${_PC.green};border-radius:10px;padding:11px 14px">
          <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;color:${_PC.green};font-family:${F};margin-bottom:5px">STEP 2 — STUDY DEADLINE ✓</div>
          <div style="font-size:0.82rem;color:${_PC.text2};font-family:${F};line-height:1.6">Set. I'm using ${fmtDate(profile.deadline)} for all pace calculations.</div>
        </div>`;

      const _step3Msg = _isLateJoin
        ? `Go to the <strong style="color:${_PC.text}">Add tab</strong>. Only add chapters you have <strong style="color:${_PC.text}">already studied</strong> — mark them Completed. Do not add chapters you haven't covered yet. I will schedule revisions from tomorrow. Focus on your highest-weightage subjects first.`
        : `Go to the <strong style="color:${_PC.text}">Add tab</strong>. Add your syllabus chapters and mark the ones you've already covered as <strong style="color:${_PC.text}">Completed</strong>. The moment you do, I schedule 4 revision sessions automatically: next day (R1), 3 days later (R2), 1 week later (R3), 1 month later (R4). That's how memory gets locked in before exam day.`;

      const _step3Html = `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${!_noExam && !_noDeadline ? _PC.indigo : _PC.text3};border-radius:10px;padding:11px 14px">
        <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;color:${!_noExam && !_noDeadline ? _PC.indigo : _PC.text3};font-family:${F};margin-bottom:5px">STEP 3 — ADD YOUR CHAPTERS${!_noExam && !_noDeadline ? " ← DO THIS NOW" : ""}</div>
        <div style="font-size:0.82rem;color:${!_noExam && !_noDeadline ? _PC.text : _PC.text3};font-family:${F};line-height:1.6">${!_noExam && !_noDeadline ? _step3Msg : "Complete steps 1 and 2 first."}</div>
      </div>`;

      const _howHtml = `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:10px;padding:11px 14px;margin-bottom:12px">
        <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.1em;color:${_PC.text2};font-family:${F};margin-bottom:6px">HOW THIS APP WORKS</div>
        <div style="font-size:0.88rem;color:${_PC.text2};font-family:${F};line-height:1.7">You add chapters and mark them done. I build a <strong style="color:${_PC.text}">spaced revision schedule</strong> automatically — R1 next day, R2 after 3 days, R3 after 1 week, R4 after 1 month. This is how memory actually sticks for exams. I also track your <strong style="color:${_PC.text}">daily pace</strong>, tell you if you're on track to finish before your deadline, flag subjects you're neglecting, and warn you when revisions are piling up.</div>
      </div>`;

      const _btnReady = !_noExam && !_noDeadlineCounts;
      const _dismissHtml = `<div style="text-align:center;padding-top:4px">
        <button
          onclick="${_btnReady ? "_setupDismiss()" : "_setupNotReady()"}"
          style="background:${_PC.indigo};border:none;border-radius:10px;padding:11px 28px;font-size:0.85rem;font-weight:800;color:#fff;cursor:${_btnReady ? "pointer" : "not-allowed"};font-family:${F};letter-spacing:0.03em;box-shadow:0 4px 16px rgba(194,118,42,0.35);opacity:${_btnReady ? "1" : "0.4"}">
          I've set it up — show my assessment
        </button>
      </div>`;

      block.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(194,118,42,0.07),rgba(168,94,26,0.03));border:1px solid rgba(194,118,42,0.18);border-top:3px solid var(--indigo2);border-radius:16px;padding:20px 18px;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(194,118,42,0.12)">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--indigo2),var(--kumkum));display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;box-shadow:0 0 12px rgba(194,118,42,0.3)">🎓</div>
          <div>
            <div style="font-size:0.78rem;font-weight:700;color:var(--indigo);font-family:${F};letter-spacing:0.04em">COACH</div>
            <div style="font-size:0.72rem;color:${_PC.text2};font-family:${F}">${name ? name + "'s" : "Your"} personalised assessment</div>
          </div>
        </div>
        <p style="font-size:1.02rem;color:${_PC.text};line-height:1.85;font-family:${F};margin:0 0 18px 0">I'm your personal coach${name ? ", " + name : ""}. This app works entirely on the data you give it — the more accurately you set it up, the more useful I become. Let's do this right.</p>
        ${_howHtml}
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
          ${_step1Html}
          ${_step2Html}
          ${_step3Html}
        </div>
        ${_dismissHtml}
      </div>`;
      return;
    }
  }

  // ── EMERGENCY MODE ──
  if (isEmergency) {
    const dailyNeeded = paceNeededForExam ? paceNeededForExam.toFixed(1) : "?";
    const ep = [];
    ep.push(
      `${name ? name + ", " : ""}I'm not going to soften this. You have ${daysToExam} days and ${remaining} chapters left — ${completionPct}% done. That's ${dailyNeeded} chapters every single day until ${fmtDate(examDate)} with no breaks.`,
    );
    ep.push(
      `The revision window has closed, which means R3 and R4 are off the table for most chapters. The new goal is: complete each chapter, do R1 the next day, do R2 three days later. That's enough to hold memory through exam day. Speed matters more than depth right now.`,
    );
    ep.push(
      `Don't start from the top of your chapter list. Start with your highest-weightage subjects — the ones that decide your aggregate. Every hour on a low-weight chapter is an hour taken from one that matters more.`,
    );
    if (weakCount > 0)
      ep.push(
        `You have ${weakCount} flagged weak chapter${weakCount !== 1 ? "s" : ""} — deprioritise those unless they're high-weightage. You can't afford perfectionism right now.`,
      );
    ep.push(
      pick([
        `Hard and impossible aren't the same thing. Start with one chapter today — right now.`,
        `You still have time to make this count. But only if you start today, not tomorrow.`,
        `${daysToExam} days is more than most people think it is. Use every one of them.`,
        `The clock is real but so is your capacity. One chapter at a time — that's all it takes.`,
        `Don't let the size of the problem stop you from solving the first piece of it. Open a chapter now.`,
        `Exams have been passed from worse positions. Decide right now that you're not stopping until this is done.`,
      ]),
    );
    const emergBody = ep
      .map((p, i) => {
        const mb = i < ep.length - 1 ? "16px" : "0";
        const isCloser = i === ep.length - 1;
        return `<p style="font-size:${isCloser ? "0.95rem" : "1.02rem"};color:${isCloser ? _PC.text2 : _PC.text};line-height:1.85;font-family:${_PC.font};margin:0 0 ${mb} 0">${p}</p>`;
      })
      .join("");
    block.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(194,118,42,0.07),rgba(168,94,26,0.03));border:1px solid rgba(194,118,42,0.18);border-top:3px solid ${_PC.red};border-radius:16px;padding:20px 18px;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(194,118,42,0.12)">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,${_PC.red},${_PC.orange});display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;box-shadow:0 0 12px rgba(248,113,113,0.3)">🚨</div>
          <div>
            <div style="font-size:0.78rem;font-weight:700;color:${_PC.red};font-family:${_PC.font};letter-spacing:0.04em">EMERGENCY MODE</div>
            <div style="font-size:0.72rem;color:${_PC.text2};font-family:${_PC.font}">${name ? name + "'s" : "Your"} personalised assessment</div>
          </div>
        </div>
        ${emergBody}
      </div>`;
    return;
  }

  // ── PARA 1: Situation + honest assessment ──
  {
    const p = [];

    // Opening — trend-aware, day-of-week aware, streak-tier aware
    if (paceImproving && !paceRecovering) {
      p.push(
        onTrackForSafe
          ? pick([
              `${name ? name + ", " : ""}something shifted this week — let's talk about it.`,
              `${name ? name + " — " : ""}the numbers look different this week. Here's where things stand.`,
              `${name ? name + ", " : ""}the trend is moving your way. Let's make sure it holds.`,
              `${name ? name + " — " : ""}good week so far. Here's the full picture.`,
              `${name ? name + ", " : ""}you're picking up pace — worth understanding why before the momentum dips.`,
            ])
          : pick([
              `${name ? name + ", " : ""}pace has picked up this week — that matters. Here's where things still stand.`,
              `${name ? name + " — " : ""}the trend is moving in the right direction. But the full picture needs attention.`,
              `${name ? name + ", " : ""}you're improving. Let's be clear about how much ground there is left to cover.`,
            ]),
      );
    } else if (paceSlipping) {
      p.push(
        pick([
          `${name ? name + ", " : ""}I need to flag something before it becomes a problem.`,
          `${name ? name + " — " : ""}the trend this week needs attention.`,
          `${name ? name + ", " : ""}the numbers are drifting in the wrong direction. Let's address it.`,
          `${name ? name + " — " : ""}pace has slipped. That's fixable, but only if we talk about it now.`,
          `${name ? name + ", " : ""}something's off this week and I'd rather you hear it from me than discover it too late.`,
        ]),
      );
    } else if (zone === 1) {
      p.push(
        pick([
          `${name ? name + ", " : ""}here's where things stand.`,
          `Let's take stock, ${name || "friend"}.`,
          `${name ? name + " — " : ""}good time to check in.`,
          isMon
            ? `${name ? name + ", " : ""}fresh week. Here's the picture.`
            : isFri
              ? `${name ? name + ", " : ""}end of the week — let's see how it went.`
              : isWeekend
                ? `${name ? name + ", " : ""}weekend check-in. Here's where you are.`
                : `${name ? name + ", " : ""}midweek — good moment to take stock.`,
          streakTier >= 2
            ? `${name ? name + ", " : ""}${streakCount} days in a row and counting. Here's the full picture.`
            : streakTier === 1
              ? `${name ? name + ", " : ""}you've got a small streak going. Let's see what to do with it.`
              : `${name ? name + ", " : ""}every day is a fresh start. Here's today's picture.`,
          `${name ? name + " — " : ""}no drama. Let's just see where things are.`,
        ]),
      );
    } else if (zone === 2) {
      p.push(
        pick([
          `${name ? name + ", " : ""}I need your attention on something.`,
          `${name || ""}, the window is getting smaller.`,
          `Time to be real, ${name || "friend"}.`,
          `${name ? name + ", " : ""}the margin for comfort is narrowing. Here's where you stand.`,
          isMon
            ? `${name ? name + ", " : ""}new week, but the clock doesn't reset. Let's talk.`
            : isFri
              ? `${name ? name + ", " : ""}week's almost done — let's be honest about how it went.`
              : `${name ? name + " — " : ""}this is the part of prep where honesty matters most.`,
          `${name ? name + ", " : ""}the situation has shifted. You need to hear this.`,
        ]),
      );
    } else if (zone === 3) {
      p.push(
        pick([
          `${name ? name + ", " : ""}I'm going to be straight with you.`,
          `Okay ${name || ""}, the situation is what it is. Let's make the most of it.`,
          `${name ? name + " — " : ""}no sugarcoating today.`,
          `${name ? name + ", " : ""}we're past the point of comfortable pacing. Here's what's real.`,
          `${name ? name + " — " : ""}I won't soften this, but I won't catastrophise either. Facts only.`,
          `${name ? name + ", " : ""}late is not the same as too late. Let's work out what's actually possible.`,
        ]),
      );
    }

    // Situation — structural variety: lead with days, pct, remaining, or equation framing
    if (remaining === 0) {
      p.push(
        pick([
          `You've finished all ${total} chapters. Everything now rides on your revisions.`,
          `All ${total} chapters done — the studying is over. It's revision season.`,
          `${completionPct}% complete — that means 100%. Every chapter covered. Now it's all revision.`,
          `${total} chapters, all ticked off. What's left is locking in what you already know.`,
        ]),
      );
    } else {
      p.push(
        pick([
          `You have ${daysToExam} days until your exam and ${remaining} chapters still to go.`,
          `${remaining} chapters remaining, ${daysToExam} days on the clock.`,
          `You've covered ${completed} of ${total} chapters — ${completionPct}% done, ${remaining} to go.`,
          `${completionPct}% of the syllabus is behind you. ${remaining} chapters and ${daysToExam} days stand between you and exam day.`,
          `${daysToExam} days left. ${remaining} chapters left. That's the equation right now.`,
          `With ${daysToExam} days to the exam, you need to clear ${remaining} more chapter${remaining !== 1 ? "s" : ""} — you're ${completionPct}% of the way there.`,
          `${remaining} chapter${remaining !== 1 ? "s" : ""} to go out of ${total}. The exam is ${daysToExam} day${daysToExam !== 1 ? "s" : ""} away.`,
        ]),
      );
    }

    // Trend signal
    if (paceRecovering) {
      p.push(
        `This week you completed ${last7completed} chapter${last7completed !== 1 ? "s" : ""} after nothing the week before. That's the turnaround. Keep it going.`,
      );
    } else if (paceImproving) {
      p.push(
        `Your pace has picked up — ${last7completed} chapters this week vs ${prev7completed} last week. That shift matters.`,
      );
    } else if (paceSlipping) {
      p.push(
        `Your pace has dropped — ${last7completed} chapter${last7completed !== 1 ? "s" : ""} this week vs ${prev7completed} last week. That trend needs to reverse before it costs you.`,
      );
    }

    // Assessment — now with full date context
    if (remaining === 0 && chapsLosingR4 > 0) {
      p.push(
        `${chapsLosingR4} completed chapter${chapsLosingR4 !== 1 ? "s" : ""} will miss their R4 revision before the exam — but R1, R2, and R3 still count.`,
      );
    } else if (remaining === 0 && missedPermCount > 0) {
      p.push(
        `All ${total} chapters done — but ${missedPermCount} revision${missedPermCount !== 1 ? "s" : ""} permanently missed. The syllabus is covered; the memory isn't. Every missed revision is a chapter that will fade before exam day. Treat each one as a chapter you need to re-read.`,
      );
    } else if (remaining === 0) {
      p.push(
        pick([
          `Your revision chain looks healthy. Keep clearing what's due each day.`,
          `All that's left now is staying on top of your revision schedule.`,
          `Revision mode. Every session from here is memory you're securing for the exam.`,
          `The syllabus is done — your job now is to keep the revision chain clean and unbroken.`,
        ]),
      );
    } else if (inRevisionWindow) {
      p.push(
        remaining > 0
          ? pick([
              `You're in the revision window with ${remaining} chapter${remaining !== 1 ? "s" : ""} still to go. Keep completing — every chapter finished now still gets at least 2 revision sessions before the exam. Prioritise by weightage.`,
              `The safe chapter-completion window has closed, but you still have ${remaining} chapter${remaining !== 1 ? "s" : ""} remaining. Don't stop — finish what you can and revise everything you've done in parallel.`,
              `Inside the revision window with ${remaining} unfinished chapter${remaining !== 1 ? "s" : ""}. The goal now is complete-and-revise simultaneously — highest-weightage subjects first.`,
            ])
          : pick([
              `You're inside the revision window — syllabus is complete. Every revision session from here compounds what you've already built.`,
              `The chapter-completion window has closed and you've covered the full syllabus. Focus on depth — R1 through R4 on everything.`,
              `The window for full revision cycles has passed. Syllabus done — go deep on what you've covered.`,
            ]),
      );
    } else if (projectedFinish && projBeforeSafe) {
      const bufferDays = Math.round(
        (dateKeyToUTC(safeFinishDate) - dateKeyToUTC(projectedFinish)) /
          86400000,
      );
      const _inGrace = bufferDays < 0;
      p.push(
        _inGrace
          ? pick([
              `At your current pace you're finishing around ${fmtDate(projectedFinish)} — just past your safe window of ${fmtDate(safeFinishDate)}, but close enough to recover with a small lift. Exam is ${fmtDate(examDate)}.`,
              `Projected finish: ${fmtDate(projectedFinish)}. That's just after your safe window closes on ${fmtDate(safeFinishDate)}, but your pace is close enough that a slight push gets you there. Exam: ${fmtDate(examDate)}.`,
              `The numbers put your finish at ${fmtDate(projectedFinish)} — a few days past ${fmtDate(safeFinishDate)}, but within striking range. A small daily increase closes it before the exam on ${fmtDate(examDate)}.`,
              `Current pace: finishing around ${fmtDate(projectedFinish)}, just outside the safe window. You're in the zone — a slightly higher daily rate locks it in before ${fmtDate(examDate)}.`,
            ])
          : pick([
              `At your current pace you're finishing around ${fmtDate(projectedFinish)} — ${bufferDays} day${bufferDays !== 1 ? "s" : ""} inside your safe window (${fmtDate(safeFinishDate)}). Exam is ${fmtDate(examDate)}.`,
              `Projected finish: ${fmtDate(projectedFinish)}. Safe window closes ${fmtDate(safeFinishDate)}. Exam: ${fmtDate(examDate)}. You're ${bufferDays} day${bufferDays !== 1 ? "s" : ""} ahead — all 4 revisions on track.`,
              `The numbers say you finish by ${fmtDate(projectedFinish)}, which is ${bufferDays} day${bufferDays !== 1 ? "s" : ""} before your safe deadline of ${fmtDate(safeFinishDate)}. Exam is ${fmtDate(examDate)}. You're on the right side of the line.`,
              `Current pace puts your finish at ${fmtDate(projectedFinish)} — that's ${bufferDays} day${bufferDays !== 1 ? "s" : ""} of buffer before the safe window closes. Exam: ${fmtDate(examDate)}.`,
            ]),
      );
    } else if (
      projectedFinish &&
      !projBeforeSafe &&
      studyDaysCount >= 2 &&
      completed >= 3
    ) {
      const overBy = Math.round(
        (dateKeyToUTC(projectedFinish) - dateKeyToUTC(safeFinishDate)) /
          86400000,
      );
      p.push(
        pick([
          `At this pace you're finishing around ${fmtDate(projectedFinish)} — ${overBy} day${overBy !== 1 ? "s" : ""} after your safe window closes on ${fmtDate(safeFinishDate)}. Exam is ${fmtDate(examDate)}.`,
          `The math puts your finish at ${fmtDate(projectedFinish)}, which is ${overBy} day${overBy !== 1 ? "s" : ""} past the safe window (${fmtDate(safeFinishDate)}). Your exam is ${fmtDate(examDate)}.`,
          `Projected: done by ${fmtDate(projectedFinish)}. Safe deadline: ${fmtDate(safeFinishDate)}. That's ${overBy} day${overBy !== 1 ? "s" : ""} over — and it means some revision cycles get cut short. Exam is ${fmtDate(examDate)}.`,
          `You're tracking to finish ${overBy} day${overBy !== 1 ? "s" : ""} late relative to your safe window (${fmtDate(safeFinishDate)}). Exam: ${fmtDate(examDate)}. Pace needs to lift.`,
        ]),
      );
    } else if (currentPace === 0 && remaining > 0) {
      p.push(
        pick([
          `No completed chapters yet — I can't project a finish date. Let's change that today.`,
          `The first chapter you complete gives me something to work with. Start there.`,
          `Right now the data shows zero completed chapters. One chapter changes everything I can tell you.`,
          `I need at least one completed chapter to give you a real projection. That's your task for today.`,
        ]),
      );
    }

    // Study duration context — only after 14+ days so it's meaningful
    if (
      daysSinceStart !== null &&
      daysSinceStart >= 14 &&
      remaining > 0 &&
      !inRevisionWindow
    ) {
      p.push(
        pick([
          `${daysSinceStart} days into your preparation — ${completed} chapter${completed !== 1 ? "s" : ""} done, ${remaining} to go.`,
          `You're ${daysSinceStart} days in. ${completed} chapter${completed !== 1 ? "s" : ""} complete, ${remaining} remaining.`,
          `${daysSinceStart} days of preparation so far — ${completed} done, ${remaining} still ahead.`,
        ]),
      );
    }

    // Zone boundary warning
    if (nearZoneDrop && remaining > 0) {
      p.push(
        `You're ${safeDaysLeft} days from your study window tightening significantly. This is the time to accelerate, not maintain.`,
      );
    }

    // Deadline woven in naturally
    if (!hasDeadline && suggestedDeadline) {
      p.push(
        pick([
          `You haven't set a study deadline yet. Based on where you are, ${fmtDate(suggestedDeadline)} is the right target — it protects your full revision cycle. Set it in the Progress tab.`,
          `One thing worth doing: set a study deadline. For your exam, finishing by ${fmtDate(suggestedDeadline)} gives you the full revision window. Progress tab, top of the page.`,
          `No study deadline set yet. I'd suggest ${fmtDate(suggestedDeadline)} — that gives you enough time for all four revision cycles before ${fmtDate(examDate)}.`,
          `Worth five seconds of your time: set ${fmtDate(suggestedDeadline)} as your chapter-completion deadline. It protects your revision chain. Progress tab.`,
        ]),
      );
    } else if (hasDeadline && !inRevisionWindow) {
      const dLeft = Math.max(
        0,
        Math.round(
          (dateKeyToUTC(profile.deadline) - dateKeyToUTC(today)) / 86400000,
        ),
      );
      if (dLeft <= 7 && remaining > 0) {
        p.push(
          `Your study deadline is in ${dLeft} day${dLeft !== 1 ? "s" : ""} — that's very close. ${remaining} chapters still to go.`,
        );
      }
    }

    paras.push(p.join(" "));
  }

  // ── PARA 2: What needs attention today ──
  {
    const p = [];

    if (todayRevsDue > 0) {
      p.push(
        pick([
          `${todayRevsDue} revision${todayRevsDue !== 1 ? "s" : ""} due today — clear those before anything else.`,
          `${todayRevsDue} revision${todayRevsDue !== 1 ? "s" : ""} waiting right now. Get those done first.`,
          `Start with your ${todayRevsDue} due revision${todayRevsDue !== 1 ? "s" : ""} — they take priority over new chapters.`,
          `Today has ${todayRevsDue} revision${todayRevsDue !== 1 ? "s" : ""} on the schedule. That's your first job.`,
          `${todayRevsDue} revision${todayRevsDue !== 1 ? "s" : ""} sitting in the queue — knock those out before you open anything new.`,
        ]),
      );
    }

    {
      // Build full per-subject slipping/neglected list — same thresholds as Intelligence
      const _subjActivityList = _allSubjects
        .map((subj) => {
          const chs = subjectMap[subj] || [];
          // Untouched subject — no chapters added at all
          if (chs.length === 0) {
            const _profileAge =
              profile && profile.dateCreated
                ? Math.round(
                    (dateKeyToUTC(today) - dateKeyToUTC(profile.dateCreated)) /
                      86400000,
                  )
                : 0;
            if (_profileAge < 7) return null; // too early to flag
            return {
              subj,
              daysSince: _profileAge,
              subjImproving: false,
              isUntouched: true,
            };
          }
          const revDates = revisions
            .filter(
              (r) =>
                r.done &&
                r.completedOn &&
                chs.find((c) => c.id === r.chapterId),
            )
            .map((r) => r.completedOn)
            .sort()
            .reverse();
          const addedDates = chs
            .map((c) => c.completedDate || c.dateAdded)
            .filter(Boolean)
            .sort()
            .reverse();
          const lastDate = revDates[0] || addedDates[0];
          if (!lastDate) return null;
          // Per-subject trend: chapters done in last 7 days vs previous 7 days
          const _s7 = chs.filter(
            (c) =>
              c.status === "Completed" &&
              (c.completedDate || c.dateAdded) &&
              dateKeyToUTC(c.completedDate || c.dateAdded) >=
                dateKeyToUTC(addDays(today, -6)),
          ).length;
          const _p7 = chs.filter(
            (c) =>
              c.status === "Completed" &&
              (c.completedDate || c.dateAdded) &&
              dateKeyToUTC(c.completedDate || c.dateAdded) >=
                dateKeyToUTC(addDays(today, -13)) &&
              dateKeyToUTC(c.completedDate || c.dateAdded) <
                dateKeyToUTC(addDays(today, -6)),
          ).length;
          const subjImproving = _s7 > _p7 && _s7 >= 1;
          const daysSince = Math.round(
            (dateKeyToUTC(today) - dateKeyToUTC(lastDate)) / 86400000,
          );
          return { subj, daysSince, subjImproving, isUntouched: false };
        })
        .filter(Boolean)
        .sort((a, b) => b.daysSince - a.daysSince);

      const neglected = _subjActivityList.filter((s) =>
        s.isUntouched ? s.daysSince > 6 : s.daysSince > 14,
      );
      const slipping = _subjActivityList.filter(
        (s) => !s.isUntouched && s.daysSince > 7 && s.daysSince <= 14,
      );
      const improving = _subjActivityList.filter((s) => s.subjImproving);

      if (neglected.length > 0) {
        const _untouched = neglected.filter((s) => s.isUntouched);
        const _touched = neglected.filter((s) => !s.isUntouched);
        if (_untouched.length > 0 && _touched.length === 0) {
          // All neglected subjects are completely unstarted
          p.push(
            _untouched.length === 1
              ? pick([
                  `${_untouched[0].subj} has no chapters added yet. It's part of your exam — it can't stay at zero.`,
                  `You haven't started ${_untouched[0].subj} at all. ICSE marks it separately — open it today.`,
                  `${_untouched[0].subj} is completely unstarted. That needs to change before the exam.`,
                ])
              : pick([
                  `${_untouched.length} subjects haven't been started at all: ${_untouched.map((s) => s.subj).join(", ")}. Each one is part of your exam.`,
                  `Not started yet: ${_untouched.map((s) => s.subj).join(", ")}. These can't stay at zero — add at least one chapter from each.`,
                ]),
          );
        } else if (_untouched.length > 0 && _touched.length > 0) {
          // Mix of unstarted and neglected — lead with the unstarted
          p.push(
            pick([
              `${_untouched[0].subj} hasn't been started at all, and ${_touched.length > 0 ? _touched[0].subj + " hasn't been touched in " + _touched[0].daysSince + " days" : "others are slipping too"}. Both need attention.`,
              `Biggest gap: ${_untouched[0].subj} has no chapters added. After that, ${_touched.length > 0 ? _touched[0].subj + " is " + _touched[0].daysSince + " days idle" : "check your slipping subjects"}.`,
            ]),
          );
        } else {
          // All neglected subjects have some chapters but are idle
          const names = _touched
            .map((s) => `${s.subj} (${s.daysSince}d)`)
            .join(", ");
          p.push(
            neglected.length === 1
              ? pick([
                  `${neglected[0].subj} hasn't been touched in ${neglected[0].daysSince} days — that's the gap to close.`,
                  `${neglected[0].daysSince} days since you looked at ${neglected[0].subj}. That subject needs time today.`,
                  `${neglected[0].subj} is falling behind — ${neglected[0].daysSince} days without a session.`,
                ])
              : pick([
                  `${neglected.length} subjects haven't been touched in over 2 weeks: ${names}. These need attention.`,
                  `Major gaps: ${names}. Each of these has gone over 14 days without a session.`,
                ]),
          );
        }
      } else if (slipping.length > 0) {
        const names = slipping
          .map((s) => `${s.subj} (${s.daysSince}d)`)
          .join(", ");
        p.push(
          slipping.length === 1
            ? pick([
                `${slipping[0].subj} hasn't had a session in ${slipping[0].daysSince} days — worth fitting in today.`,
                `${slipping[0].daysSince} days since you touched ${slipping[0].subj}. Don't let it slip further.`,
              ])
            : pick([
                `${slipping.length} subjects are slipping: ${names}. A session on each this week would close those gaps.`,
                `Starting to lag: ${names}. Each of these needs attention before they become fully neglected.`,
              ]),
        );
      }

      if (improving.length > 0) {
        const names = improving.map((s) => s.subj).join(", ");
        p.push(
          improving.length === 1
            ? pick([
                `${improving[0].subj} is picking up — more chapters done this week than last. Keep that going.`,
                `Good momentum in ${improving[0].subj} recently. Don't let it drop off.`,
              ])
            : pick([
                `${improving.length} subjects gaining momentum this week: ${names}. That's the direction to build on.`,
                `Improving recently: ${names}. Keep the same energy across all of them.`,
              ]),
        );
      }
    }

    // ── Per-subject completion imbalance ──
    {
      const _subjCompletion = _allSubjects
        .map((subj) => {
          const chs = subjectMap[subj] || [];
          const subjTotal = _syllabusTotal(subj) || chs.length;
          const subjDone = chs.filter((c) => c.status === "Completed").length;
          const pct =
            subjTotal > 0 ? Math.round((subjDone / subjTotal) * 100) : 0;
          const _isUntouched = chs.length === 0;
          return { subj, pct, subjDone, subjTotal, _isUntouched };
        })
        .filter((s) => s.subjTotal >= 3 && !s._isUntouched);
      const _behind = _subjCompletion.filter(
        (s) => s.pct < 30 && !inRevisionWindow,
      );
      const _mostBehind = _behind.sort((a, b) => a.pct - b.pct)[0];
      if (_mostBehind) {
        p.push(
          pick([
            `${_mostBehind.subj} is only ${_mostBehind.pct}% done (${_mostBehind.subjDone}/${_mostBehind.subjTotal} chapters) — that's the biggest gap right now. It needs dedicated sessions before other subjects get more time.`,
            `Watch ${_mostBehind.subj}: ${_mostBehind.pct}% complete. At ${_mostBehind.subjDone} of ${_mostBehind.subjTotal} chapters, it's the most at-risk subject. Prioritise it.`,
            `${_mostBehind.subj} is ${_mostBehind.pct}% done — the lowest completion of any subject. ICSE marks each subject separately; this one needs focus now.`,
          ]),
        );
      }
    }

    if (weakCount > 0) {
      // Build per-subject weak breakdown
      const _weakBySubj = {};
      chapters
        .filter((c) => c.isWeak)
        .forEach((c) => {
          _weakBySubj[c.subject] = (_weakBySubj[c.subject] || 0) + 1;
        });
      const _weakSubjs = Object.entries(_weakBySubj).sort(
        (a, b) => b[1] - a[1],
      );
      const _worstWeakSubj = _weakSubjs[0];

      if (autoWeakCount > 0 && autoWeakCount === weakCount) {
        p.push(
          _worstWeakSubj
            ? pick([
                `${autoWeakCount} chapter${autoWeakCount !== 1 ? "s" : ""} auto-flagged weak from missed revisions — ${_worstWeakSubj[0]} has the most (${_worstWeakSubj[1]}). These need extra cycles before the exam.`,
                `Missed revisions have flagged ${autoWeakCount} chapter${autoWeakCount !== 1 ? "s" : ""} as weak. Heaviest in ${_worstWeakSubj[0]} (${_worstWeakSubj[1]}). Each needs extra revision cycles.`,
              ])
            : `${autoWeakCount} chapter${autoWeakCount !== 1 ? "s" : ""} auto-flagged weak from missed revisions — these need extra cycles before the exam.`,
        );
      } else {
        p.push(
          _weakSubjs.length > 1
            ? pick([
                `${weakCount} weak chapters flagged across ${_weakSubjs.length} subjects — ${_worstWeakSubj[0]} has the most (${_worstWeakSubj[1]}). Don't let these slide further.`,
                `Weak chapters: ${_weakSubjs.map(([s, n]) => `${s} (${n})`).join(", ")}. These cost marks if left alone — keep giving them extra attention.`,
              ])
            : pick([
                `${weakCount} weak chapter${weakCount !== 1 ? "s" : ""} in ${_worstWeakSubj[0]} — keep giving those extra attention, they'll cost marks if left alone.`,
                `${_worstWeakSubj[0]} has ${weakCount} flagged weak chapter${weakCount !== 1 ? "s" : ""}. These need extra revision cycles before the exam.`,
              ]),
        );
      }
    }

    if (missedPermCount > 0) {
      // Build per-subject missed revision breakdown
      const _missedBySubj = {};
      revisions
        .filter((r) => r.missedPermanently)
        .forEach((r) => {
          _missedBySubj[r.subject] = (_missedBySubj[r.subject] || 0) + 1;
        });
      const _missedSubjs = Object.entries(_missedBySubj).sort(
        (a, b) => b[1] - a[1],
      );
      const _worstMissedSubj = _missedSubjs[0];
      p.push(
        _missedSubjs.length > 1
          ? pick([
              `${missedPermCount} revisions permanently missed across ${_missedSubjs.length} subjects — worst in ${_worstMissedSubj[0]} (${_worstMissedSubj[1]}). Those chapters need manual re-revision before the exam.`,
              `Permanently missed: ${_missedSubjs.map(([s, n]) => `${s} (${n})`).join(", ")}. Each of these chapters needs extra attention to compensate.`,
            ])
          : pick([
              `${missedPermCount} revision${missedPermCount !== 1 ? "s" : ""} permanently missed in ${_worstMissedSubj[0]} — those chapters need manual re-revision before the exam.`,
              `${_worstMissedSubj[0]} has ${missedPermCount} permanently missed revision${missedPermCount !== 1 ? "s" : ""}. Go back to those chapters and re-cover them manually.`,
            ]),
      );
    }

    // ── Pile-up warning — matches Insights PILE-UP WARNING threshold (4+ revisions in next 3 days) ──
    {
      let _pileupDate = null,
        _pileupCount = 0;
      const _totalUpcoming = revisions.filter(
        (r) =>
          !r.done &&
          !r.missedPermanently &&
          r.dueDate > today &&
          r.dueDate <= addDays(today, 3),
      ).length;
      for (let _d = 1; _d <= 3; _d++) {
        const _fd = addDays(today, _d);
        const _dc = revisions.filter(
          (r) => !r.done && !r.missedPermanently && r.dueDate === _fd,
        ).length;
        if (_dc >= 4) {
          _pileupDate = _fd;
          _pileupCount = _dc;
          break;
        }
      }
      if (_pileupDate) {
        p.push(
          pick([
            `${_pileupCount} revisions pile up on ${fmtDate(_pileupDate)} — consider knocking some out early today to avoid a crunch.`,
            `Heads up: ${_pileupCount} revisions are due on ${fmtDate(_pileupDate)}. Getting ahead of that today will help.`,
            `There's a revision pile-up coming — ${_pileupCount} due on ${fmtDate(_pileupDate)}. Start clearing some now.`,
          ]),
        );
      } else if (_totalUpcoming >= 6) {
        p.push(
          pick([
            `${_totalUpcoming} revisions due across the next 3 days — spread but building up. Stay on top of them daily.`,
            `${_totalUpcoming} revisions coming in the next 3 days. Clear them day by day so they don't pile up.`,
            `Heads up: ${_totalUpcoming} revisions due over the next 3 days. Don't let them stack — do each day's batch on time.`,
          ]),
        );
      }
    }

    // ── Low retention warning — matches Insights LOW RETENTION threshold (<30% fully revised) ──
    let _lowRetFired = false;
    {
      const _oldChaps = syllabusChaps.filter((c) => {
        if (c.status !== "Completed") return false;
        const _rd = c.completedDate || c.dateAdded;
        return (
          _rd &&
          Math.round((dateKeyToUTC(today) - dateKeyToUTC(_rd)) / 86400000) > 30
        );
      });
      if (_oldChaps.length >= 3) {
        const _fullyRev = _oldChaps.filter((c) =>
          [1, 3, 7, 30].every((n) =>
            revisions.find(
              (r) => r.chapterId === c.id && r.dayOffset === n && r.done,
            ),
          ),
        ).length;
        if (_fullyRev / _oldChaps.length < 0.3) {
          _lowRetFired = true;
          p.push(
            pick([
              `Only ${_fullyRev} of your older chapters have all four revision cycles complete. The rest are at risk of fading before the exam — prioritise revision over new chapters today.`,
              `Retention is low — ${_fullyRev} fully revised out of ${_oldChaps.length} chapters older than 30 days. Memory without revision won't hold to exam day.`,
              `${_oldChaps.length - _fullyRev} chapters older than a month are missing revision cycles. That's a memory gap that will show up in the exam.`,
            ]),
          );
        }
      }
    }

    // ── Per-subject revision quality — worst subject, only when low-retention didn't already fire ──
    if (!_lowRetFired) {
      const _subjRevQuality = Object.keys(subjectMap)
        .map((subj) => {
          const _completedChs = subjectMap[subj].filter(
            (c) => c.status === "Completed",
          );
          if (_completedChs.length < 3) return null;
          const _fullyRevSubj = _completedChs.filter((c) =>
            [1, 3, 7, 30].every((n) =>
              revisions.find(
                (r) => r.chapterId === c.id && r.dayOffset === n && r.done,
              ),
            ),
          ).length;
          const _revQPct = Math.round(
            (_fullyRevSubj / _completedChs.length) * 100,
          );
          return {
            subj,
            _revQPct,
            _fullyRevSubj,
            _total: _completedChs.length,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a._revQPct - b._revQPct);
      const _worstRevSubj = _subjRevQuality[0];
      if (_worstRevSubj && _worstRevSubj._revQPct < 50) {
        p.push(
          pick([
            `${_worstRevSubj.subj} has the weakest revision record — only ${_worstRevSubj._revQPct}% of its completed chapters are fully revised. Prioritise revision sessions there.`,
            `Revision quality in ${_worstRevSubj.subj}: ${_worstRevSubj._fullyRevSubj} of ${_worstRevSubj._total} chapters fully revised (${_worstRevSubj._revQPct}%). That's the biggest retention gap right now.`,
            `Only ${_worstRevSubj._revQPct}% of ${_worstRevSubj.subj}'s completed chapters have all four revision cycles done. That subject needs more revision time.`,
          ]),
        );
      }
    }

    // ── Total revision milestone — motivational, only when on track and meaningful volume ──
    if (
      totalRevDone >= 10 &&
      onTrackForSafe &&
      !_lowRetFired &&
      !inRevisionWindow
    ) {
      p.push(
        pick([
          `${totalRevDone} revision sessions completed so far — that's the memory work paying off. Keep the chain going.`,
          `You've done ${totalRevDone} revisions. That's not just chapters done — that's retention being built. It compounds.`,
          `${totalRevDone} revision cycles logged. Every one of those is a chapter that won't fade by exam day.`,
        ]),
      );
    }

    if (
      paceNeededForSafe !== null &&
      effectivePace > 0 &&
      !onTrackForSafe &&
      !inRevisionWindow
    ) {
      const gap = (paceNeededForSafe - effectivePace).toFixed(1);
      const _dailyTarget = Math.ceil(paceNeededForSafe);
      p.push(
        pick([
          `You need ${paceNeededForSafe.toFixed(1)} chapters/day to finish in time — you're at ${effectivePace.toFixed(1)}. That ${gap}/day gap needs to close. Aim for ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} today.`,
          `Safe finish needs ${paceNeededForSafe.toFixed(1)}/day. You're doing ${effectivePace.toFixed(1)}. Close that ${gap}/day gap — start with ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} today.`,
          `The required pace is ${paceNeededForSafe.toFixed(1)} chapters/day. Your current rate is ${effectivePace.toFixed(1)}. That's a ${gap}/day shortfall — ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} today gets you moving in the right direction.`,
          `At ${effectivePace.toFixed(1)} chapters/day you're ${gap} short of the ${paceNeededForSafe.toFixed(1)}/day you need. That gap won't close itself — ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} today is the minimum.`,
          `${gap} extra chapter${parseFloat(gap) !== 1 ? "s" : ""} per day — that's the difference between on-track and off-track right now. Current: ${effectivePace.toFixed(1)}, needed: ${paceNeededForSafe.toFixed(1)}. Make today count: ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""}.`,
        ]),
      );
    } else if (remaining > 0 && onTrackForSafe && !inRevisionWindow) {
      const _dailyTarget = Math.ceil(paceNeededForSafe);
      if (paceImproving) {
        p.push(
          pick([
            `You're on track and your pace is improving — ${effectivePace.toFixed(1)}/day this week. Hold this and you're finishing ${projectedFinish ? fmtDate(projectedFinish) : "on time"}, well inside your safe window. Keep hitting ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} a day.`,
            `Pace is strong and getting stronger — ${effectivePace.toFixed(1)}/day. Keep it going and you're comfortably on course. ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} a day is all it takes to stay there.`,
            `${effectivePace.toFixed(1)} chapters/day and rising. You're ahead of where you need to be — the goal now is not letting it slip below ${_dailyTarget}.`,
            `The pace trend is working in your favour — ${effectivePace.toFixed(1)}/day and tracking well. Projected finish: ${projectedFinish ? fmtDate(projectedFinish) : "on time"}. Minimum to hold: ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} a day.`,
            `You're both on track and accelerating. ${effectivePace.toFixed(1)}/day is the number to protect — don't let it drop below ${_dailyTarget}.`,
          ]),
        );
      } else {
        p.push(
          pick([
            `Pace is where it needs to be — ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} a day keeps you on course. Stay consistent.`,
            `You're hitting the numbers. The only risk now is slowing down — keep ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} a day as your floor.`,
            `${effectivePace.toFixed(1)} chapters/day — right where it needs to be. ${_dailyTarget} a day from here and you're finishing on time. Don't drop below that.`,
            `The numbers are solid. ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} a day is what it takes — no changes needed, just keep doing it.`,
            `You're on track. The job now is to not talk yourself out of a routine that's working. ${_dailyTarget} chapter${_dailyTarget !== 1 ? "s" : ""} a day — that's it.`,
          ]),
        );
      }
    }

    // Weekly activity — fixed: no dateCreated gate
    // studiedDaysThisWeek counts any day with chapter completion OR revision done.
    // Streak only increments on revision completions — the two can diverge.
    if (studiedDaysThisWeek <= 2 && streakCount <= 3) {
      p.push(
        pick([
          `${studiedDaysThisWeek} active day${studiedDaysThisWeek !== 1 ? "s" : ""} this week — that pattern won't get you where you need to be.`,
          `Only ${studiedDaysThisWeek} study day${studiedDaysThisWeek !== 1 ? "s" : ""} out of the last 7. The gaps in your week are starting to matter.`,
          `${studiedDaysThisWeek === 0 ? "No study days" : studiedDaysThisWeek + " day" + (studiedDaysThisWeek !== 1 ? "s" : "")} this week. That's not enough — the exam doesn't adjust for quiet weeks.`,
          `A ${studiedDaysThisWeek}-day week isn't going to cut it. The missed days compound faster than you think.`,
          `${studiedDaysThisWeek} out of 7 days — every gap in your week is a gap in your preparation. Today is a chance to fix that.`,
        ]),
      );
    } else if (studiedDaysThisWeek <= 2 && streakCount > 3) {
      p.push(
        pick([
          `${studiedDaysThisWeek} day${studiedDaysThisWeek !== 1 ? "s" : ""} of chapter activity this week — your ${streakCount}-day revision streak shows you're keeping the habit alive. Make sure chapters are moving forward too.`,
          `Only ${studiedDaysThisWeek} active day${studiedDaysThisWeek !== 1 ? "s" : ""} this week, but your ${streakCount}-day streak says you're showing up for revisions consistently. Keep both going.`,
        ]),
      );
    } else if (studiedDaysThisWeek >= 3 && studiedDaysThisWeek <= 5) {
      p.push(
        pick([
          `${studiedDaysThisWeek} active days this week — a reasonable start. The exam rewards the students who show up every day, not most days.`,
          `${studiedDaysThisWeek} out of 7 days. Decent, but there's room to push — even one more day this week compounds over time.`,
          `${studiedDaysThisWeek} days studied. That's solid but not enough to pull ahead. Try to close out the week stronger.`,
        ]),
      );
    } else if (studiedDaysThisWeek >= 6 && streakCount > 0) {
      p.push(
        pick([
          `${studiedDaysThisWeek} out of 7 days active this week — that kind of consistency is how exams are won.`,
          `Nearly every day this week. Keep that going.`,
          `${studiedDaysThisWeek}/7 days. That's elite-level consistency — don't underestimate how much it compounds.`,
          `${studiedDaysThisWeek} days studied this week. You're showing up every day and it will show on exam day.`,
          isWeekend
            ? `Even on the weekend you've kept it up — ${studiedDaysThisWeek} days this week. That's the difference maker.`
            : `${studiedDaysThisWeek} active days and the week isn't even over. This is the habit that wins exams.`,
        ]),
      );
    } else if (studiedDaysThisWeek >= 6 && streakCount === 0) {
      p.push(
        pick([
          `${studiedDaysThisWeek} active days this week — solid chapter work. Streak is at 0 because it only counts days you completed a revision. Once your completed chapters reach their R1 dates, it will start climbing.`,
          `${studiedDaysThisWeek}/7 days of activity. Your streak shows 0 because no revisions have come due yet — that changes as your chapters age into their first revision dates. Keep the chapter pace going.`,
        ]),
      );
    }

    if (inGroup) {
      p.push(
        pick([
          `You're in a study group — friendly competition is one of the best motivators. Use it.`,
          `Your group can see your streak. Every day you study, it shows.`,
          `The group leaderboard is live. Someone else is probably studying right now.`,
          `Study groups work because nobody wants to be the one who fell behind. Use that.`,
          `Your group is watching the same clock. Let your consistency do the talking.`,
        ]),
      );
    }

    if (p.length > 0) paras.push(p.join(" "));
  }

  // ── PARA 3: Forward look ──
  {
    const p = [];

    if (inRevisionWindow && remaining > 0) {
      p.push(
        pick([
          `Each chapter you can still complete gives you R1, R2, and R3 before the exam. That's still meaningful.`,
          `Chapters finished in the next ${Math.min(daysToExam || 7, 7)} days can still get 3 revision sessions in. Worth pushing for.`,
          `Every chapter you finish now still earns you R1 and R2 before exam day. Don't stop.`,
          `Even inside the revision window, completing chapters matters — each one gets at least 2 revision cycles in.`,
          `There's still time to finish ${remaining > 5 ? "a few more" : remaining === 1 ? "the last one" : "these last " + remaining} — and every one you complete in the next ${Math.min(daysToExam || 7, 7)} days still gets revised before the exam.`,
        ]),
      );
    } else if (paceRecovering) {
      if (!onTrackForSafe && paceNeededForSafe !== null) {
        // Came back but still behind needed pace — praise the return, name the gap
        p.push(
          pick([
            `Good to see you back${name ? ", " + name : ""}. You went from nothing to something this week — that's real. But the gap is still there: ${effectivePace.toFixed(1)}/day right now, ${paceNeededForSafe.toFixed(1)}/day needed. The comeback only counts if the pace follows.`,
            `You restarted. That's the hardest part and you did it. Now the honest picture: ${paceNeededForSafe.toFixed(1)} chapters/day needed, you're at ${effectivePace.toFixed(1)}. ${safeDaysLeft !== null && safeDaysLeft > 0 ? `${safeDaysLeft} days left — ` : ""}close the gap starting today.`,
            `The return is real${name ? ", " + name : ""}. Most people don't come back once they stop — you did. But ${remaining} chapters in ${safeDaysLeft !== null && safeDaysLeft > 0 ? safeDaysLeft + " days" : "the time left"} means this week's pace needs to be the floor, not the ceiling.`,
            `You broke the inertia. That matters. Now be honest with yourself: ${effectivePace.toFixed(1)}/day won't get you there — you need ${paceNeededForSafe.toFixed(1)}. You've done the hard part of starting. Now do the harder part of accelerating.`,
          ]),
        );
      } else {
        // Came back and already on track — full celebration
        p.push(
          pick([
            `A comeback from zero is hard. You're doing it. ${safeDaysLeft !== null && safeDaysLeft > 0 ? `You have ${safeDaysLeft} days of real study time left — use the momentum.` : ""}`,
            `You went from nothing to something this week. That's the hardest part. Now it's about not stopping.`,
            `Most people don't restart once they've stopped. You did. That matters — now build on it.`,
            `The comeback is real. ${safeDaysLeft !== null && safeDaysLeft > 0 ? `${safeDaysLeft} days left in your study window. ` : ""}Keep this going and the trajectory changes completely.`,
            `You've broken the inertia. That's the hardest part of any streak. Don't waste it.`,
          ]),
        );
      }
    } else if (paceImproving && zone <= 3) {
      const daysIfCurrent =
        last7pace > 0 ? Math.ceil(remaining / last7pace) : null;
      const newProj = daysIfCurrent ? addDays(today, daysIfCurrent) : null;
      if (
        newProj &&
        safeFinishDate &&
        dateKeyToUTC(newProj) <= dateKeyToUTC(safeFinishDate)
      ) {
        p.push(
          pick([
            `At this week's pace you'd finish around ${fmtDate(newProj)} — inside your safe window. Hold this and the exam is yours to win.`,
            `Keep up this week's pace and you're done by ${fmtDate(newProj)}, well before the safe deadline. The work is paying off.`,
            `${fmtDate(newProj)} — that's your finish date if this week's pace holds. That's a strong position to be in.`,
          ]),
        );
      } else {
        p.push(
          pick([
            `Your pace is moving in the right direction. Keep pushing — the gap is closing.`,
            `The trend is your friend right now. Don't let it flatten out.`,
            `Pace up, trajectory improving. Stay focused and the math starts working for you.`,
          ]),
        );
      }
    } else if (zone === 1 && projBeforeSafe && streakCount >= 3) {
      p.push(
        pick(
          streakTier >= 3
            ? [
                `${streakCount} days straight — that's a real habit now, not just a streak. Protect it.`,
                `A ${streakCount}-day streak means you've built something that actually works. Don't let a single lazy day undo it.`,
                `${streakCount} consecutive days. At this point the streak itself becomes motivation. Keep it alive.`,
              ]
            : streakTier === 2
              ? [
                  `${streakCount} days in a row — you're past the hard part of building a habit. Now it's just maintenance.`,
                  `A ${streakCount}-day streak is where consistency starts compounding. Don't give it a reason to break.`,
                  `${streakCount} days straight. That kind of consistency is what actually wins exams.`,
                ]
              : [
                  `A ${streakCount}-day streak is real momentum. Don't give it a reason to break.`,
                  `${streakCount} days straight. That kind of consistency is what actually wins exams.`,
                  `Small streaks grow into big ones. Keep this one alive.`,
                ],
        ),
      );
    } else if (zone === 2 && safeDaysLeft !== null) {
      p.push(
        pick([
          `${safeDaysLeft} day${safeDaysLeft !== 1 ? "s" : ""} of real study time left before the revision window opens. Make each one count.`,
          `You have ${safeDaysLeft} day${safeDaysLeft !== 1 ? "s" : ""} left in your study window. Use them well.`,
          `${safeDaysLeft} day${safeDaysLeft !== 1 ? "s" : ""} to the revision window. Every chapter you finish now gets the full cycle.`,
          `The study window has ${safeDaysLeft} day${safeDaysLeft !== 1 ? "s" : ""} in it. Chapters completed in that time get all four revision rounds.`,
          isFri
            ? `Going into the weekend with ${safeDaysLeft} day${safeDaysLeft !== 1 ? "s" : ""} left — use at least part of it.`
            : isMon
              ? `${safeDaysLeft} days left and a fresh week ahead. Don't let Monday be a slow start.`
              : `${safeDaysLeft} days. Not as many as it sounds. Use each one deliberately.`,
        ]),
      );
    } else if (zone === 3 && remaining > 0) {
      p.push(
        pick([
          `Focus on subjects you can finish completely rather than touching everything lightly. Depth beats breadth here.`,
          `Better to fully complete 2 subjects with good revision than half-finish 5.`,
          `Pick the highest-weightage chapters and finish those completely. Partial coverage of everything is worth less than full coverage of what matters most.`,
          `In the time you have, prioritise finishing — a completed chapter with R1 is more valuable than three started ones.`,
          `Narrow the focus. Fewer subjects, done properly, beats spreading thin across all of them.`,
        ]),
      );
    } else if (remaining === 0) {
      p.push(
        pick([
          `Every revision you do now is memory you're locking in for exam day.`,
          `The studying is done. Now it's just about retention.`,
          `Each revision session from here is compounding what you already know. Keep the chain clean.`,
          `You're in the best possible position: syllabus done, revision chain running. Stay on top of it.`,
          streakTier >= 2
            ? `${streakCount} days of discipline has brought you here. Carry it through to exam day.`
            : `All that's left is revision. Do it daily and exam day looks after itself.`,
        ]),
      );
    }

    if (chapsLosingR4 > 0 && !inRevisionWindow && remaining > 0) {
      p.push(
        `${chapsLosingR4} completed chapter${chapsLosingR4 !== 1 ? "s" : ""} will miss R4 before your exam — R1 through R3 still count, so they're not wasted.`,
      );
    }

    if (p.length > 0) paras.push(p.join(" "));
  }

  // ── CLOSER: one crisp line ──
  {
    let closer = "";
    if (paceRecovering)
      closer = pick([
        `This is what a turnaround looks like. Keep going.`,
        `You started. That's already more than most people manage.`,
        `Momentum is fragile at first. Protect it today.`,
        `The hardest part of a comeback is not stopping again. You've got this.`,
        isMon
          ? `New week, new streak. Make it count.`
          : isFri
            ? `Finish the week strong — don't let Friday be a rest day yet.`
            : `Keep the streak alive. One day at a time.`,
      ]);
    else if (paceImproving && onTrackForSafe)
      closer = pick([
        `You're improving and on track. Don't let up.`,
        `The numbers are moving your way. Stay with it.`,
        `Everything's going in the right direction. The only job now is to not stop.`,
        `Pace up, on track, exam in sight. This is what good preparation looks like.`,
        streakTier >= 2
          ? `${streakCount} days and accelerating. That's the combination that wins.`
          : `Keep building. The trend is your friend right now.`,
      ]);
    else if (paceSlipping && zone === 1)
      closer = pick([
        `The early weeks are deceptively forgiving. Don't mistake that for safety.`,
        `A dip now is fixable. A dip in zone 2 isn't. Close it today.`,
        `Zone 1 feels comfortable. That's the trap. Fix the pace before it becomes a pattern.`,
        `You have time to correct this — but only if you start today, not next week.`,
        isMon
          ? `New week, clean slate. But the gap from last week doesn't reset. Address it now.`
          : `The slip is small. Keep it that way by acting today.`,
      ]);
    else if (zone === 1 && onTrackForSafe)
      closer = pick([
        `You're doing the right things. Keep going.`,
        `This is how exams are won — one chapter at a time, day after day.`,
        `Solid. Don't overthink it.`,
        streakTier >= 3
          ? `${streakCount} days. You've turned this into a discipline, not just a habit. See it through.`
          : streakTier === 2
            ? `${streakCount}-day streak and on track. That's the sweet spot. Don't break it.`
            : streakTier === 1
              ? `Small streak, solid numbers. Build on both.`
              : isMon
                ? `Good start to the week. Let's see you finish it the same way.`
                : isFri
                  ? `Strong week. Rest tonight, but don't let it bleed into Sunday.`
                  : `Consistent effort beats occasional heroics every time. Keep it up.`,
      ]);
    else if (zone === 1 && !onTrackForSafe)
      closer = pick([
        `You have time — but only if you use it. Start closing that gap today.`,
        `Early days are the easiest to waste. Don't.`,
        `The runway is long, but it won't feel that way in a month.`,
        `Zone 1 is a gift. Don't hand it back by treating every day as optional.`,
        isMon
          ? `Start the week with intent. What you do today sets the tone for all seven days.`
          : isWeekend
            ? `Weekends are where gaps open up. Don't let this one be wasted.`
            : `Every comfortable day now is a stressed day later. Get ahead of it.`,
      ]);
    else if (zone === 2)
      closer = pick([
        `The window is real. Don't let urgency become panic — just move.`,
        `This is the part that separates prepared from unprepared. Stay in it.`,
        `Today matters more than it feels like it does.`,
        `Zone 2 students who keep moving make it. Those who freeze, don't. Keep moving.`,
        isFri
          ? `Don't let the weekend undo the week. Keep the momentum through Saturday at least.`
          : isMon
            ? `The week ahead is your best chance to change the trajectory. Use every day of it.`
            : `Urgency without panic. That's the mode to be in right now.`,
        `The chapters you do today directly protect your revision cycles. Make them count.`,
      ]);
    else if (remaining === 0)
      closer = pick([
        `You've done the hard part. See it through.`,
        `Back yourself now.`,
        `The syllabus is done. Trust your preparation and stay sharp on revisions.`,
        `Revision from here, every day. That's it. That's the whole plan.`,
        streakTier >= 2
          ? `${streakCount} days of work brought you here. Don't stop in the final stretch.`
          : `The finish line is close. Don't let your guard down.`,
      ]);
    else if (zone === 3)
      closer = pick([
        `Hard and impossible aren't the same thing. Start with one chapter today.`,
        `The situation is what it is. Work with what you have.`,
        `You still have time to make this count. Use it.`,
        `Don't let the size of the deficit stop you from reducing it. One chapter is one chapter.`,
        `The gap looks big. It gets smaller one chapter at a time. Start now.`,
        `Late prep beats no prep. Every day you study from here changes the outcome.`,
      ]);
    if (closer) paras.push(closer);
  }

  // ── RENDER ──
  const F = _PC.font;
  const bodyHtml = paras
    .map((p, i) => {
      const isCloser = i === paras.length - 1;
      const size = isCloser ? "0.95rem" : "1.02rem";
      const color = isCloser ? _PC.text2 : _PC.text;
      const mb = i < paras.length - 1 ? "18px" : "0";
      return `<p style="font-size:${size};color:${color};line-height:1.85;font-family:${F};margin:0 0 ${mb} 0">${p}</p>`;
    })
    .join("");

  block.innerHTML = `
    <div style="background:linear-gradient(135deg,rgba(194,118,42,0.07),rgba(168,94,26,0.03));border:1px solid rgba(194,118,42,0.18);border-top:3px solid var(--indigo2);border-radius:16px;padding:20px 18px;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(194,118,42,0.12)">
        <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--indigo2),var(--kumkum));display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;box-shadow:0 0 12px rgba(194,118,42,0.3)">🎓</div>
        <div>
          <div style="font-size:0.78rem;font-weight:700;color:var(--indigo);font-family:${F};letter-spacing:0.04em">COACH</div>
          <div style="font-size:0.72rem;color:var(--text2);font-family:${F}">${name ? name + "'s" : "Your"} personalised assessment</div>
        </div>
      </div>
      ${bodyHtml}
    </div>
  `;
}

// ── Save deadline from coach tab ──

function _renderDeadlineBanner() {
  // Find or create the banner element before prog-readiness-block
  const ref = document.getElementById("prog-readiness-block");
  if (!ref || !profile) return;
  let banner = document.getElementById("prog-deadline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "prog-deadline-banner";
    ref.parentNode.insertBefore(banner, ref);
  }

  const today = todayStr();

  // Hide banner entirely when exam is within 15 days — deadline no longer applies
  const _daysToExamNow = profile.examDate
    ? Math.round(
        (dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000,
      )
    : null;
  if (_daysToExamNow !== null && _daysToExamNow <= 15 && !profile.deadline) {
    banner.innerHTML = `<div class="prog-section" style="background:${_PC.bg};border:1px solid ${_PC.border};border-radius:16px;padding:14px 18px;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,0.5)"><div style="font-size:0.73rem;color:${_PC.text2};font-family:${_PC.font};line-height:1.5">⏳ 15 or fewer days to exam — the window to set a study deadline has passed. Focus on revisions and what's left.
</div></div>`;
    return;
  }

  if (profile.deadline) {
    // Show countdown banner
    const dLeft = Math.max(
      0,
      Math.round(
        (dateKeyToUTC(profile.deadline) - dateKeyToUTC(today)) / 86400000,
      ),
    );
    const examLeft = profile.examDate
      ? Math.max(
          0,
          Math.round(
            (dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000,
          ),
        )
      : null;
    const color = dLeft <= 7 ? _PC.red : dLeft <= 20 ? _PC.yellow : _PC.green;
    banner.innerHTML = `<div class="prog-section" style="background:${_PC.bg};border:1px solid ${_PC.border};border-top:3px solid ${color};border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${color};font-family:${_PC.font};margin-bottom:4px">🎯 Study Deadline</div>
        <div style="font-size:1.6rem;font-weight:900;color:${color};font-family:${_PC.font};line-height:1;text-shadow:0 0 16px ${color}66">${dLeft} <span style="font-size:0.9rem">days left</span></div>
        <div style="font-size:0.68rem;color:${_PC.text2};font-family:${_PC.font};margin-top:4px">Finish by ${fmtDate(profile.deadline)}${examLeft !== null ? ` &nbsp;·&nbsp; Exam in ${examLeft}d` : ""}</div>
      </div>
      <button onclick="_clearDeadline()" style="background:transparent;border:1px solid ${_PC.border};border-radius:8px;padding:6px 12px;font-size:0.72rem;font-weight:700;color:${_PC.text3};cursor:pointer;font-family:${_PC.font}">Change</button>
    </div>`;
    return;
  }

  // No deadline set — show prompt
  if (!profile.examDate) {
    banner.innerHTML = `<div class="prog-section" style="background:${_PC.bg};border:1px solid ${_PC.border};border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,0.5)">
      <div style="font-size:0.75rem;color:${_PC.text2};font-family:${_PC.font}">Set your exam date in Profile first, then come back to set a study deadline.</div>
    </div>`;
    return;
  }

  const { minDate, maxDate, minLabel, maxLabel } = _deadlineBounds(
    profile.examDate,
  );
  banner.innerHTML = `<div class="prog-section" style="background:${_PC.bg};border:2px solid ${_PC.indigo}55;border-radius:16px;padding:18px;margin-bottom:14px;box-shadow:0 4px 24px rgba(0,0,0,0.5)">
    <div style="font-size:0.75rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${_PC.indigo};font-family:${_PC.font};margin-bottom:6px">🎯 Set Your Study Deadline</div>
    <div style="font-size:0.78rem;color:${_PC.text2};font-family:${_PC.font};margin-bottom:4px;line-height:1.5">When do you want to finish your full syllabus? All pace calculations use this date.</div>
    <div style="font-size:0.68rem;color:${_PC.text3};font-family:${_PC.font};margin-bottom:6px">Valid range: <span style="color:${_PC.text2}">${minLabel}</span> → <span style="color:${_PC.text2}">${maxLabel}</span></div>
    ${(() => {
      const _bps = _computePaceState();
      const _bep = _bps ? _bps.effectivePace : 0;
      const _brem = _bps ? _bps.remaining : 0;
      const _bMin = addDays(profile.examDate, -60);
      const _bMax = addDays(profile.examDate, -10);
      const _sug = (() => {
        if (_bep <= 0 || _brem === 0) return null;
        const _bSlip = _bps ? _bps.paceSlipping : false;
        const _bImp = _bps ? _bps.paceImproving : false;
        const _buf = _bSlip ? 10 : _bImp ? 3 : 5;
        const _bproj = addDays(today, Math.ceil(_brem / _bep) + _buf);
        if (dateKeyToUTC(_bproj) > dateKeyToUTC(_bMax)) return null;
        if (dateKeyToUTC(_bproj) < dateKeyToUTC(_bMin)) return _bMin;
        return _bproj;
      })();
      return _sug
        ? `<div style="font-size:0.7rem;color:${_PC.purple};font-family:${_PC.font};margin-bottom:14px;line-height:1.5">💡 Suggested: <strong style="color:${_PC.text}">${fmtDate(_sug)}</strong> — based on your current pace and chapters remaining.</div>`
        : _bep > 0
          ? `<div style="font-size:0.7rem;color:${_PC.orange};font-family:${_PC.font};margin-bottom:14px;line-height:1.5">⚠️ At your current pace a suggested deadline can't be calculated — you're close to the margin. Set a target date manually and use it to push your daily rate up slightly.</div>`
          : ``;
    })()}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
      <input type="date" id="prog-deadline-input" min="${minDate}" max="${maxDate}" style="background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:8px;padding:9px 12px;color:${_PC.text};font-family:${_PC.font};font-size:0.82rem;flex:1;min-width:140px;outline:none" />
      <button onclick="_saveDeadlineFromProgress()" style="background:${_PC.indigo};border:none;border-radius:8px;padding:9px 18px;font-size:0.78rem;font-weight:800;color:#fff;cursor:pointer;font-family:${_PC.font};white-space:nowrap">Set Deadline</button>
    </div>
    <div id="prog-deadline-err" style="font-size:0.68rem;color:${_PC.red};margin-top:6px;font-family:${_PC.font};min-height:16px"></div>
  </div>`;
}

function _saveDeadlineFromProgress() {
  const inp = document.getElementById("prog-deadline-input");
  if (!inp || !inp.value) {
    document.getElementById("prog-deadline-err").textContent =
      "Please pick a date.";
    return;
  }
  const err = _validateDeadline(inp.value, profile.examDate);
  if (err) {
    document.getElementById("prog-deadline-err").textContent = err;
    return;
  }
  profile.deadline = inp.value;
  localStorage.setItem("st_profile", JSON.stringify(profile));
  renderProgress();
  if (document.getElementById("tab-coach").classList.contains("active"))
    renderCoachTab();
}

function _clearDeadline() {
  profile.deadline = "";
  localStorage.setItem("st_profile", JSON.stringify(profile));
  const banner = document.getElementById("prog-deadline-banner");
  if (banner) banner.remove();
  renderProgress();
  if (document.getElementById("tab-coach").classList.contains("active"))
    renderCoachTab();
}

// ── SHARED UTIL ──
function _syllabusTotal(subjectName) {
  if (!window._syllabus) return null;
  const aliases = { "History & Civics": ["Civics", "History"] };
  const lookFor = aliases[subjectName] || [subjectName];
  let count = 0;
  Object.values(window._syllabus.groups).forEach((group) => {
    Object.values(group.subjects).forEach((subj) => {
      if (lookFor.includes(subj.name) && subj.chapters.length > 0)
        count += subj.chapters.length;
    });
  });
  return count || null;
}

function _syllabusGrandTotal() {
  if (!window._syllabus || !profile) return null;
  const stream = profile.stream || "science";
  const lang2 = profile.lang2 || "hindi";
  const elective = profile.elective || "computer";
  const toLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  if (stream === "science") toLoad.push("physics", "chemistry", "biology");
  else toLoad.push("commerce", "economics_g2");
  toLoad.push(lang2);
  toLoad.push(elective);
  let total = 0;
  Object.values(window._syllabus.groups).forEach((group) => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      if (toLoad.includes(key)) total += subj.chapters.length;
    });
  });
  return total || null;
}

// ── PROGRESS THEME PALETTE ──
const _PC = {
  bg: "linear-gradient(160deg,#0f0c16 0%,#0d0a12 100%)",
  bg4: "#1c1826",
  bg5: "#252133",
  border: "#2e2840",
  text: "#f5ede0",
  text2: "#a89880",
  text3: "#5c5048",
  indigo: "#c2762a",
  yellow: "#e8a020",
  green: "#2d9e6b",
  red: "#e05c5c",
  purple: "#b07fd4",
  orange: "#f97316",
  font: "'Baloo 2',sans-serif",
};

// ── CSS KEYFRAMES injected once ──
function _injectProgressCSS() {
  if (document.getElementById("prog-css")) return;
  const s = document.createElement("style");
  s.id = "prog-css";
  s.textContent = `
    @keyframes progFadeUp {
      from { opacity:0; transform:translateY(18px); }
      to   { opacity:1; transform:translateY(0); }
    }
    @keyframes progPulseRing {
      0%,100% { filter:drop-shadow(0 0 6px currentColor); }
      50%      { filter:drop-shadow(0 0 18px currentColor); }
    }
    @keyframes progShimmer {
      0%   { background-position:-200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes progGlow {
      0%,100% { box-shadow:0 0 0 0 rgba(194,118,42,0); }
      50%      { box-shadow:0 0 18px 4px rgba(194,118,42,0.18); }
    }
    @keyframes progDotPop {
      0%   { transform:scale(0); opacity:0; }
      70%  { transform:scale(1.2); }
      100% { transform:scale(1); opacity:1; }
    }
    @keyframes progBarFill {
      from { width:0 !important; }
    }
    .prog-section {
      animation: progFadeUp 0.45s cubic-bezier(.4,0,.2,1) both;
    }
    .prog-section:nth-child(1) { animation-delay:0.05s; }
    .prog-section:nth-child(2) { animation-delay:0.12s; }
    .prog-section:nth-child(3) { animation-delay:0.19s; }
    .prog-section:nth-child(4) { animation-delay:0.26s; }
    .prog-section:nth-child(5) { animation-delay:0.33s; }
    .prog-section:nth-child(6) { animation-delay:0.40s; }
    .prog-bar-fill {
      animation: progBarFill 1s cubic-bezier(.4,0,.2,1) both;
    }
    .prog-dot-pop {
      animation: progDotPop 0.35s cubic-bezier(.34,1.56,.64,1) both;
    }
    .prog-ring-pulse circle:last-child {
      animation: progPulseRing 2.5s ease-in-out infinite;
    }
    .prog-shimmer-bar {
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
      background-size: 200% 100%;
      animation: progShimmer 2s linear infinite;
      position:absolute;inset:0;border-radius:99px;pointer-events:none;
    }
  `;
  document.head.appendChild(s);
}

function _progSection(content, extraStyle = "") {
  return `<div class="prog-section" style="
    background:${_PC.bg};
    border:1px solid ${_PC.border};
    border-radius:16px;
    padding:18px 16px;
    position:relative;overflow:hidden;
    box-shadow:0 4px 24px rgba(0,0,0,0.5),inset 0 1px 0 rgba(194,118,42,0.07);
    ${extraStyle}
  ">${content}</div>`;
}

function _progHeader(icon, title, accentColor, rightHtml = "") {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:9px">
      <div style="width:28px;height:28px;border-radius:8px;background:${accentColor}1a;border:1px solid ${accentColor}33;display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0">${icon}</div>
      <span style="font-size:0.68rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${accentColor};font-family:${_PC.font}">${title}</span>
    </div>
    ${rightHtml}
  </div>
  <div style="position:absolute;top:0;left:0;right:0;height:40px;background:linear-gradient(180deg,${accentColor}10 0%,transparent 100%);pointer-events:none"></div>`;
}

function _bar(pct, color, height = 7) {
  const w = pct === null || pct === undefined ? 0 : pct;
  return `<div style="background:${_PC.bg4};border-radius:99px;height:${height}px;overflow:hidden;border:1px solid ${_PC.border};position:relative">
    <div class="prog-bar-fill" style="width:${w}%;height:100%;background:${color};border-radius:99px;box-shadow:0 0 8px ${color}55;position:relative">
      <div class="prog-shimmer-bar"></div>
    </div>
  </div>`;
}

function _ringChart(pct, color, size = 110, stroke = 13) {
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const cx = size / 2,
    cy = size / 2;
  return `<svg class="prog-ring-pulse" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)" overflow="visible">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${_PC.bg4}" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
      style="transition:stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1);color:${color}"/>
  </svg>`;
}

function _statPill(label, value, color) {
  return `<div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-top:2px solid ${color}66;border-radius:10px;padding:10px 8px;text-align:center;flex:1;min-width:60px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:${color}07;pointer-events:none"></div>
    <div style="font-size:1.15rem;font-weight:900;color:${color};font-family:${_PC.font};letter-spacing:-0.5px;text-shadow:0 0 12px ${color}77">${value}</div>
    <div style="font-size:0.57rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${_PC.text3};margin-top:2px;font-family:${_PC.font}">${label}</div>
  </div>`;
}

function _emptyState(msg) {
  return `<div style="text-align:center;padding:28px 16px;color:${_PC.text3};font-size:0.83rem;font-family:${_PC.font}">
    <div style="font-size:1.8rem;margin-bottom:8px;opacity:0.3">📭</div>${msg}
  </div>`;
}

// ── 1. EXAM READINESS HERO ──
function renderReadiness() {
  const block = document.getElementById("prog-readiness-block");
  if (!block) return;
  _injectProgressCSS();

  // Post-exam gate
  if (profile && profile.examDate) {
    const _examMs = dateKeyToUTC(profile.examDate);
    const _todayMs = dateKeyToUTC(todayStr());
    if (_todayMs >= _examMs) {
      block.innerHTML = _progSection(
        _progHeader("🎯", "Exam Readiness", _PC.indigo) +
          `<div style="text-align:center;padding:24px 16px">
            <div style="font-size:1.8rem;margin-bottom:10px">🎓</div>
            <div style="font-size:0.95rem;color:${_PC.text2};font-family:${_PC.font};font-style:italic;line-height:1.7">
              Your exam is done. Your readiness score was your preparation — it served its purpose.
            </div>
          </div>`,
        `border-top:3px solid ${_PC.indigo};`,
      );
      return;
    }
  }

  const syllabusChapters = chapters.filter((c) => !c.isCustom);
  const syllabusTotal = _syllabusGrandTotal() || syllabusChapters.length;
  if (syllabusTotal === 0) {
    block.innerHTML = _progSection(
      _progHeader("🎯", "Exam Readiness", _PC.indigo) +
        _emptyState("Syllabus data unavailable."),
    );
    return;
  }

  const completed = syllabusChapters.filter(
    (c) => c.status === "Completed",
  ).length;
  const completionScore = (completed / syllabusTotal) * 60;

  // Only count chapters old enough for R4 to have been due (>30 days since completion)
  // Matches the Intelligence Report filter — prevents penalising students who follow the system
  const today = todayStr();
  const chaptersEligibleForR4 = syllabusChapters.filter((c) => {
    if (c.status !== "Completed") return false;
    const refDate = c.completedDate || c.dateAdded;
    if (!refDate) return false;
    return (
      Math.round((dateKeyToUTC(today) - dateKeyToUTC(refDate)) / 86400000) > 30
    );
  });
  const chaptersWith4 = chaptersEligibleForR4.filter((c) =>
    [1, 3, 7, 30].every((n) =>
      revisions.find(
        (r) => r.chapterId === c.id && r.dayOffset === n && r.done,
      ),
    ),
  ).length;
  // Consistency: only chapters older than 30 days are eligible (enough time for full R4 cycle)
  const consistencyScore =
    chaptersEligibleForR4.length > 0
      ? (chaptersWith4 / chaptersEligibleForR4.length) * 25
      : 0;

  // Balance across ALL syllabus subjects, not just user-added ones
  const syllabusSubjectTotals = {};
  if (window._syllabus) {
    const stream = profile ? profile.stream || "science" : "science";
    const lang2 = profile ? profile.lang2 || "hindi" : "hindi";
    const elective = profile ? profile.elective || "computer" : "computer";
    const toLoad = [
      "english_lang",
      "english_lit",
      "history",
      "civics",
      "geography",
      "maths",
    ];
    if (stream === "science") toLoad.push("physics", "chemistry", "biology");
    else toLoad.push("commerce", "economics_g2");
    toLoad.push(lang2, elective);
    const MERGE = { History: "History & Civics", Civics: "History & Civics" };
    Object.values(window._syllabus.groups).forEach((group) => {
      Object.entries(group.subjects).forEach(([key, subj]) => {
        if (toLoad.includes(key) && subj.chapters.length > 0) {
          const displayName = MERGE[subj.name] || subj.name;
          syllabusSubjectTotals[displayName] =
            (syllabusSubjectTotals[displayName] || 0) + subj.chapters.length;
        }
      });
    });
  }
  const subjectDone = {};
  syllabusChapters
    .filter((c) => c.status === "Completed")
    .forEach((c) => {
      subjectDone[c.subject] = (subjectDone[c.subject] || 0) + 1;
    });
  const allSubjects = Object.keys(syllabusSubjectTotals);
  let imbalance = 0;
  allSubjects.forEach((s) => {
    const p = (subjectDone[s] || 0) / syllabusSubjectTotals[s];
    imbalance += Math.pow(1 - p, 2);
  });
  const balanceScore =
    allSubjects.length === 0
      ? 0
      : (1 - Math.min(1, imbalance / allSubjects.length)) * 15;
  const readiness = Math.round(
    completionScore + consistencyScore + balanceScore,
  );

  const ringColor =
    readiness >= 70 ? _PC.green : readiness >= 40 ? _PC.yellow : _PC.red;
  const grade =
    readiness >= 85
      ? "ELITE"
      : readiness >= 70
        ? "STRONG"
        : readiness >= 50
          ? "BUILDING"
          : readiness >= 30
            ? "EARLY"
            : "START";
  const gradeColor =
    readiness >= 70
      ? _PC.green
      : readiness >= 50
        ? _PC.yellow
        : readiness >= 30
          ? _PC.orange
          : _PC.red;
  const donePct =
    syllabusTotal > 0 ? Math.round((completed / syllabusTotal) * 100) : 0;
  const revPct =
    chaptersEligibleForR4.length > 0
      ? Math.round((chaptersWith4 / chaptersEligibleForR4.length) * 100)
      : null;

  // Exam countdown badge
  let countdownHtml = "";
  if (profile && profile.examDate) {
    const dLeft = Math.max(
      0,
      Math.round(
        (dateKeyToUTC(profile.examDate) - dateKeyToUTC(todayStr())) / 86400000,
      ),
    );
    const urgency =
      dLeft <= 30 ? _PC.red : dLeft <= 60 ? _PC.yellow : _PC.green;
    countdownHtml = `<div style="background:${urgency}18;border:1px solid ${urgency}44;border-radius:8px;padding:5px 11px;font-size:0.68rem;font-weight:800;color:${urgency};font-family:${_PC.font};white-space:nowrap">⏳ ${dLeft}d left</div>`;
  }

  block.innerHTML = _progSection(
    `
    ${_progHeader("🎯", "Exam Readiness", _PC.indigo, countdownHtml)}
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="position:relative;width:112px;height:112px;flex-shrink:0">
        ${_ringChart(donePct, ringColor, 112, 13)}
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:1.8rem;font-weight:900;color:${ringColor};font-family:${_PC.font};line-height:1;text-shadow:0 0 20px ${ringColor}88">${readiness}</div>
          <div style="font-size:0.65rem;font-weight:800;letter-spacing:0.1em;color:${_PC.text2};text-transform:uppercase;font-family:${_PC.font}">/ 100</div>
        </div>
      </div>
      <div style="flex:1;min-width:130px">
        <div style="font-size:1.4rem;font-weight:900;letter-spacing:0.06em;color:${gradeColor};font-family:${_PC.font};text-shadow:0 0 16px ${gradeColor}55;margin-bottom:2px">${grade}</div>
        <div style="font-size:0.7rem;color:${_PC.text2};margin-bottom:12px;font-family:${_PC.font}">${completed} of ${syllabusTotal} syllabus chapters done</div>
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:${_PC.text2};margin-bottom:4px;font-family:${_PC.font}"><span>Chapters done (60 pts)</span><span>${donePct}%</span></div>
          ${_bar(donePct, ringColor)}
        </div>
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:${_PC.text2};margin-bottom:4px;font-family:${_PC.font}"><span>All 4 revisions done (25 pts)</span><span>${revPct === null ? "—" : revPct + "%"}</span></div>
          ${revPct !== null ? _bar(revPct, _PC.purple) : _bar(0, _PC.text3)}
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:${_PC.text2};margin-bottom:4px;font-family:${_PC.font}"><span>Subject balance (15 pts)</span><span>${Math.round((balanceScore / 15) * 100)}%</span></div>
          ${_bar(Math.round((balanceScore / 15) * 100), _PC.green)}
        </div>
      </div>
    </div>
    <div style="margin-top:12px;background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:8px;padding:9px 12px;font-size:0.72rem;color:${_PC.text2};font-family:${_PC.font};line-height:1.6">
      Score = chapters done (max 60) + all 4 revisions done (max 25) + subject balance (max 15)
    </div>
  `,
    `border-top:3px solid ${_PC.indigo};animation:progGlow 3s ease-in-out infinite;`,
  );
}

// ── 2. PACE TRACKER ──
function renderPace() {
  const block = document.getElementById("prog-pace-block");
  if (!block) return;
  const ps = _computePaceState();
  if (!ps) {
    block.innerHTML = "";
    return;
  }

  const {
    today,
    completed,
    remaining,
    safeFinishDate,
    safeDaysLeft,
    daysToExam,
    inSilentZone,
    inRevisionWindow,
    isEmergency,
    nearZoneDrop,
    effectivePace,
    paceNeededForSafe,
    onTrackForSafe,
    projectedFinish,
    paceImproving,
    paceSlipping,
    paceRecovering,
    studyDaysCount,
  } = ps;

  // ── Post-exam: exam date has passed — no pace numbers shown ──
  if (daysToExam <= 0) {
    block.innerHTML = _progSection(
      `${_progHeader("🎓", "Pace Tracker", _PC.indigo)}
      <div style="font-size:0.85rem;color:${_PC.text2};line-height:1.8;font-family:${_PC.font}">
        The exam is done. No more pace targets — you put the work in.
      </div>`,
      `border-top:3px solid ${_PC.indigo};`,
    );
    return;
  }

  // ── Silent zone: ≤5 days to exam — no numbers, calm message ──
  if (inSilentZone) {
    const _silentMsg =
      remaining > 0
        ? `${remaining} chapter${remaining !== 1 ? "s" : ""} still to go. In the time left, complete what you can and revise everything you have. Every chapter you finish now still gets at least one revision before exam day.`
        : `Syllabus complete. Focus entirely on revisions — work through your scheduled sessions and show up sharp.`;
    block.innerHTML = _progSection(
      `${_progHeader("🎓", "Pace Tracker", _PC.indigo)}
      <div style="font-size:0.85rem;color:${_PC.text2};line-height:1.8;font-family:${_PC.font}">
        ${_silentMsg}
      </div>`,
      `border-top:3px solid ${_PC.indigo};`,
    );
    return;
  }

  // ── Revision window: safe window closed — redirect to revisions ──
  if (inRevisionWindow && !isEmergency) {
    const _revMsg =
      remaining > 0
        ? `The safe chapter-completion window has closed — new chapters started now won't complete their full revision cycle. But don't stop.<br><br>
        <span style="color:${_PC.text};font-weight:700">Keep completing chapters AND revising</span>
        — every chapter you finish in the time left still earns at least 2 revision sessions before exam day. Prioritise by weightage.`
        : `The chapter-completion window has closed. Syllabus is done.<br><br>
        <span style="color:${_PC.text};font-weight:700">Focus entirely on revisions</span>
        — work through R1 to R4 on everything you've completed.`;
    block.innerHTML = _progSection(
      `${_progHeader("📖", "Pace Tracker", _PC.purple)}
      <div style="font-size:0.85rem;color:${_PC.text2};line-height:1.8;font-family:${_PC.font}">
        ${_revMsg}
      </div>`,
      `border-top:3px solid ${_PC.purple};`,
    );
    return;
  }

  // ── Emergency: revision window + <25% done ──
  if (isEmergency) {
    block.innerHTML = _progSection(
      `${_progHeader("🚨", "Pace Tracker", _PC.red)}
      <div style="background:${_PC.red}11;border:1px solid ${_PC.red}33;border-radius:10px;padding:12px 14px;font-size:0.82rem;color:${_PC.text};line-height:1.8;font-family:${_PC.font}">
        <strong style="color:${_PC.red}">Emergency mode.</strong>
        The revision window has closed with ${remaining} chapters still to go.
        Speed over depth — complete a chapter, do R1 next day, R2 three days later.
        Start with your highest-weightage subjects.
      </div>`,
      `border-top:3px solid ${_PC.red};`,
    );
    return;
  }

  // ── Normal: pace pills anchored to safe window ──
  const paceNeeded =
    paceNeededForSafe !== null ? paceNeededForSafe.toFixed(1) : "—";
  const onTrack = onTrackForSafe;
  const _graceOverflow =
    onTrack &&
    projectedFinish &&
    safeFinishDate &&
    Math.round(
      (dateKeyToUTC(safeFinishDate) - dateKeyToUTC(projectedFinish)) / 86400000,
    ) < 0;
  const statusColor =
    completed === 0
      ? _PC.text3
      : _graceOverflow
        ? _PC.orange
        : onTrack
          ? _PC.green
          : _PC.red;
  const statusLabel =
    completed === 0
      ? "No data yet ⬜"
      : _graceOverflow
        ? "At Risk 🟡"
        : onTrack
          ? "On Track 🟢"
          : "Behind Pace 🔴";
  const avgPace =
    remaining === 0
      ? "Done"
      : studyDaysCount >= 1 && effectivePace > 0
        ? effectivePace.toFixed(1)
        : "—";
  const projDate = projectedFinish ? fmtDate(projectedFinish) : "—";

  let trendTag = "";
  if (paceRecovering)
    trendTag = `<span style="font-size:0.58rem;font-weight:800;color:${_PC.green};background:${_PC.green}18;border:1px solid ${_PC.green}33;padding:2px 7px;border-radius:99px;margin-left:6px;font-family:${_PC.font}">↑ RECOVERING</span>`;
  else if (paceImproving)
    trendTag = `<span style="font-size:0.58rem;font-weight:800;color:${_PC.green};background:${_PC.green}18;border:1px solid ${_PC.green}33;padding:2px 7px;border-radius:99px;margin-left:6px;font-family:${_PC.font}">↑ IMPROVING</span>`;
  else if (paceSlipping)
    trendTag = `<span style="font-size:0.58rem;font-weight:800;color:${_PC.orange};background:${_PC.orange}18;border:1px solid ${_PC.orange}33;padding:2px 7px;border-radius:99px;margin-left:6px;font-family:${_PC.font}">↓ SLIPPING</span>`;

  const zoneBanner = nearZoneDrop
    ? `<div style="background:${_PC.orange}11;border:1px solid ${_PC.orange}33;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.65rem;color:${_PC.orange};font-family:${_PC.font}">⚠️ Safe window tightens in ${safeDaysLeft} days — accelerate now.</div>`
    : "";

  block.innerHTML = _progSection(
    `
    ${_progHeader(
      "📈",
      "Pace Tracker",
      _PC.yellow,
      `<span style="font-size:0.65rem;font-weight:800;color:${statusColor};background:${statusColor}18;border:1px solid ${statusColor}33;padding:3px 9px;border-radius:99px;font-family:${_PC.font}">${statusLabel}</span>`,
    )}
    ${zoneBanner}
    <div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:0.75rem;color:${_PC.text2};line-height:1.6;font-family:${_PC.font}">
      <b style="color:${_PC.text}">Need/Day</b> = chapters left ÷ days to safe window${profile && profile.deadline ? " (your deadline)" : " (exam−15)"}. &nbsp;
      <b style="color:${_PC.text}">Avg/Day</b> = your actual rate on days you studied${paceImproving ? " (using recent trend)" : ""}.
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      ${_statPill("Safe Days", safeDaysLeft, _PC.purple)}
      ${_statPill("Remaining", remaining, _PC.yellow)}
      ${_statPill("Need/Day", paceNeeded, onTrack ? _PC.green : _PC.red)}
      <div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-top:2px solid ${onTrack ? _PC.green : _PC.orange}66;border-radius:10px;padding:10px 8px;text-align:center;flex:1;min-width:60px;position:relative;overflow:hidden">
        <div style="position:absolute;inset:0;background:${onTrack ? _PC.green : _PC.orange}07;pointer-events:none"></div>
        <div style="font-size:1.15rem;font-weight:900;color:${onTrack ? _PC.green : _PC.orange};font-family:${_PC.font};letter-spacing:-0.5px;text-shadow:0 0 12px ${onTrack ? _PC.green : _PC.orange}77">${avgPace}</div>
        <div style="font-size:0.57rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${_PC.text3};margin-top:2px;font-family:${_PC.font}">Avg/Day${trendTag}</div>
      </div>
    </div>
    <div style="background:${_PC.bg4};border:1px solid ${statusColor}33;border-radius:10px;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="font-size:0.72rem;color:${_PC.text2};font-family:${_PC.font}">Projected finish</div>
      <div style="font-size:0.82rem;font-weight:800;color:${onTrack ? _PC.green : _PC.red};font-family:${_PC.font}">${projDate}</div>
    </div>
  `,
    `border-top:3px solid ${_PC.yellow};`,
  );
}

// ── 3. SYLLABUS MAP ──
function renderSyllabusMap() {
  const block = document.getElementById("prog-syllabus-block");
  if (!block) return;
  if (!window._syllabus || !profile) {
    block.innerHTML = "";
    return;
  }

  const stream = profile.stream || "science";
  const lang2 = profile.lang2 || "hindi";
  const elective = profile.elective || "computer";
  const toLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  if (stream === "science") toLoad.push("physics", "chemistry", "biology");
  else toLoad.push("commerce", "economics_g2");
  toLoad.push(lang2);
  toLoad.push(elective);

  const MERGE = { History: "History & Civics", Civics: "History & Civics" };
  const subjDefs = {};
  Object.values(window._syllabus.groups).forEach((group) => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      subjDefs[key] = subj;
    });
  });

  // Build per-subject chapter status map from actual chapters array
  const chapterStatusMap = {};
  chapters.forEach((c) => {
    const key = c.subject + "|" + c.name.trim().toLowerCase();
    chapterStatusMap[key] = c.status;
  });
  const revisionMap = {};
  chapters.forEach((c) => {
    const revsDone = [1, 3, 7, 30].filter((n) =>
      revisions.find(
        (r) => r.chapterId === c.id && r.dayOffset === n && r.done,
      ),
    ).length;
    revisionMap[c.subject + "|" + c.name.trim().toLowerCase()] = revsDone;
  });

  // Group by merged subject name, deduplicate
  const seen = new Set();
  const subjectSections = [];
  toLoad.forEach((key) => {
    const subj = subjDefs[key];
    if (!subj || subj.chapters.length === 0) return;
    const displayName = MERGE[subj.name] || subj.name;
    if (seen.has(displayName)) {
      const existing = subjectSections.find((s) => s.name === displayName);
      if (existing)
        existing.chapters = [...existing.chapters, ...subj.chapters];
      return;
    }
    seen.add(displayName);
    subjectSections.push({ name: displayName, chapters: subj.chapters });
  });

  const subjectBlocks = subjectSections
    .map(({ name, chapters: chaps }) => {
      const dots = chaps
        .map((ch, idx) => {
          const mapKey = name + "|" + ch.name.trim().toLowerCase();
          const status = chapterStatusMap[mapKey] || "Not Started";
          const revsDone = revisionMap[mapKey] || 0;

          let dotColor, dotBg, dotBorder, dotGlow, dotTitle;
          if (status === "Not Started") {
            dotColor = _PC.text3;
            dotBg = _PC.bg5;
            dotBorder = _PC.border;
            dotGlow = "none";
            dotTitle = "Not Started";
          } else if (status === "In Progress") {
            dotColor = _PC.yellow;
            dotBg = "#2a1f08";
            dotBorder = _PC.yellow + "66";
            dotGlow = `0 0 8px ${_PC.yellow}66`;
            dotTitle = "In Progress";
          } else {
            // Completed — brightness based on revisions done
            if (revsDone === 4) {
              dotColor = _PC.green;
              dotBg = "#0a2a1e";
              dotBorder = _PC.green + "88";
              dotGlow = `0 0 10px ${_PC.green}88`;
              dotTitle = "Fully Revised ✓";
            } else if (revsDone >= 2) {
              dotColor = _PC.indigo;
              dotBg = "#2a1a08";
              dotBorder = _PC.indigo + "88";
              dotGlow = `0 0 8px ${_PC.indigo}66`;
              dotTitle = `${revsDone}/4 revisions done`;
            } else if (revsDone === 1) {
              dotColor = "#d4a060";
              dotBg = "#221608";
              dotBorder = "#d4a06088";
              dotGlow = `0 0 6px #d4a06066`;
              dotTitle = "1/4 revisions done";
            } else {
              dotColor = "#7c6040";
              dotBg = "#1a1208";
              dotBorder = "#7c604066";
              dotGlow = "none";
              dotTitle = "Completed, no revisions yet";
            }
          }

          const animDelay = (idx * 0.03).toFixed(2);
          return `<div class="prog-dot-pop" title="${sanitize(ch.name)} — ${dotTitle}" style="
        width:10px;height:10px;border-radius:50%;
        background:${dotBg};
        border:1.5px solid ${dotBorder};
        box-shadow:${dotGlow};
        cursor:default;
        transition:transform 0.15s,box-shadow 0.15s;
        animation-delay:${animDelay}s;
      " onmouseenter="this.style.transform='scale(1.6)';this.style.zIndex='10'" onmouseleave="this.style.transform='';this.style.zIndex=''"></div>`;
        })
        .join("");

      const done = chaps.filter(
        (ch) =>
          (chapterStatusMap[name + "|" + ch.name.trim().toLowerCase()] ||
            "Not Started") === "Completed",
      ).length;
      const pct =
        chaps.length > 0 ? Math.round((done / chaps.length) * 100) : 0;
      const subColor =
        pct >= 80
          ? _PC.green
          : pct >= 40
            ? _PC.yellow
            : pct > 0
              ? _PC.orange
              : _PC.text3;

      return `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:0.72rem;font-weight:700;color:${_PC.text};font-family:${_PC.font}">${sanitize(name)}</span>
          <span style="font-size:0.6rem;font-weight:800;color:${subColor};font-family:${_PC.font}">${done}/${chaps.length}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${dots}</div>
        ${_bar(pct, subColor, 4)}
      </div>`;
    })
    .join("");

  // Legend
  const legend = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid ${_PC.border}">
      ${[
        { color: _PC.bg5, border: _PC.border, label: "Not Started" },
        { color: "#2a1f08", border: _PC.yellow + "66", label: "In Progress" },
        { color: "#1a1208", border: "#7c604066", label: "Done" },
        { color: "#0a2a1e", border: _PC.green + "88", label: "Fully Revised" },
      ]
        .map(
          (l) => `<div style="display:flex;align-items:center;gap:5px">
        <div style="width:9px;height:9px;border-radius:50%;background:${l.color};border:1.5px solid ${l.border}"></div>
        <span style="font-size:0.6rem;color:${_PC.text3};font-family:${_PC.font}">${l.label}</span>
      </div>`,
        )
        .join("")}
    </div>`;

  block.innerHTML = _progSection(
    _progHeader("🗺️", "Syllabus Map", _PC.purple) + legend + subjectBlocks,
    `border-top:3px solid ${_PC.purple};`,
  );
}

// ── 4. SUBJECT HEALTH ──
function renderSubjectHealth() {
  const block = document.getElementById("prog-subjects-block");
  if (!block) return;
  if (!window._syllabus || !profile) {
    block.innerHTML = "";
    return;
  }
  const today = todayStr();

  // Build subjectMap from user-added chapters (for stats)
  const subjectMap = {};
  chapters
    .filter((c) => !c.isCustom)
    .forEach((c) => {
      if (!subjectMap[c.subject]) subjectMap[c.subject] = [];
      subjectMap[c.subject].push(c);
    });

  // Build full subject list from syllabus — so all subjects show from day one
  const stream = profile.stream || "science";
  const lang2 = profile.lang2 || "hindi";
  const elective = profile.elective || "computer";
  const toLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  if (stream === "science") toLoad.push("physics", "chemistry", "biology");
  else toLoad.push("commerce", "economics_g2");
  toLoad.push(lang2, elective);
  const MERGE = { History: "History & Civics", Civics: "History & Civics" };
  const seen = new Set();
  const allSubjects = [];
  Object.values(window._syllabus.groups).forEach((group) => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      if (!toLoad.includes(key) || subj.chapters.length === 0) return;
      const displayName = MERGE[subj.name] || subj.name;
      if (!seen.has(displayName)) {
        seen.add(displayName);
        allSubjects.push(displayName);
      }
    });
  });

  const subjList = allSubjects
    .map((subj) => {
      const chs = subjectMap[subj] || [];
      const total = chs.length;
      const done = chs.filter((c) => c.status === "Completed").length;
      let brightness = 0;
      chs.forEach((c) => {
        if (c.status !== "Completed") return;
        const revsDone = [1, 3, 7, 30].filter((n) =>
          revisions.find(
            (r) => r.chapterId === c.id && r.dayOffset === n && r.done,
          ),
        ).length;
        brightness += 60 + (revsDone / 4) * 40;
      });
      const avg = done > 0 ? brightness / done : 0;
      const syllabusTotal = _syllabusTotal(subj);
      const realPct = syllabusTotal
        ? Math.round((done / syllabusTotal) * 100)
        : Math.round((done / total) * 100);
      // Status based on % of syllabus completed
      // 0% with chapters added = DANGER (started but nothing done)
      // 0% with NO chapters added = NOT STARTED (genuinely untouched)
      const notStarted = total === 0;
      const color =
        realPct >= 75
          ? _PC.green
          : realPct >= 40
            ? _PC.yellow
            : realPct > 0
              ? _PC.orange
              : notStarted
                ? _PC.text3
                : _PC.red;
      const status =
        realPct >= 75
          ? "STRONG"
          : realPct >= 40
            ? "OK"
            : realPct > 0
              ? "WEAK"
              : notStarted
                ? "NOT STARTED"
                : "DANGER";
      const dueSoon = revisions.filter(
        (r) =>
          chs.find((c) => c.id === r.chapterId) &&
          !r.done &&
          !r.missedPermanently &&
          r.dueDate <= addDays(today, 3),
      ).length;
      const revActivityDates = revisions
        .filter(
          (r) =>
            r.done && r.completedOn && chs.find((c) => c.id === r.chapterId),
        )
        .map((r) => r.completedOn)
        .sort()
        .reverse();
      const fallbackDates = chs
        .map((c) => c.completedDate || c.dateAdded)
        .filter(Boolean)
        .sort()
        .reverse();
      const lastDate = revActivityDates[0] || fallbackDates[0];
      const daysSince = lastDate
        ? Math.round((dateKeyToUTC(today) - dateKeyToUTC(lastDate)) / 86400000)
        : null;
      return {
        subj,
        total,
        done,
        pct: realPct,
        syllabusTotal,
        color,
        status,
        dueSoon,
        daysSince,
      };
    })
    .sort((a, b) => a.pct - b.pct);

  const danger = subjList.filter((s) => s.status === "DANGER").length;
  const strong = subjList.filter((s) => s.status === "STRONG").length;

  const cards = subjList
    .map((s) => {
      // Revision quality: % of completed chapters with all 4 revisions done
      const completedChs = (subjectMap[s.subj] || []).filter(
        (c) => c.status === "Completed",
      );
      const fullyRevised = completedChs.filter((c) =>
        [1, 3, 7, 30].every((n) =>
          revisions.find(
            (r) => r.chapterId === c.id && r.dayOffset === n && r.done,
          ),
        ),
      ).length;
      const revQualityPct =
        completedChs.length > 0
          ? Math.round((fullyRevised / completedChs.length) * 100)
          : 0;
      const lastSeenLabel =
        s.daysSince === null
          ? ""
          : s.daysSince === 0
            ? "Active today"
            : `Last active ${s.daysSince}d ago`;
      return `
    <div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${s.color};border-radius:10px;padding:12px;transition:transform 0.15s,box-shadow 0.15s;cursor:default"
      onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.5)'"
      onmouseleave="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:5px;flex-wrap:wrap">
        <div style="font-size:0.73rem;font-weight:700;color:${_PC.text};font-family:${_PC.font};line-height:1.3;min-width:0;flex:1">${sanitize(s.subj)}</div>
        <span style="font-size:0.66rem;font-weight:800;letter-spacing:0.1em;color:${s.color};background:${s.color}20;padding:3px 9px;border-radius:99px;border:1px solid ${s.color}33;white-space:nowrap;font-family:${_PC.font};flex-shrink:0">${s.status}</span>
      </div>
      <div style="margin-bottom:4px">
        <div style="display:flex;justify-content:space-between;font-size:0.70rem;color:${_PC.text2};margin-bottom:3px;font-family:${_PC.font}"><span>Done</span><span>${s.done}/${s.syllabusTotal || s.total}</span></div>
        ${_bar(s.pct, s.color, 5)}
      </div>
      ${
        completedChs.length > 0
          ? `<div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;font-size:0.70rem;color:${_PC.text2};margin-bottom:3px;font-family:${_PC.font}"><span>Fully revised</span><span>${revQualityPct}%</span></div>
        ${_bar(revQualityPct, _PC.purple, 4)}
      </div>`
          : ""
      }
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
        <span style="font-size:0.70rem;color:${_PC.text2};font-family:${_PC.font}">${lastSeenLabel}</span>
        <div style="display:flex;gap:5px;align-items:center">
          ${s.dueSoon > 0 ? `<span style="font-size:0.58rem;color:${_PC.yellow};font-family:${_PC.font}">⏰ ${s.dueSoon} due soon</span>` : ""}
        </div>
      </div>
    </div>`;
    })
    .join("");

  block.innerHTML = _progSection(
    `
    ${_progHeader("📊", "Subject Health", _PC.yellow)}
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${_statPill("Subjects", subjList.length, _PC.indigo)}
      ${_statPill("Strong", strong, _PC.green)}
      ${_statPill("Danger", danger, danger > 0 ? _PC.red : _PC.text3)}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">${cards}</div>
  `,
    `border-top:3px solid ${_PC.yellow};`,
  );
}

// ── 5. REVISION COVERAGE ──
function renderRevisionCoverage() {
  const block = document.getElementById("prog-revisions-block");
  if (!block) return;

  const completedChapters = chapters.filter(
    (c) => c.status === "Completed" && !c.isCustom,
  );
  const total = completedChapters.length;

  if (total === 0) {
    block.innerHTML = _progSection(
      _progHeader("🔁", "Revision Coverage", _PC.green) +
        _emptyState("Complete chapters to see revision coverage."),
      `border-top:3px solid ${_PC.green};`,
    );
    return;
  }

  const levels = [
    {
      n: 1,
      label: "R1",
      full: "1-Day Review",
      desc: "Next day",
      color: _PC.indigo,
    },
    {
      n: 3,
      label: "R2",
      full: "3-Day Review",
      desc: "3 days later",
      color: _PC.purple,
    },
    {
      n: 7,
      label: "R3",
      full: "Week Review",
      desc: "1 week later",
      color: _PC.yellow,
    },
    {
      n: 30,
      label: "R4",
      full: "Month Review",
      desc: "1 month later",
      color: _PC.green,
    },
  ];

  const today_rc = todayStr();
  const minAgeDays = { 1: 1, 3: 3, 7: 7, 30: 30 };
  const data = levels.map((l) => {
    const eligible = completedChapters.filter((c) => {
      const refDate = c.completedDate || c.dateAdded;
      const age = Math.round(
        (dateKeyToUTC(today_rc) - dateKeyToUTC(refDate)) / 86400000,
      );
      return age >= minAgeDays[l.n];
    });
    const done = eligible.filter((c) =>
      revisions.find(
        (r) => r.chapterId === c.id && r.dayOffset === l.n && r.done,
      ),
    ).length;
    const eligibleTotal = eligible.length;
    return {
      ...l,
      done,
      eligibleTotal,
      pct: eligibleTotal > 0 ? Math.round((done / eligibleTotal) * 100) : null,
    };
  });

  const weights = [0.1, 0.2, 0.3, 0.4];
  const scorableLevels = data.filter((d) => d.pct !== null);
  const memScore =
    scorableLevels.length === 0
      ? null
      : Math.round(
          scorableLevels.reduce(
            (acc, d) => acc + d.pct * weights[data.indexOf(d)],
            0,
          ) /
            scorableLevels.reduce(
              (acc, d) => acc + weights[data.indexOf(d)],
              0,
            ),
        );
  const memColor =
    memScore === null
      ? _PC.text3
      : memScore >= 70
        ? _PC.green
        : memScore >= 40
          ? _PC.yellow
          : _PC.red;

  const rows = data
    .map(
      (d) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid ${_PC.border}">
      <div style="width:32px;height:32px;border-radius:9px;background:${d.color}18;border:1px solid ${d.color}33;display:flex;align-items:center;justify-content:center;flex-shrink:0;flex-direction:column">
        <span style="font-size:0.6rem;font-weight:900;color:${d.color};font-family:${_PC.font};line-height:1">${d.label}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;align-items:baseline">
          <div>
            <span style="font-size:0.7rem;font-weight:700;color:${_PC.text};font-family:${_PC.font}">${d.full}</span>
            <span style="font-size:0.6rem;color:${_PC.text3};font-family:${_PC.font};margin-left:5px">${d.desc}</span>
          </div>
          <span style="font-size:0.7rem;font-weight:800;color:${d.color};font-family:${_PC.font}">${d.eligibleTotal > 0 ? d.done + "/" + d.eligibleTotal : "—"}</span>
        </div>
        ${d.pct !== null ? _bar(d.pct, d.color, 6) : _bar(0, _PC.border, 6)}
      </div>
    </div>`,
    )
    .join("");

  block.innerHTML = _progSection(
    `
    ${_progHeader("🔁", "Revision Coverage", _PC.green)}
    <div style="background:${_PC.bg4};border:1px solid ${_PC.border};border-radius:10px;padding:10px 13px;margin-bottom:14px;font-size:0.76rem;color:${_PC.text2};line-height:1.6;font-family:${_PC.font}">
      When you complete a chapter, the app schedules 4 revision sessions: next day (R1), after 3 days (R2), after 1 week (R3), and after 1 month (R4). Each bar shows how many of your completed chapters have had that revision done. The later the revision, the more it locks in memory.
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${_statPill("Chapters Done", total, _PC.indigo)}
      ${_statPill("Fully Revised", data[3].done, _PC.green)}
      ${_statPill("Memory Score", memScore === null ? "—" : memScore + "%", memColor)}
    </div>
    <div style="font-size:0.72rem;color:${_PC.text2};font-family:${_PC.font};margin-bottom:10px">Memory Score = weighted average of all 4 revision levels (R4 counts most)</div>
    <div>${rows}</div>
  `,
    `border-top:3px solid ${_PC.green};`,
  );
}

// ── 6. COACH INSIGHTS ──
function renderIntelligenceReport() {
  const block = document.getElementById("prog-report-block");
  if (!block) return;
  const today = todayStr();
  const syllabusChaps = chapters.filter((c) => !c.isCustom);
  const total = _syllabusGrandTotal() || syllabusChaps.length;
  if (total === 0) {
    block.innerHTML = _progSection(
      _progHeader("🧠", "Coach Insights", _PC.purple) +
        _emptyState("Syllabus data unavailable."),
      `border-top:3px solid ${_PC.purple};`,
    );
    return;
  }
  // Post-exam gate — suppress all study insights once the exam date has passed
  if (profile && profile.examDate) {
    const examMs = dateKeyToUTC(profile.examDate);
    const todayMs = dateKeyToUTC(today);
    if (todayMs >= examMs) {
      const daysAgo = Math.round((todayMs - examMs) / 86400000);
      block.innerHTML = _progSection(
        _progHeader("🎓", "Coach Insights", _PC.purple) +
          `<div style="text-align:center;padding:24px 16px">
          <div style="font-size:1.8rem;margin-bottom:10px">🎓</div>
          <div style="font-size:0.95rem;color:${_PC.text};font-family:${_PC.font};font-style:italic;line-height:1.7">
            ${
              daysAgo === 0
                ? "Your exam is today. You've done the work — go show it."
                : `Your exam was ${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago. Hope it went well — you put in the work.`
            }
          </div>
        </div>`,
        `border-top:3px solid ${_PC.purple};`,
      );
      return;
    }
  }

  const completed = syllabusChaps.filter(
    (c) => c.status === "Completed",
  ).length;
  const insights = [];

  // Use shared pace state — identical numbers and verdicts as Coach and Pace Tracker
  const _ps = _computePaceState();
  if (_ps && !_ps.inSilentZone) {
    const {
      effectivePace,
      paceNeededForSafe,
      onTrackForSafe,
      projectedFinish,
      safeFinishDate,
      inRevisionWindow,
      isEmergency,
      studyDaysCount,
    } = _ps;
    const remaining = total - completed;
    if (isEmergency) {
      insights.push({
        icon: "🚨",
        color: _PC.red,
        tag: "EMERGENCY",
        priority: 1,
        text: `Revision window closed with <strong style="color:${_PC.text}">${remaining}</strong> chapters remaining. Complete a chapter, do R1 next day, R2 three days later. Prioritise by weightage — highest-impact subjects first.`,
      });
    } else if (!inRevisionWindow) {
      if (paceNeededForSafe !== null && completed >= 3 && studyDaysCount >= 2) {
        const _insightsBuf =
          projectedFinish && safeFinishDate
            ? Math.round(
                (dateKeyToUTC(safeFinishDate) - dateKeyToUTC(projectedFinish)) /
                  86400000,
              )
            : 0;
        const _insightsGrace = onTrackForSafe && _insightsBuf < 0;
        if (!onTrackForSafe) {
          const gap = (paceNeededForSafe - effectivePace).toFixed(1);
          insights.push({
            icon: "⚡",
            color: _PC.red,
            tag: "URGENT",
            priority: 1,
            text: `Need <strong style="color:${_PC.text}">${paceNeededForSafe.toFixed(1)}</strong> chapters/day to hit safe window — averaging <strong style="color:${_PC.text}">${effectivePace.toFixed(1)}</strong>. Gap: <strong style="color:${_PC.red}">${gap}</strong>/day.`,
          });
        } else if (!_insightsGrace && remaining > 0) {
          insights.push({
            icon: "✅",
            color: _PC.green,
            tag: "ON TRACK",
            priority: 4,
            text: `Averaging <strong style="color:${_PC.text}">${effectivePace.toFixed(1)}</strong> chapters/day — on pace for the safe window.`,
          });
        }
      }
      if (projectedFinish && safeFinishDate) {
        const buffer = Math.round(
          (dateKeyToUTC(safeFinishDate) - dateKeyToUTC(projectedFinish)) /
            86400000,
        );
        if (onTrackForSafe) {
          // Student is on track — show projection tag only, never alongside ON TRACK
          if (buffer >= 0 && buffer <= 3) {
            insights.push({
              icon: "🟡",
              color: _PC.yellow,
              tag: "TIGHT FINISH",
              priority: 2,
              text: `Projected finish <strong style="color:${_PC.text}">${fmtDate(projectedFinish)}</strong> — only <strong style="color:${_PC.yellow}">${buffer} day${buffer !== 1 ? "s" : ""} before</strong> the safe window. No margin for error.`,
            });
          } else if (buffer > 3) {
            insights.push({
              icon: "🟢",
              color: _PC.green,
              tag: "WILL FINISH EARLY",
              priority: 4,
              text: `On track to finish <strong style="color:${_PC.text}">${fmtDate(projectedFinish)}</strong> — <strong style="color:${_PC.green}">${buffer} days ahead</strong> of the safe window.`,
            });
          } else {
            // buffer < 0 but onTrackForSafe: grace zone — proj overflows safe window, expose it
            insights.push({
              icon: "🟡",
              color: _PC.orange,
              tag: "AT RISK",
              priority: 2,
              text: `Projected finish <strong style="color:${_PC.text}">${fmtDate(projectedFinish)}</strong> — <strong style="color:${_PC.orange}">${Math.abs(buffer)} day${Math.abs(buffer) !== 1 ? "s" : ""} past</strong> the safe window. Pace is close — a small daily increase closes it.`,
            });
          }
        } else {
          // Student is not on track — show overflow warning
          insights.push({
            icon: "🔴",
            color: _PC.red,
            tag: "WILL OVERFLOW",
            priority: 1,
            text: `Projected finish <strong style="color:${_PC.text}">${fmtDate(projectedFinish)}</strong> — <strong style="color:${_PC.red}">${Math.abs(buffer)} days AFTER</strong> the safe window. Increase your daily pace.`,
          });
        }
      }
    } else {
      const _remaining = total - completed;
      insights.push({
        icon: _remaining === 0 ? "✅" : "📖",
        color: _remaining === 0 ? _PC.green : _PC.purple,
        tag: _remaining === 0 ? "SYLLABUS DONE" : "REVISION WINDOW",
        priority: _remaining === 0 ? 3 : 1,
        text:
          _remaining === 0
            ? `Every chapter done — revision mode only. Keep clearing your scheduled sessions daily.`
            : `The chapter-completion window has closed. Focus on revisions — R1 through R4 on everything completed.`,
      });
    }
  }

  // Build subjectMap from user-added syllabus chapters
  const subjectMap = {};
  syllabusChaps.forEach((c) => {
    if (!subjectMap[c.subject]) subjectMap[c.subject] = [];
    subjectMap[c.subject].push(c);
  });

  // Build FULL subject list from syllabus — coach knows every subject from day 1
  const _coachStream = profile ? profile.stream || "science" : "science";
  const _coachLang2 = profile ? profile.lang2 || "hindi" : "hindi";
  const _coachElective = profile ? profile.elective || "computer" : "computer";
  const _coachToLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  if (_coachStream === "science")
    _coachToLoad.push("physics", "chemistry", "biology");
  else _coachToLoad.push("commerce", "economics_g2");
  _coachToLoad.push(_coachLang2, _coachElective);
  const _MERGE = { History: "History & Civics", Civics: "History & Civics" };
  const _coachSeen = new Set();
  const _allSyllabusSubjects = [];
  if (window._syllabus) {
    Object.values(window._syllabus.groups).forEach((group) => {
      Object.entries(group.subjects).forEach(([key, subj]) => {
        if (!_coachToLoad.includes(key) || subj.chapters.length === 0) return;
        const dn = _MERGE[subj.name] || subj.name;
        if (!_coachSeen.has(dn)) {
          _coachSeen.add(dn);
          _allSyllabusSubjects.push(dn);
        }
      });
    });
  }

  // How many subjects has the user actively started? — drives the behaviour threshold
  const startedSubjectCount = Object.keys(subjectMap).length;

  // Loop ALL syllabus subjects — not just user-added ones
  _allSyllabusSubjects.forEach((subj) => {
    const chs = subjectMap[subj] || [];

    if (chs.length === 0) {
      // Completely untouched subject — no user-added chapters at all
      const syllTotal = _syllabusTotal(subj) || "?";
      const profileAgeDays =
        profile && profile.dateCreated
          ? Math.round(
              (dateKeyToUTC(today) - dateKeyToUTC(profile.dateCreated)) /
                86400000,
            )
          : 999;
      if (startedSubjectCount >= 4 && profileAgeDays >= 7) {
        // User is actively studying other subjects — this silence is now meaningful
        insights.push({
          icon: "🚨",
          color: _PC.red,
          tag: "NEGLECTED",
          priority: 1,
          text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — not a single chapter added yet. ${syllTotal} chapters waiting.`,
        });
      } else if (startedSubjectCount >= 1 && profileAgeDays >= 7) {
        // User just started — gentle nudge, not an alarm
        insights.push({
          icon: "📚",
          color: _PC.text3,
          tag: "NOT STARTED",
          priority: 5,
          text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — ${syllTotal} chapters, none started yet.`,
        });
      }
      return;
    }

    // Subject has user-added chapters — use last activity date as before
    const revDates = revisions
      .filter(
        (r) => r.done && r.completedOn && chs.find((c) => c.id === r.chapterId),
      )
      .map((r) => r.completedOn)
      .sort()
      .reverse();
    const addedDates = chs
      .map((c) => c.completedDate || c.dateAdded)
      .filter(Boolean)
      .sort()
      .reverse();
    const lastDate = revDates[0] || addedDates[0];
    if (!lastDate) return;
    const daysSince = Math.round(
      (dateKeyToUTC(today) - dateKeyToUTC(lastDate)) / 86400000,
    );
    const done = chs.filter((c) => c.status === "Completed").length;
    if (daysSince > 14) {
      insights.push({
        icon: "🚨",
        color: _PC.red,
        tag: "NEGLECTED",
        priority: 1,
        text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — ${daysSince} days untouched. ${chs.length - done} chapters remaining.`,
      });
    } else if (daysSince > 7) {
      insights.push({
        icon: "😬",
        color: _PC.orange,
        tag: "SLIPPING",
        priority: 2,
        text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> hasn't been touched in ${daysSince} days. ${chs.length - done} left.`,
      });
    }
  });

  const completedChapters = syllabusChaps.filter((c) => {
    if (c.status !== "Completed") return false;
    const refDate = c.completedDate || c.dateAdded;
    if (!refDate) return false;
    return (
      Math.round((dateKeyToUTC(today) - dateKeyToUTC(refDate)) / 86400000) > 30
    );
  });
  const fullyRevised = completedChapters.filter((c) =>
    [1, 3, 7, 30].every((n) =>
      revisions.find(
        (r) => r.chapterId === c.id && r.dayOffset === n && r.done,
      ),
    ),
  ).length;
  if (
    completedChapters.length >= 3 &&
    fullyRevised / completedChapters.length < 0.3
  ) {
    insights.push({
      icon: "📉",
      color: _PC.yellow,
      tag: "LOW RETENTION",
      priority: 2,
      text: `${completed} chapters done, but only <strong style="color:${_PC.text}">${fullyRevised}</strong> fully revised (chapters older than 30 days). Memory fades without revision.`,
    });
  }
  // Also catch recent chapters (under 30 days) with high permanent miss rate
  // This fires for students who rushed all chapters but ignored revisions entirely
  const _recentCompleted = syllabusChaps.filter((c) => {
    if (c.status !== "Completed") return false;
    const refDate = c.completedDate || c.dateAdded;
    if (!refDate) return false;
    const _age = Math.round(
      (dateKeyToUTC(today) - dateKeyToUTC(refDate)) / 86400000,
    );
    return _age >= 1 && _age <= 30;
  });
  if (_recentCompleted.length >= 5) {
    const _r1Settled = _recentCompleted.filter((c) => {
      const _r1 = revisions.find(
        (r) => r.chapterId === c.id && r.dayOffset === 1,
      );
      return _r1 && (_r1.done || _r1.missedPermanently);
    });
    const _r1Done = _r1Settled.filter((c) => {
      const _r1 = revisions.find(
        (r) => r.chapterId === c.id && r.dayOffset === 1,
      );
      return _r1 && _r1.done;
    }).length;
    if (_r1Settled.length >= 5 && _r1Done / _r1Settled.length < 0.3) {
      insights.push({
        icon: "📉",
        color: _PC.yellow,
        tag: "LOW RETENTION",
        priority: 2,
        text: `${_r1Settled.length - _r1Done} of ${_r1Settled.length} recently completed chapters missed their first revision. R1 is the most critical — without it, memory of a chapter drops sharply within days.`,
      });
    }
  }

  for (let d = 1; d <= 3; d++) {
    const futureDate = addDays(today, d);
    const dueCount = revisions.filter(
      (r) => !r.done && !r.missedPermanently && r.dueDate === futureDate,
    ).length;
    if (dueCount >= 4) {
      insights.push({
        icon: "📅",
        color: _PC.orange,
        tag: "PILE-UP WARNING",
        priority: 2,
        text: `<strong style="color:${_PC.text}">${dueCount} revisions</strong> due on ${fmtDate(futureDate)}. Consider completing some early.`,
      });
      break;
    }
  }

  let bestSubj = null,
    bestPct = -1;
  Object.keys(subjectMap).forEach((subj) => {
    const syllTotal = _syllabusTotal(subj) || subjectMap[subj].length;
    const pct =
      subjectMap[subj].filter((c) => c.status === "Completed").length /
      syllTotal;
    if (pct > bestPct) {
      bestPct = pct;
      bestSubj = subj;
    }
  });
  if (bestSubj && bestPct >= 0.6 && subjectMap[bestSubj].length >= 3) {
    const chs = subjectMap[bestSubj];
    insights.push({
      icon: "🔥",
      color: _PC.green,
      tag: "BEST SUBJECT",
      priority: 4,
      text: `<strong style="color:${_PC.text}">${sanitize(bestSubj)}</strong> — ${chs.filter((c) => c.status === "Completed").length}/${_syllabusTotal(bestSubj) || chs.length} done. Keep this energy.`,
    });
  }

  const weakCount = chapters.filter((c) => c.isWeak).length;
  if (weakCount > 0) {
    insights.push({
      icon: "⚠️",
      color: _PC.yellow,
      tag: "WEAK SPOTS",
      priority: 2,
      text: `<strong style="color:${_PC.text}">${weakCount}</strong> chapter${weakCount > 1 ? "s" : ""} flagged as weak. These need extra revision cycles.`,
    });
  }

  // NOT ADDED YET — only for subjects partially tracked (>0 added but gaps remain)
  // Fully untouched subjects (0 added) are already handled above by NEGLECTED/NOT STARTED
  if (window._syllabus) {
    _allSyllabusSubjects.forEach((subj) => {
      const syllTotal = _syllabusTotal(subj);
      const added = (subjectMap[subj] || []).length;
      if (
        syllTotal &&
        added > 0 &&
        added < syllTotal &&
        syllTotal - added >= 3
      ) {
        insights.push({
          icon: "📚",
          color: _PC.indigo,
          tag: "NOT ADDED YET",
          priority: 3,
          text: `<strong style="color:${_PC.text}">${sanitize(subj)}</strong> — ${added} of ${syllTotal} chapters tracked. <strong style="color:${_PC.indigo}">${syllTotal - added} missing</strong>.`,
        });
      }
    });
  }

  insights.sort((a, b) => (a.priority || 3) - (b.priority || 3));

  const shown = insights.slice(0, 10);
  const cards = shown
    .map(
      (i, idx) => `
    <div style="display:flex;gap:12px;padding:12px;background:${_PC.bg4};border:1px solid ${_PC.border};border-left:3px solid ${i.color};border-radius:10px;animation:progFadeUp 0.4s cubic-bezier(.4,0,.2,1) ${(idx * 0.06).toFixed(2)}s both">
      <span style="font-size:1.05rem;flex-shrink:0;margin-top:1px">${i.icon}</span>
      <div style="flex:1;min-width:0">
        <span style="font-size:0.54rem;font-weight:800;letter-spacing:0.1em;color:${i.color};background:${i.color}18;padding:2px 7px;border-radius:99px;display:inline-block;margin-bottom:5px;border:1px solid ${i.color}33;font-family:${_PC.font}">${i.tag}</span>
        <div style="font-size:0.75rem;color:${_PC.text2};line-height:1.6;font-family:${_PC.font}">${i.text}</div>
      </div>
    </div>`,
    )
    .join("");

  block.innerHTML = _progSection(
    `
    ${_progHeader(
      "🧠",
      "Coach Insights",
      _PC.purple,
      `<span style="font-size:0.6rem;color:${_PC.text3};font-family:${_PC.font}">${shown.length} insight${shown.length !== 1 ? "s" : ""}</span>`,
    )}
    ${
      insights.length > 0
        ? `<div style="display:flex;flex-direction:column;gap:8px">${cards}</div>`
        : _emptyState("Not enough data yet.")
    }
  `,
    `border-top:3px solid ${_PC.purple};`,
  );
}

// ── TOGGLE WEAK ──
document.getElementById("weakToggle").addEventListener("change", function () {
  document.getElementById("weakLabel").textContent = this.checked
    ? "Yes ⚠"
    : "No";
});

// ── INIT ──
function initApp() {
  // Backfill dateCreated for profiles created before this field existed
  // Without this, old users get profileAgeDays = 999 and see NEGLECTED spam on first open
  if (profile && !profile.dateCreated) {
    profile.dateCreated = todayStr();
    localStorage.setItem("st_profile", JSON.stringify(profile));
  }
  if (profile && !profile.setupSeen && profile.examDate && profile.deadline) {
    profile.setupSeen = true;
    localStorage.setItem("st_profile", JSON.stringify(profile));
  }
  rebuildSubjectsFromSyllabus();
  populateSubjectDropdown();
  updateChapterSuggestions();
  processMissedRevisions();
  renderAll();
  checkSyllabusProfile();
  // Only render progress on boot if the tab is already active (e.g. after a refresh on that tab)
  if (document.getElementById("tab-progress").classList.contains("active"))
    renderProgress();
  if (document.getElementById("tab-coach").classList.contains("active"))
    renderCoachTab();
  showNotifModal();
  registerSW();
  checkNotifBanner();
  scheduleDailyReminder();
  if (groupCode) {
    renderGroup();
    pushGroupUpdate(true);
  }
}
// ── PROFILE SIDEBAR FUNCTIONS ──
function toggleGroupCode() {
  const panel = document.getElementById("groupCodePanel");
  const btn = document.getElementById("showCodeBtn");
  const isOpen = panel.classList.contains("open");
  panel.classList.toggle("open");
  btn.textContent = isOpen ? "🔑 Show Group Code" : "🔒 Hide Code";
}

function toggleDrawerAccordion(id) {
  const body = document.getElementById(id);
  const chevron = document.getElementById(id + "-chevron");
  if (!body) return;
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  if (chevron) chevron.classList.toggle("acc-open", !isOpen);
}

function openProfile() {
  if (!profile) {
    showToast(
      "Pehle onboarding complete karo!",
      "error",
      "Profile tab access karne ke liye apna naam set karo.",
    );
    return;
  }
  document.getElementById("prof-name").value = profile.name || "";
  document.getElementById("prof-class").value = profile.cls || "10";
  document.getElementById("prof-exam").value = profile.examDate || "";
  if (document.getElementById("prof-stream"))
    document.getElementById("prof-stream").value = profile.stream || "science";
  if (document.getElementById("prof-lang2"))
    document.getElementById("prof-lang2").value = profile.lang2 || "hindi";
  if (document.getElementById("prof-elective"))
    document.getElementById("prof-elective").value =
      profile.elective || "computer";
  if (document.getElementById("prof-deadline")) {
    document.getElementById("prof-deadline").value = profile.deadline || "";
    if (profile.examDate) updateProfileDeadlineLimits();
  }
  document.getElementById("prof-display-name").textContent =
    profile.name || "—";
  const clsMap = { 10: "Class 10 (ICSE)", other: "Other" };
  document.getElementById("prof-display-sub").textContent =
    clsMap[profile.cls] || profile.cls || "—";
  document.getElementById("prof-stat-chapters").textContent = chapters.length;
  document.getElementById("prof-stat-streak").textContent = streak.count;
  document.getElementById("prof-stat-coins").textContent = coins || 0;
  document.getElementById("prof-stat-revs").textContent = revisions.filter(
    (r) => r.done,
  ).length;
  // exam countdown (IST / Kolkata only)
  if (profile.examDate) {
    const today = todayStr(); // IST YYYY-MM-DD
    const diff = Math.round(
      (dateKeyToUTC(profile.examDate) - dateKeyToUTC(today)) / 86400000,
    );

    if (diff > 0) {
      document.getElementById("examCountdownBlock").style.display = "flex";
      document.getElementById("prof-exam-days").textContent = diff + " days";
    } else {
      document.getElementById("examCountdownBlock").style.display = "none";
    }
  } else {
    document.getElementById("examCountdownBlock").style.display = "none";
  }
  // group info — now shown in group tab, not sidebar
  // open
  setProfileEditMode(false);
  document.getElementById("profileOverlay").style.display = "block";
  requestAnimationFrame(() => document.body.classList.add("prof-open"));
}

function closeProfile() {
  document.body.classList.remove("prof-open");
  // reset profile accordion to closed
  const accBody = document.getElementById("acc-profile");
  const accChevron = document.getElementById("acc-profile-chevron");
  if (accBody) accBody.style.display = "none";
  if (accChevron) accChevron.classList.remove("acc-open");
  setTimeout(() => {
    document.getElementById("profileOverlay").style.display = "none";
  }, 280);
}

function saveProfile() {
  const name = document.getElementById("prof-name").value.trim();
  if (!name) {
    showToast(
      "Bina naam ke to bhoot bhi nahi aate! 👻🚫",
      "error",
      "Pehle naam toh likho.",
    );
    return;
  }
  const newDeadline = document.getElementById("prof-deadline")
    ? document.getElementById("prof-deadline").value
    : "";
  const newExam = document.getElementById("prof-exam").value;
  if (newExam && newDeadline) {
    const err = _validateDeadline(newDeadline, newExam);
    if (err) {
      showToast(err, "error", "Invalid deadline");
      return;
    }
  }
  const oldStream = profile.stream;
  const oldLang2 = profile.lang2;
  const oldElective = profile.elective;
  profile.name = name;
  profile.cls = document.getElementById("prof-class").value;
  profile.examDate = newExam;
  profile.deadline = newDeadline || "";
  if (document.getElementById("prof-stream"))
    profile.stream = document.getElementById("prof-stream").value;
  if (document.getElementById("prof-lang2"))
    profile.lang2 = document.getElementById("prof-lang2").value;
  if (document.getElementById("prof-elective"))
    profile.elective = document.getElementById("prof-elective").value;
  if (profile.examDate && profile.deadline) profile.setupSeen = true;
  localStorage.setItem("st_profile", JSON.stringify(profile));
  const streamChanged =
    oldStream !== profile.stream ||
    oldLang2 !== profile.lang2 ||
    oldElective !== profile.elective;
  rebuildSubjectsFromSyllabus();
  if (streamChanged) {
    // subjects array is now rebuilt to reflect new stream/lang2/elective
    const validSubjectNames = new Set(subjects);
    // Wipe non-custom chapters that belong to subjects no longer in the new selection
    // (covers elective swap, lang2 swap, and stream swap — all identical logic)
    const removedIds = new Set(
      chapters
        .filter((c) => !c.isCustom && !validSubjectNames.has(c.subject))
        .map((c) => c.id),
    );
    chapters = chapters.filter((c) => !removedIds.has(c.id));
    revisions = revisions.filter((r) => !removedIds.has(r.chapterId));

    // Clean up missedRevisions — legacy entries may lack chapterId so also filter by subject name
    missedRevisions = missedRevisions.filter(
      (r) => !removedIds.has(r.chapterId) && validSubjectNames.has(r.subject),
    );
    // weeklyLog and streak intentionally kept:
    // bars show real study activity regardless of which subject — history belongs to the user
    // streak tracks daily consistency — swapping a subject doesn't undo legitimate study days
    save();
    showToast(
      "Subject swap! 🔄",
      "",
      "Old subject chapters cleared. Add new ones to get started.",
    );
  }
  // Rebuild Add tab dropdown and chapter suggestions with the new subject list
  populateSubjectDropdown();
  updateChapterSuggestions();
  if (groupCode && name !== groupName) {
    groupName = name;
    localStorage.setItem("st_grpname", name);
    pushGroupUpdate(false);
  }
  playSaveSound();
  showToast("Pehchaan surakshit! 🏆👤", "", "Ab isi naam se top karna hai.");
  closeProfile();
  renderAll();
}

function setProfileEditMode(isEditing) {
  const block = document.getElementById("profileEditBlock");
  const nameInput = document.getElementById("prof-name");
  const classSelect = document.getElementById("prof-class");
  const examInput = document.getElementById("prof-exam");
  const actions = document.getElementById("profileEditActions");
  const editBtn = document.getElementById("editProfileBtn");

  if (
    !block ||
    !nameInput ||
    !classSelect ||
    !examInput ||
    !actions ||
    !editBtn
  )
    return;

  nameInput.disabled = !isEditing;
  classSelect.disabled = !isEditing;
  examInput.disabled = !isEditing;
  const deadlineInput = document.getElementById("prof-deadline");
  if (deadlineInput) deadlineInput.disabled = !isEditing;
  const streamInput = document.getElementById("prof-stream");
  if (streamInput) streamInput.disabled = !isEditing;
  const lang2Input = document.getElementById("prof-lang2");
  if (lang2Input) lang2Input.disabled = !isEditing;
  const electiveInput = document.getElementById("prof-elective");
  if (electiveInput) electiveInput.disabled = !isEditing;

  block.classList.toggle("profile-readonly", !isEditing);
  actions.style.display = isEditing ? "flex" : "none";
  editBtn.textContent = isEditing ? "✏️ Editing" : "✏️ Edit";
}

function toggleProfileEdit() {
  const nameInput = document.getElementById("prof-name");
  if (!nameInput) return;
  setProfileEditMode(nameInput.disabled); // if disabled, switch to editing
}

function cancelProfileEdit() {
  if (!profile) return;

  document.getElementById("prof-name").value = profile.name || "";
  document.getElementById("prof-class").value = profile.cls || "10";
  document.getElementById("prof-exam").value = profile.examDate || "";
  if (document.getElementById("prof-deadline")) {
    document.getElementById("prof-deadline").value = profile.deadline || "";
  }
  if (document.getElementById("prof-stream"))
    document.getElementById("prof-stream").value = profile.stream || "science";
  if (document.getElementById("prof-lang2"))
    document.getElementById("prof-lang2").value = profile.lang2 || "hindi";
  if (document.getElementById("prof-elective"))
    document.getElementById("prof-elective").value =
      profile.elective || "computer";
  setProfileEditMode(false);
  showToast(
    "Purani yaadein hi achhi thin... 🔙🚫",
    "info",
    "Badlav cancel kar diya.",
  );
}

// Unified swipe handler — open from left edge, close by swiping left
(function () {
  let tx = 0,
    ty = 0,
    trackOpen = false;
  const EDGE = 20;
  document.addEventListener(
    "touchstart",
    (e) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      trackOpen = tx < EDGE;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = Math.abs(e.changedTouches[0].clientY - ty);
      if (document.body.classList.contains("prof-open")) {
        if (dx < -60) closeProfile();
      } else if (trackOpen && dx > 48 && dy < 80) {
        openProfile();
      }
      trackOpen = false;
    },
    { passive: true },
  );
})();

async function loadSyllabusAndInit() {
  try {
    const resp = await fetch("syllabus.json");
    window._syllabus = await resp.json();
  } catch (e) {
    window._syllabus = null;
    console.log("Syllabus load failed:", e);
  }
  _hardResetIfNeeded();
  migrateOldData();
  initApp();
}

function _hardResetIfNeeded() {
  localStorage.setItem("st_v2_reset", "1");
}

function migrateOldData() {
  let dirty = false;

  // Migration 0 — class 9 no longer supported, bump to 10
  // Does NOT need syllabus — runs always
  if (profile && profile.cls === "9") {
    profile.cls = "10";
    dirty = true;
  }

  // Migration 2 — fix old History/Civics chapters stored with raw subject names
  // Does NOT need syllabus — runs always
  chapters.forEach((ch) => {
    if (ch.subject === "History" || ch.subject === "Civics") {
      ch.subject = "History & Civics";
      dirty = true;
    }
  });
  // Fix revisions too
  revisions.forEach((r) => {
    if (r.subject === "History" || r.subject === "Civics") {
      r.subject = "History & Civics";
      dirty = true;
    }
  });

  // Syllabus-dependent migrations — skip only these if syllabus failed to load
  if (!window._syllabus) {
    if (dirty) save();
    return;
  }

  // Migration 1 — backfill isCustom on all existing chapters that don't have it
  // Needs syllabus to check chapter names against known list
  const needsCustomCheck = chapters.filter((c) => c.isCustom === undefined);
  if (needsCustomCheck.length > 0) {
    const aliases = { "History & Civics": ["History", "Civics"] };
    needsCustomCheck.forEach((ch) => {
      const lookFor = aliases[ch.subject] || [ch.subject];
      let found = false;
      outer: for (const group of Object.values(window._syllabus.groups)) {
        for (const subj of Object.values(group.subjects)) {
          if (lookFor.includes(subj.name)) {
            for (const s of subj.chapters) {
              if (
                s.name.trim().toLowerCase() === ch.name.trim().toLowerCase()
              ) {
                found = true;
                break outer;
              }
            }
          }
        }
      }
      ch.isCustom = !found;
      dirty = true;
    });
  }

  // Migration 3 — rebuild subjects list if profile exists but subjects still has raw defaults
  if (!localStorage.getItem("st_m3_done")) {
    localStorage.setItem("st_m3_done", "1");
    if (profile && profile.stream) {
      if (subjects.includes("History") || subjects.includes("Civics")) {
        dirty = true;
      }
    }
  }
  // ⚠️  DELETED MIGRATION WARNING (M4, never shipped — removed March 2026)
  // M4 was written to wipe ghost chapters auto-loaded by autoLoadSyllabusChapters_DISABLED.
  // It was NEVER deployed. Its guard key (st_m4_done) therefore does not exist on any device.
  // The wipe block has been removed because:
  //   1. The ghost-chapter bug was fixed at source (the function is now _DISABLED).
  //   2. Since st_m4_done was never set anywhere, the wipe would fire for EVERY user
  //      on first open — destroying all real data with no recovery path.
  //
  // LESSON FOR ALL FUTURE MIGRATIONS THAT WIPE DATA:
  //   Step 1 — Check a DATA SIGNATURE specific to the broken state, not just a key:
  //     const isGhostData = chapters.length > 0 &&
  //       chapters.every(c => !c.isCustom && c.status === "Not Started");
  //   Step 2 — Then and only then, gate on the guard key:
  //     if (!localStorage.getItem("st_mX_done")) {
  //       localStorage.setItem("st_mX_done", "1");
  //       if (isGhostData) { /* wipe */ }
  //     }
  //   This way a user with real data on a new device is never wiped.

  if (dirty) save();
}

function autoLoadSyllabusChapters_DISABLED() {
  if (!window._syllabus || !profile) return;

  const stream = profile.stream || "science";
  const lang2 = profile.lang2 || "hindi";
  const elective = profile.elective || "computer";

  // Build the list of subject keys to load
  const toLoad = [
    "english_lang",
    "english_lit",
    "history",
    "civics",
    "geography",
    "maths",
  ];
  if (stream === "science") {
    toLoad.push("physics", "chemistry", "biology");
  } else {
    toLoad.push("commerce", "economics_g2");
  }
  toLoad.push(lang2); // "hindi" or "bengali"
  toLoad.push(elective); // "computer", "eco_apps", or "physical_ed"

  // Collect all subject definitions from syllabus
  const subjDefs = {};
  const groups = window._syllabus.groups;
  Object.values(groups).forEach((group) => {
    Object.entries(group.subjects).forEach(([key, subj]) => {
      subjDefs[key] = subj;
    });
  });

  // Preserve custom chapters and their revisions — only wipe syllabus chapters
  const customChapters = chapters.filter((c) => c.isCustom);
  const customIds = new Set(customChapters.map((c) => c.id));
  chapters = customChapters;
  revisions = revisions.filter((r) => customIds.has(r.chapterId));

  // History and Civics are separate in syllabus but merged as one subject in app
  const SUBJECT_MERGE = {
    History: "History & Civics",
    Civics: "History & Civics",
  };

  // Add chapters for each selected subject (skip empty ones)
  const today = todayStr();
  toLoad.forEach((key) => {
    const subj = subjDefs[key];
    if (!subj || subj.chapters.length === 0) return;
    const displayName = SUBJECT_MERGE[subj.name] || subj.name;
    subj.chapters.forEach((ch) => {
      chapters.push({
        id: uid(),
        subject: displayName,
        name: ch.name,
        status: "Not Started",
        isWeak: false,
        isCustom: false,
        dateAdded: today,
      });
    });
  });

  // Also rebuild subjects list to match (deduplicated, merged)
  subjects = [
    ...new Set(
      toLoad
        .filter((key) => subjDefs[key] && subjDefs[key].chapters.length > 0)
        .map((key) => SUBJECT_MERGE[subjDefs[key].name] || subjDefs[key].name),
    ),
  ];

  save();
  localStorage.setItem("st_syllabus_loaded", "1");
}

function init() {
  if (!checkOnboard()) return;
  loadSyllabusAndInit();
}
document.addEventListener(
  "click",
  function onceUnlock() {
    unlockSound();
    primeSound();
  },
  { once: true },
);

document.addEventListener(
  "touchstart",
  function onceUnlockTouch() {
    unlockSound();
    primeSound();
  },
  { once: true },
);
init();
