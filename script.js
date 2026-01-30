(function () {
  const API_BASE =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://tubulartutor.onrender.com";

  const TOKEN_KEY = "learning_matrix_token";
  const ON_TRACK_START = new Date("2025-08-13T00:00:00Z");
  const ON_TRACK_END = new Date("2026-05-22T00:00:00Z");

  let progressChart = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (token) headers["Authorization"] = "Bearer " + token;
    const url = API_BASE + path;
    const res = await fetch(url, { ...options, headers });
    const contentType = res.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok) {
      const msg = data?.error || (res.status === 404 ? "Not found. Is the TubularTutor server running at " + API_BASE + "?" : "Request failed");
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function show(el) {
    el.classList.remove("hidden");
  }
  function hide(el) {
    el.classList.add("hidden");
  }

  function showView(name) {
    document.getElementById("login-section").classList.toggle("hidden", name !== "login");
    document.getElementById("student-section").classList.toggle("hidden", name !== "student");
    document.getElementById("admin-section").classList.toggle("hidden", name !== "admin");
  }

  function showLoginError(msg) {
    const el = document.getElementById("login-error");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    showLoginError("");
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);
      await loadApp();
    } catch (err) {
      showLoginError(err.data?.error || err.message || "Login failed");
    }
  });

  async function loadApp() {
    const token = getToken();
    if (!token) {
      showView("login");
      return;
    }
    try {
      const me = await api("/api/auth/me");
      if (me.role === "admin") {
        showView("admin");
        loadAdmin();
      } else {
        showView("student");
        document.getElementById("student-name").textContent = me.displayName || me.username;
        renderProgressForm(me.courses || []);
        await loadProgressChart(me.studentId);
      }
    } catch (err) {
      if (err.status === 401) {
        setToken(null);
        showView("login");
      } else {
        showView("login");
        showLoginError("Session invalid");
      }
    }
  }

  function renderProgressForm(courses) {
    const container = document.getElementById("progress-fields");
    container.innerHTML = "";
    courses.forEach((c) => {
      const label = document.createElement("label");
      label.textContent = c.name + " (%)";
      label.htmlFor = "pct-" + c.id;
      const input = document.createElement("input");
      input.type = "number";
      input.min = 0;
      input.max = 100;
      input.step = 0.5;
      input.id = "pct-" + c.id;
      input.dataset.courseId = c.id;
      input.placeholder = "0–100";
      container.appendChild(label);
      container.appendChild(input);
    });
  }

  document.getElementById("progress-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("progress-status");
    statusEl.textContent = "";
    const inputs = document.querySelectorAll("#progress-fields input[data-course-id]");
    let submitted = 0;
    for (const input of inputs) {
      const val = input.value.trim();
      if (val === "") continue;
      const pct = parseFloat(val);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) continue;
      try {
        await api("/api/progress", {
          method: "POST",
          body: JSON.stringify({ courseId: parseInt(input.dataset.courseId, 10), percentage: pct }),
        });
        submitted++;
        input.value = "";
      } catch (err) {
        statusEl.textContent = err.data?.error || "Failed to save some progress";
        statusEl.classList.add("error");
        return;
      }
    }
    statusEl.textContent = submitted ? "Progress saved." : "Enter at least one percentage.";
    statusEl.classList.remove("error");
    const me = await api("/api/auth/me");
    if (me.studentId) await loadProgressChart(me.studentId);
  });

  async function loadProgressChart(studentId) {
    if (!studentId) return;
    const progress = await api("/api/students/" + studentId + "/progress");
    const courses = await api("/api/auth/me").then((me) => me.courses || []);
    const byCourse = {};
    courses.forEach((c) => {
      byCourse[c.id] = { name: c.name, color: c.color || "#666", points: [] };
    });
    progress.forEach((p) => {
      if (byCourse[p.course_id]) {
        byCourse[p.course_id].points.push({
          x: new Date(p.recorded_at).getTime(),
          y: parseFloat(p.percentage),
        });
      }
    });
    const datasets = Object.entries(byCourse).map(([id, d]) => ({
      label: d.name,
      data: d.points.sort((a, b) => a.x - b.x),
      borderColor: d.color,
      backgroundColor: d.color + "20",
      fill: false,
      tension: 0.2,
    }));
    const onTrackPoints = [
      { x: ON_TRACK_START.getTime(), y: 0 },
      { x: ON_TRACK_END.getTime(), y: 100 },
    ];
    datasets.push({
      label: "On track (target)",
      data: onTrackPoints,
      borderColor: "#999",
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0,
      tension: 0,
    });
    const canvas = document.getElementById("progress-chart");
    if (progressChart) progressChart.destroy();
    progressChart = new Chart(canvas, {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        scales: {
          x: {
            type: "time",
            time: { unit: "month" },
            title: { display: true, text: "Date" },
          },
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: "Completion %" },
          },
        },
      },
    });
  }

  document.getElementById("logout-btn").addEventListener("click", () => {
    setToken(null);
    showView("login");
  });

  async function loadAdmin() {
    try {
      const [students, courses] = await Promise.all([
        api("/api/admin/students"),
        api("/api/admin/courses"),
      ]);
      const studentsEl = document.getElementById("admin-students");
      studentsEl.innerHTML =
        "<ul>" +
        students.map((s) => "<li>" + s.display_name + " (" + s.username + ")</li>").join("") +
        "</ul>";
      const coursesEl = document.getElementById("admin-courses");
      coursesEl.innerHTML =
        "<ul>" +
        courses.map((c) => "<li>" + c.name + (c.color ? " " + c.color : "") + "</li>").join("") +
        "</ul>";
    } catch (err) {
      document.getElementById("admin-students").innerHTML =
        "<p class='error'>Failed to load: " + (err.data?.error || err.message) + "</p>";
    }
  }

  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    setToken(null);
    showView("login");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadApp);
  } else {
    loadApp();
  }
})();
