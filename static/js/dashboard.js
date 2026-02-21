// Animation function for counting up numbers
function animateValue(id, start, end, duration, suffix = "") {
    const obj = document.getElementById(id);
    const range = end - start;
    const minTimer = 50;
    let stepTime = Math.abs(Math.floor(duration / range));

    stepTime = Math.max(stepTime, minTimer);

    let startTime = new Date().getTime();
    let endTime = startTime + duration;
    let timer;

    function run() {
        let now = new Date().getTime();
        let remaining = Math.max((endTime - now) / duration, 0);
        let value = Math.round(end - (remaining * range));

        // Format: if suffix is %, keep 1 decimal if needed, otherwise integer
        let formatted = suffix === "%" ? value.toFixed(1) : value; // Actually, user might prefer integer % too, but let's stick to simple
        if (suffix === "") formatted = Math.floor(value); // Force integer for counts

        obj.innerHTML = formatted + suffix;

        if (value == end) {
            clearInterval(timer);
        }
    }

    timer = setInterval(run, stepTime);
    run();
}

// Initialize Charts with Dark Mode Styles
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.font.family = "'Outfit', sans-serif";

fetch('/risk_dashboard')
    .then(res => res.json())
    .then(data => {
        const s = data.summary;
        console.log("Data received:", data);
        // Animate Cards
        animateValue("totalStudents", 0, s.total_students, 1000);
        animateValue("lowPercent", 0, s.low_percentage, 1000, "%");
        animateValue("moderatePercent", 0, s.moderate_percentage, 1200, "%");
        animateValue("highPercent", 0, s.high_percentage, 1400, "%");

        // Helper for Gradient
        const ctxPie = document.getElementById("riskPie").getContext('2d');
        const ctxBar = document.getElementById("riskBar").getContext('2d');

        const colors = {
            low: '#10b981',
            mod: '#f59e0b',
            high: '#ef4444'
        };

        // Pie Chart
        new Chart(ctxPie, {
            type: "doughnut",
            data: {
                labels: ["Low Risk", "Moderate Risk", "High Risk"],
                datasets: [{
                    data: [s.low_percentage, s.moderate_percentage, s.high_percentage],
                    backgroundColor: [colors.low, colors.mod, colors.high],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } }
                }
            }
        });

        // Bar Chart
        new Chart(ctxBar, {
            type: "bar",
            data: {
                labels: ["Low", "Moderate", "High"],
                datasets: [{
                    label: "Students %",
                    data: [s.low_percentage, s.moderate_percentage, s.high_percentage],
                    backgroundColor: [colors.low, colors.mod, colors.high],
                    borderRadius: 6,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
        console.log("Insight field:", data.insight);
        // Update Insight Text
        const insightText = data.insights
        if (data.insights) {
            document.getElementById("aiInsight").innerHTML = insightText.replace(/\n/g, "<br>");
        } else {
            document.getElementById("aiInsight").innerText = "Insight unavailable.";
        }
        const students = data.detailed_results;

        function renderTable(filter = "All", search = "") {
            const table = document.getElementById("studentTable");
            table.innerHTML = "";

            students
                .filter(s => filter === "All" || s.risk_category === filter)
                .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
                .slice(0, 50)
                .forEach(s => {
                    const row = document.createElement("tr");

                    let badgeClass = 'badge-low';
                    if (s.risk_category === 'High') badgeClass = 'badge-high';
                    else if (s.risk_category === 'Moderate') badgeClass = 'badge-mod';

                    row.className = 'clickable-row';
                    row.setAttribute('data-id', s.student_id);
                    row.innerHTML = `
                                <td class="name-cell">${s.name}</td>
                                <td>${s.department}</td>
                                <td>${s.semester}</td>
                                <td><span class="risk-badge ${badgeClass}">${s.risk_category}</span></td>
                            `;
                    row.addEventListener('click', () => openStudentModal(s.student_id));
                    table.appendChild(row);
                });
        }

        renderTable();

        document.getElementById("riskFilter").addEventListener("change", e => {
            renderTable(e.target.value, document.getElementById("searchInput").value);
        });

        document.getElementById("searchInput").addEventListener("input", e => {
            renderTable(document.getElementById("riskFilter").value, e.target.value);
        });

    });

// ====== Department Semester Analytics ======
let deptChart = null;

function renderDeptChart(deptData, deptName) {
    const ctx = document.getElementById("deptLineChart").getContext("2d");

    // Destroy previous chart instance
    if (deptChart) {
        deptChart.destroy();
    }

    deptChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: deptData.semesters,
            datasets: [
                {
                    label: "Avg GPA",
                    data: deptData.gpas,
                    borderColor: "#38bdf8",
                    backgroundColor: "rgba(56, 189, 248, 0.1)",
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: "#38bdf8",
                    pointBorderColor: "#0f172a",
                    pointBorderWidth: 2,
                    yAxisID: "yGpa"
                },
                {
                    label: "Avg Attendance %",
                    data: deptData.attendances,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: "#10b981",
                    pointBorderColor: "#0f172a",
                    pointBorderWidth: 2,
                    yAxisID: "yAtt"
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: { size: 13 }
                    }
                },
                tooltip: {
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    borderColor: "rgba(56, 189, 248, 0.3)",
                    borderWidth: 1,
                    titleFont: { size: 14, weight: 600 },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 10
                }
            },
            scales: {
                yGpa: {
                    type: "linear",
                    position: "left",
                    beginAtZero: true,
                    max: 10,
                    title: {
                        display: true,
                        text: "GPA",
                        color: "#38bdf8",
                        font: { size: 12, weight: 600 }
                    },
                    grid: { color: "rgba(255,255,255,0.05)" },
                    ticks: { color: "#38bdf8" }
                },
                yAtt: {
                    type: "linear",
                    position: "right",
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: "Attendance %",
                        color: "#10b981",
                        font: { size: 12, weight: 600 }
                    },
                    grid: { drawOnChartArea: false },
                    ticks: { color: "#10b981" }
                },
                x: {
                    grid: { color: "rgba(255,255,255,0.05)" }
                }
            }
        }
    });
}

fetch("/department_analytics")
    .then(res => {
        if (!res.ok) {
            throw new Error("Server returned " + res.status);
        }
        return res.json();
    })
    .then(result => {
        console.log("Dept analytics response:", result);

        if (result.error) {
            document.getElementById("deptLoading").textContent = "Error: " + result.error;
            console.error("Dept analytics error:", result.error);
            return;
        }

        const selector = document.getElementById("deptSelector");
        selector.innerHTML = "";

        const depts = result.departments;
        const deptData = result.data;

        if (!depts || depts.length === 0) {
            selector.innerHTML = '<span class="dept-loading">No departments found.</span>';
            return;
        }

        depts.forEach((name, idx) => {
            const btn = document.createElement("button");
            btn.className = "dept-btn" + (idx === 0 ? " active" : "");
            btn.textContent = name;
            btn.addEventListener("click", () => {
                document.querySelectorAll(".dept-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                renderDeptChart(deptData[name], name);
            });
            selector.appendChild(btn);
        });

        // Render first department by default
        renderDeptChart(deptData[depts[0]], depts[0]);
    })
    .catch(err => {
        console.error("Dept analytics fetch failed:", err);
        const loadEl = document.getElementById("deptLoading");
        if (loadEl) loadEl.textContent = "Failed to load: " + err.message;
    });

// ====== Backlog Predictions ======
fetch("/backlog_predictions")
    .then(res => {
        if (!res.ok) throw new Error("Server returned " + res.status);
        return res.json();
    })
    .then(result => {
        console.log("Backlog predictions:", result);

        if (result.error) {
            console.error("Backlog error:", result.error);
            return;
        }

        const summary = result.summary;
        const predictions = result.predictions;

        // Animate summary counts
        animateValue("predictHigh", 0, summary.high_risk, 800);
        animateValue("predictMod", 0, summary.moderate_risk, 800);
        animateValue("predictLow", 0, summary.low_risk, 800);

        function renderPredictTable(filter = "All", search = "") {
            const table = document.getElementById("predictTable");
            table.innerHTML = "";

            predictions
                .filter(p => filter === "All" || p.risk === filter)
                .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
                .forEach(p => {
                    const row = document.createElement("tr");
                    row.className = 'clickable-row';

                    // Badge class
                    let badgeClass = "badge-low";
                    let barClass = "bar-low";
                    let pctColor = "var(--risk-low)";
                    if (p.risk === "High") {
                        badgeClass = "badge-high";
                        barClass = "bar-high";
                        pctColor = "var(--risk-high)";
                    } else if (p.risk === "Moderate") {
                        badgeClass = "badge-mod";
                        barClass = "bar-mod";
                        pctColor = "var(--risk-mod)";
                    }

                    // Declining GPA indicator
                    const decliningTag = p.declining_gpa
                        ? '<span class="gpa-declining">▼ declining</span>'
                        : '';

                    // Weak subjects
                    const weakHtml = p.weak_subjects.length > 0
                        ? `<span class="weak-subjects-list">${p.weak_subjects.join(", ")}</span>`
                        : '<span style="color: var(--text-muted);">—</span>';

                    row.innerHTML = `
                        <td class="name-cell">${p.name}</td>
                        <td>${p.department}</td>
                        <td>${p.latest_gpa}${decliningTag}</td>
                        <td>${p.latest_attendance}%</td>
                        <td style="text-align:center;">${p.failed_subjects}</td>
                        <td>${weakHtml}</td>
                        <td>
                            <div class="backlog-bar-wrap">
                                <div class="backlog-bar-bg">
                                    <div class="backlog-bar-fill ${barClass}" style="width: ${p.backlog_probability}%"></div>
                                </div>
                                <span class="backlog-pct" style="color: ${pctColor}">${p.backlog_probability}%</span>
                            </div>
                        </td>
                        <td><span class="risk-badge ${badgeClass}">${p.risk}</span></td>
                    `;
                    row.addEventListener('click', () => openStudentModal(p.student_id));
                    table.appendChild(row);
                });
        }

        renderPredictTable();

        document.getElementById("predictFilter").addEventListener("change", e => {
            renderPredictTable(e.target.value, document.getElementById("predictSearch").value);
        });

        document.getElementById("predictSearch").addEventListener("input", e => {
            renderPredictTable(document.getElementById("predictFilter").value, e.target.value);
        });
    })
    .catch(err => {
        console.error("Backlog predictions fetch failed:", err);
    });

function sendMessage() {
    const input = document.getElementById("chatInput");
    const chatBox = document.getElementById("chatBox");
    const message = input.value;

    if (!message) return;

    chatBox.innerHTML += `<div><b>You:</b> ${message}</div>`;

    fetch('/chat', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message })
    })
        .then(res => res.json())
        .then(data => {
            chatBox.innerHTML += `<div style="margin-top:8px;"><b>Assistant:</b> ${data.reply}</div>`;
            chatBox.scrollTop = chatBox.scrollHeight;
        });

    input.value = "";
}
function runQuery() {
    const question = document.getElementById("sqlInput").value;
    const output = document.getElementById("sqlOutput");

    if (!question) return;

    output.innerHTML = "<em>Processing query...</em>";

    fetch('/query', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question })
    })
        .then(res => res.json())
        .then(data => {

            if (data.error) {
                output.innerHTML = `<p style="color:#ef4444;">${data.error}</p>`;
                return;
            }

            let html = `
                        <div style="margin-bottom: 20px;">
                            <p style="color:#22c55e; margin-bottom: 5px;"><strong>Generated SQL:</strong></p>
                            <pre style="background:rgba(255,255,255,0.05); padding:10px; border-radius:10px; overflow-x: auto; font-family: 'Courier New', monospace;">${data.generated_sql}</pre>
                        </div>
                    `;

            // Display AI Analysis/Insight if available
            if (data.insight) {
                html += `
                        <div style="margin-bottom: 20px; background: rgba(56, 189, 248, 0.1); padding: 15px; border-radius: 12px; border-left: 4px solid var(--primary);">
                            <h4 style="margin-bottom: 8px; color: var(--primary); display: flex; align-items: center; gap: 8px;">
                                <i class="ri-magic-line"></i> AI Analysis
                            </h4>
                            <p style="line-height: 1.6; color: var(--text-main);">${data.insight}</p>
                        </div>
                        `;
            }

            if (data.results && data.results.length > 0) {
                html += `<p style="margin-bottom:10px;"><strong>Query Results:</strong></p>`;

                // Dynamically build table
                const headers = Object.keys(data.results[0]);

                let tableHtml = `
                        <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                            <table class="student-table" style="width:100%;">
                                <thead style="position: sticky; top: 0; background: #0f172a; z-index: 10;">
                                    <tr>
                                        ${headers.map(h => `<th>${h.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                        `;

                data.results.forEach(row => {
                    tableHtml += `<tr>`;
                    headers.forEach(h => {
                        tableHtml += `<td>${row[h]}</td>`;
                    });
                    tableHtml += `</tr>`;
                });

                tableHtml += `
                                </tbody>
                            </table>
                        </div>
                        `;

                html += tableHtml;
            } else {
                html += `<p style="color: var(--text-muted); font-style: italic;">No results found for this query.</p>`;
            }

            output.innerHTML = html;
        })
        .catch(err => {
            console.error(err);
            output.innerHTML = `<p style="color:#ef4444;">Server error: ${err.message}</p>`;
        });
}
// --- Sidebar Navigation ---
const sidebar = document.getElementById('sidebar');
const hamburger = document.getElementById('hamburgerBtn');
const overlay = document.getElementById('sidebarOverlay');

hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
});
overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
});

// Smooth scroll & active highlight
document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', function (e) {
        e.preventDefault();
        // Update active state
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
        // Scroll to section
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
        // Close sidebar on mobile
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });
});

// Highlight active link on scroll
const sections = document.querySelectorAll('.scroll-section');
const navLinks = document.querySelectorAll('.nav-item');
window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        if (window.scrollY >= sectionTop) {
            current = section.getAttribute('id');
        }
    });
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + current) {
            link.classList.add('active');
        }
    });
});

// ====== Scroll Reveal Animations ======
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
});

document.querySelectorAll('.reveal').forEach(el => {
    revealObserver.observe(el);
});

// ====== Student Profile Modal ======
let modalGpaChart = null;
let modalAttChart = null;
let modalRadarChart = null;
let modalEngChart = null;

function openStudentModal(studentId) {
    const modal = document.getElementById('studentModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Reset content
    document.getElementById('modalName').textContent = 'Loading...';
    document.getElementById('modalAiText').textContent = 'Generating AI recommendation...';

    fetch(`/student_profile/${studentId}`)
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.json();
        })
        .then(data => {
            if (data.error) {
                document.getElementById('modalName').textContent = 'Error: ' + data.error;
                return;
            }

            const s = data.student;
            const isLight = document.body.classList.contains('light-mode');
            const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
            const textColor = isLight ? '#475569' : '#94a3b8';

            // Header
            document.getElementById('modalAvatar').textContent = s.name.charAt(0).toUpperCase();
            document.getElementById('modalName').textContent = s.name;
            document.getElementById('modalDept').innerHTML = `<i class="ri-building-2-line"></i> ${s.department}`;
            document.getElementById('modalYear').innerHTML = `<i class="ri-calendar-line"></i> Year ${s.year}`;
            document.getElementById('modalGender').innerHTML = `<i class="ri-user-line"></i> ${s.gender}`;

            // Destroy old charts
            if (modalGpaChart) modalGpaChart.destroy();
            if (modalAttChart) modalAttChart.destroy();
            if (modalRadarChart) modalRadarChart.destroy();
            if (modalEngChart) modalEngChart.destroy();

            // GPA Trend Chart
            modalGpaChart = new Chart(document.getElementById('modalGpaChart'), {
                type: 'line',
                data: {
                    labels: data.semesters,
                    datasets: [{
                        label: 'GPA',
                        data: data.gpas,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#38bdf8',
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { min: 0, max: 10, grid: { color: gridColor }, ticks: { color: textColor } },
                        x: { grid: { display: false }, ticks: { color: textColor } }
                    }
                }
            });

            // Attendance Trend Chart
            modalAttChart = new Chart(document.getElementById('modalAttChart'), {
                type: 'bar',
                data: {
                    labels: data.semesters,
                    datasets: [{
                        label: 'Attendance %',
                        data: data.attendances,
                        backgroundColor: data.attendances.map(a =>
                            a < 75 ? 'rgba(239, 68, 68, 0.6)' :
                                a < 85 ? 'rgba(245, 158, 11, 0.6)' :
                                    'rgba(16, 185, 129, 0.6)'
                        ),
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: textColor } },
                        x: { grid: { display: false }, ticks: { color: textColor } }
                    }
                }
            });

            // Radar Chart for Subject Performance
            modalRadarChart = new Chart(document.getElementById('modalRadarChart'), {
                type: 'radar',
                data: {
                    labels: data.radar_subjects,
                    datasets: [{
                        label: 'Marks',
                        data: data.radar_marks,
                        backgroundColor: 'rgba(129, 140, 248, 0.2)',
                        borderColor: '#818cf8',
                        pointBackgroundColor: '#818cf8',
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        r: {
                            beginAtZero: true,
                            max: 100,
                            grid: { color: gridColor },
                            angleLines: { color: gridColor },
                            pointLabels: { color: textColor, font: { size: 10 } },
                            ticks: { color: textColor, backdropColor: 'transparent' }
                        }
                    }
                }
            });

            // Engagement Chart
            modalEngChart = new Chart(document.getElementById('modalEngChart'), {
                type: 'bar',
                data: {
                    labels: data.semesters,
                    datasets: [
                        {
                            label: 'Assignment',
                            data: data.engagement.assignment,
                            backgroundColor: 'rgba(56, 189, 248, 0.6)',
                            borderRadius: 4
                        },
                        {
                            label: 'Participation',
                            data: data.engagement.participation,
                            backgroundColor: 'rgba(168, 85, 247, 0.6)',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { labels: { color: textColor, boxWidth: 12 } } },
                    scales: {
                        y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: textColor } },
                        x: { grid: { display: false }, ticks: { color: textColor } }
                    }
                }
            });

            // AI Recommendation
            document.getElementById('modalAiText').textContent = data.recommendation;
        })
        .catch(err => {
            console.error('Student profile error:', err);
            document.getElementById('modalName').textContent = 'Failed to load profile';
            document.getElementById('modalAiText').textContent = err.message;
        });
}

// Close modal
document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('studentModal').classList.remove('active');
    document.body.style.overflow = '';
});

document.getElementById('studentModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        document.getElementById('studentModal').classList.remove('active');
        document.body.style.overflow = '';
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('studentModal').classList.remove('active');
        document.body.style.overflow = '';
    }
});

// ====== Dark/Light Mode Toggle ======
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');

// Load saved preference
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
    themeIcon.className = 'ri-sun-line';
    themeLabel.textContent = 'Light Mode';
    Chart.defaults.color = '#475569';
    Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.06)';
}

themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-mode');

    if (isLight) {
        themeIcon.className = 'ri-sun-line';
        themeLabel.textContent = 'Light Mode';
        localStorage.setItem('theme', 'light');
        Chart.defaults.color = '#475569';
        Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.06)';
    } else {
        themeIcon.className = 'ri-moon-line';
        themeLabel.textContent = 'Dark Mode';
        localStorage.setItem('theme', 'dark');
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
    }
});