(function () {
  const API_BASE =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://tubulartutor.onrender.com";

  const TOKEN_KEY = "learning_matrix_token";
  const ON_TRACK_START = new Date("2025-08-13T00:00:00Z");
  const ON_TRACK_END = new Date("2026-05-22T00:00:00Z");

  let progressChart = null;
  let adminProgressChart = null;

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
          body: JSON.stringify({
            courseId: parseInt(input.dataset.courseId, 10),
            percentage: pct,
            date: new Date().toISOString().slice(0, 10),
          }),
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

  function showAdminMessage(elId, msg, isError) {
    const el = document.getElementById(elId);
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
    el.classList.toggle("error", !!isError);
  }

  async function loadAdmin() {
    try {
      const [students, courses] = await Promise.all([
        api("/api/admin/students"),
        api("/api/admin/courses"),
      ]);
      renderAdminStudents(students, courses);
      renderAdminCourses(courses);
      populateAdminStudentSelect(students);
      showAdminMessage("admin-students-message", "");
      showAdminMessage("admin-courses-message", "");
    } catch (err) {
      document.getElementById("admin-students").innerHTML =
        "<p class='error'>Failed to load: " + (err.data?.error || err.message) + "</p>";
    }
  }

  function populateAdminStudentSelect(students) {
    const select = document.getElementById("admin-student-select");
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a student…";
    select.appendChild(placeholder);
    students.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = (s.display_name || s.username) + " (" + s.username + ")";
      select.appendChild(opt);
    });
    if (adminProgressChart) {
      adminProgressChart.destroy();
      adminProgressChart = null;
    }
  }

  async function onAdminStudentSelectChange() {
    const select = document.getElementById("admin-student-select");
    const studentId = select.value ? parseInt(select.value, 10) : null;
    if (!studentId) {
      if (adminProgressChart) {
        adminProgressChart.destroy();
        adminProgressChart = null;
      }
      setAdminProgressChartMessage("", false);
      document.getElementById("admin-progress-entries-empty").classList.add("hidden");
      document.getElementById("admin-progress-entries").innerHTML = "";
      return;
    }
    await loadAdminProgressChart(studentId);
  }

  function setAdminProgressChartMessage(msg, isError) {
    const el = document.getElementById("admin-progress-chart-message");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
    el.classList.toggle("error", !!isError);
  }

  async function loadAdminProgressChart(studentId) {
    const canvas = document.getElementById("admin-progress-chart");
    if (adminProgressChart) {
      adminProgressChart.destroy();
      adminProgressChart = null;
    }
    setAdminProgressChartMessage("Loading…", false);
    try {
      const [progress, courses] = await Promise.all([
        api("/api/students/" + studentId + "/progress"),
        api("/api/students/" + studentId + "/courses"),
      ]);
      setAdminProgressChartMessage("", false);
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
      adminProgressChart = new Chart(canvas, {
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
      renderAdminProgressEntries(studentId, progress, courses);
    } catch (err) {
      setAdminProgressChartMessage("Failed to load progress: " + (err.data?.error || err.message), true);
      document.getElementById("admin-progress-entries-empty").classList.add("hidden");
      document.getElementById("admin-progress-entries").innerHTML = "";
    }
  }

  function renderAdminProgressEntries(studentId, progress, courses) {
    const container = document.getElementById("admin-progress-entries");
    const emptyEl = document.getElementById("admin-progress-entries-empty");
    container.innerHTML = "";
    const courseById = Object.fromEntries(courses.map((c) => [c.id, c]));
    const sorted = progress.slice().sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    if (sorted.length === 0) {
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    const table = document.createElement("table");
    table.className = "admin-progress-entries-table";
    table.innerHTML = "<thead><tr><th>Date</th><th>Course</th><th>%</th><th></th></tr></thead><tbody></tbody>";
    const tbody = table.querySelector("tbody");
    sorted.forEach((p) => {
      const course = courseById[p.course_id];
      const name = course ? course.name : "Course " + p.course_id;
      const dateStr = formatProgressDate(p.recorded_at);
      const tr = document.createElement("tr");
      tr.dataset.progressId = p.id;
      tr.innerHTML =
        "<td>" +
        escapeHtml(dateStr) +
        "</td><td>" +
        escapeHtml(name) +
        "</td><td>" +
        escapeHtml(String(p.percentage)) +
        "</td><td>" +
        (p.id != null
          ? "<button type='button' class='admin-btn delete-progress-btn' title='Delete this entry'>Delete</button>"
          : "<span class='muted'>—</span>") +
        "</td>";
      tbody.appendChild(tr);
      const btn = tr.querySelector(".delete-progress-btn");
      if (btn) btn.addEventListener("click", () => onDeleteProgressEntry(studentId, p.id));
    });
    container.appendChild(table);
  }

  function formatProgressDate(recordedAt) {
    const d = new Date(recordedAt);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function onDeleteProgressEntry(studentId, progressId) {
    if (!confirm("Delete this progress entry? This cannot be undone.")) return;
    try {
      await api("/api/admin/students/" + studentId + "/progress/" + progressId, { method: "DELETE" });
      await loadAdminProgressChart(studentId);
    } catch (err) {
      setAdminProgressChartMessage("Failed to delete: " + (err.data?.error || err.message), true);
    }
  }

  function renderAdminStudents(students, courses) {
    const container = document.getElementById("admin-students");
    container.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "admin-list";
    students.forEach((s) => {
      const li = document.createElement("li");
      li.dataset.studentId = s.id;
      li.dataset.userId = s.user_id;
      li.innerHTML =
        "<span class='admin-item-name'>" +
        escapeHtml(s.display_name) +
        " (" +
        escapeHtml(s.username) +
        ")</span> " +
        "<button type='button' class='admin-btn edit-student-btn'>Edit</button> " +
        "<button type='button' class='admin-btn delete-student-btn'>Delete</button>";
      ul.appendChild(li);
    });
    container.appendChild(ul);

    container.querySelectorAll(".edit-student-btn").forEach((btn) => {
      btn.addEventListener("click", () => onEditStudent(btn.closest("li"), students, courses));
    });
    container.querySelectorAll(".delete-student-btn").forEach((btn) => {
      btn.addEventListener("click", () => onDeleteStudent(btn.closest("li")));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function onEditStudent(li, students, courses) {
    const studentId = parseInt(li.dataset.studentId, 10);
    const userId = parseInt(li.dataset.userId, 10);
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    const studentCourses = await api("/api/students/" + studentId + "/courses");
    const studentCourseIds = studentCourses.map((c) => c.id);

    const form = document.createElement("form");
    form.className = "admin-edit-form";
    form.innerHTML =
      "<label>Username</label><input type='text' name='username' value=\"" +
      escapeHtml(s.username) +
      "\" required />" +
      "<label>New password (leave blank to keep)</label><input type='password' name='password' placeholder='Leave blank to keep' />" +
      "<label>Display name</label><input type='text' name='displayName' value=\"" +
      escapeHtml(s.display_name) +
      "\" required />" +
      "<label>Courses</label><div class='admin-course-checks'></div>" +
      "<button type='submit'>Save</button> <button type='button' class='admin-cancel-btn'>Cancel</button>";
    const checksContainer = form.querySelector(".admin-course-checks");
    courses.forEach((c) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "courseIds";
      input.value = c.id;
      input.checked = studentCourseIds.includes(c.id);
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c.name));
      checksContainer.appendChild(label);
    });
    li.innerHTML = "";
    li.appendChild(form);

    form.querySelector(".admin-cancel-btn").addEventListener("click", () => loadAdmin());

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = form.username.value.trim();
      const password = form.password.value;
      const displayName = form.displayName.value.trim();
      const courseIds = Array.from(form.querySelectorAll("input[name=courseIds]:checked")).map((el) =>
        parseInt(el.value, 10)
      );
      try {
        await api("/api/admin/users/" + userId, {
          method: "PATCH",
          body: JSON.stringify({ username, password: password || undefined }),
        });
        await api("/api/admin/students/" + studentId, {
          method: "PATCH",
          body: JSON.stringify({ displayName, courseIds }),
        });
        showAdminMessage("admin-students-message", "Student updated.", false);
        loadAdmin();
      } catch (err) {
        showAdminMessage("admin-students-message", err.data?.error || err.message, true);
      }
    });
  }

  async function onDeleteStudent(li) {
    if (!confirm("Delete this student and their progress? This cannot be undone.")) return;
    const studentId = parseInt(li.dataset.studentId, 10);
    try {
      await api("/api/admin/students/" + studentId, { method: "DELETE" });
      showAdminMessage("admin-students-message", "Student deleted.", false);
      loadAdmin();
    } catch (err) {
      showAdminMessage("admin-students-message", err.data?.error || err.message, true);
    }
  }

  function renderAdminCourses(courses) {
    const container = document.getElementById("admin-courses");
    container.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "admin-list";
    courses.forEach((c) => {
      const li = document.createElement("li");
      li.dataset.courseId = c.id;
      li.innerHTML =
        "<span class='admin-item-name'>" +
        escapeHtml(c.name) +
        (c.color ? " <span style='color:" + escapeHtml(c.color) + "'>" + escapeHtml(c.color) + "</span>" : "") +
        "</span> " +
        "<button type='button' class='admin-btn edit-course-btn'>Edit</button> " +
        "<button type='button' class='admin-btn delete-course-btn'>Delete</button>";
      ul.appendChild(li);
    });
    container.appendChild(ul);

    container.querySelectorAll(".edit-course-btn").forEach((btn) => {
      btn.addEventListener("click", () => onEditCourse(btn.closest("li"), courses));
    });
    container.querySelectorAll(".delete-course-btn").forEach((btn) => {
      btn.addEventListener("click", () => onDeleteCourse(btn.closest("li")));
    });
  }

  function onEditCourse(li, courses) {
    const courseId = parseInt(li.dataset.courseId, 10);
    const c = courses.find((x) => x.id === courseId);
    if (!c) return;
    const form = document.createElement("form");
    form.className = "admin-edit-form";
    form.innerHTML =
      "<label>Course name</label><input type='text' name='name' value=\"" +
      escapeHtml(c.name) +
      "\" required />" +
      "<label>Color (e.g. #4CAF50)</label><input type='text' name='color' value=\"" +
      escapeHtml(c.color || "") +
      "\" />" +
      "<button type='submit'>Save</button> <button type='button' class='admin-cancel-btn'>Cancel</button>";
    li.innerHTML = "";
    li.appendChild(form);

    form.querySelector(".admin-cancel-btn").addEventListener("click", () => loadAdmin());

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      const color = form.color.value.trim() || null;
      try {
        await api("/api/admin/courses/" + courseId, {
          method: "PATCH",
          body: JSON.stringify({ name, color }),
        });
        showAdminMessage("admin-courses-message", "Course updated.", false);
        loadAdmin();
      } catch (err) {
        showAdminMessage("admin-courses-message", err.data?.error || err.message, true);
      }
    });
  }

  async function onDeleteCourse(li) {
    if (!confirm("Delete this course? Student progress for this course will be removed. This cannot be undone."))
      return;
    const courseId = parseInt(li.dataset.courseId, 10);
    try {
      await api("/api/admin/courses/" + courseId, { method: "DELETE" });
      showAdminMessage("admin-courses-message", "Course deleted.", false);
      loadAdmin();
    } catch (err) {
      showAdminMessage("admin-courses-message", err.data?.error || err.message, true);
    }
  }

  document.getElementById("admin-add-student-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("add-username").value.trim();
    const password = document.getElementById("add-password").value;
    const displayName = document.getElementById("add-display-name").value.trim();
    try {
      await api("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({ username, password, displayName }),
      });
      document.getElementById("add-username").value = "";
      document.getElementById("add-password").value = "";
      document.getElementById("add-display-name").value = "";
      showAdminMessage("admin-students-message", "Student added.", false);
      loadAdmin();
    } catch (err) {
      showAdminMessage("admin-students-message", err.data?.error || err.message, true);
    }
  });

  document.getElementById("admin-add-course-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("add-course-name").value.trim();
    const color = document.getElementById("add-course-color").value.trim() || null;
    try {
      await api("/api/admin/courses", {
        method: "POST",
        body: JSON.stringify({ name, color }),
      });
      document.getElementById("add-course-name").value = "";
      document.getElementById("add-course-color").value = "";
      showAdminMessage("admin-courses-message", "Course added.", false);
      loadAdmin();
    } catch (err) {
      showAdminMessage("admin-courses-message", err.data?.error || err.message, true);
    }
  });

  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    setToken(null);
    showView("login");
  });

  document.getElementById("admin-student-select").addEventListener("change", onAdminStudentSelectChange);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadApp);
  } else {
    loadApp();
  }
})();
