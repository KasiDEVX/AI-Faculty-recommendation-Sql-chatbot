from flask import Flask, request, jsonify, render_template
import mysql.connector
import os
from dotenv import load_dotenv
from groq import Groq
import requests
import json
try:
    import redis
    cache = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    cache.ping()
    print("Redis connected ✅")
except Exception:
    cache = None
    print("Redis unavailable — caching disabled ⚠️")
load_dotenv()

app = Flask(__name__)

# Initialize Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
# Redis is initialized above with graceful fallback
# Database connection
def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="arunkasi",   # CHANGE AFTER HACKATHON
        database="college_ai"
    )


@app.route("/risk_dashboard", methods=["GET"])
def risk_dashboard():
    if cache:
        cached_data = cache.get("risk_dashboard")
        if cached_data:
            print("CACHE HIT 🔥")
            return jsonify(json.loads(cached_data))

    print("CACHE MISS ❄️")

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        low = 0
        moderate = 0
        high = 0

        detailed_results = []
        cursor.execute("""
            SELECT 
                s.student_id,
                s.name,
                d.department_name,
                s.year,
                AVG(ss.gpa) AS avg_gpa,
                AVG(a.attendance_percentage) AS avg_attendance
            FROM students s
            LEFT JOIN departments d ON s.department_id = d.department_id
            LEFT JOIN semester_summary ss ON s.student_id = ss.student_id
            LEFT JOIN attendance a ON s.student_id = a.student_id
            GROUP BY s.student_id, s.name, d.department_name, s.year
        """)

        students = cursor.fetchall()
        total_students = len(students)
        # Institution-wide GPA
        cursor.execute("SELECT AVG(gpa) AS avg_gpa FROM semester_summary")
        institution_gpa = cursor.fetchone()["avg_gpa"]

        # Students with declining GPA
        declining_count = 0
        for student in detailed_results:
            if student.get("declining_gpa", False):
                declining_count += 1

        declining_percentage = round((declining_count / total_students) * 100, 2) if total_students else 0

        # Weakest subjects
        cursor.execute("""
            SELECT sub.subject_name, COUNT(*) AS fail_count
            FROM marks m
            JOIN subjects sub ON m.subject_id = sub.subject_id
            WHERE m.total_marks < 50
            GROUP BY sub.subject_name
            ORDER BY fail_count DESC
            LIMIT 3
        """)

        weak_subjects = cursor.fetchall()
      

        for student in students:
            student_id = student["student_id"]
            avg_gpa = float(student["avg_gpa"])
            avg_att = float(student["avg_attendance"])

            dropout_score = 0
# Attendance
            if avg_att < 65:
                dropout_score += 30
            elif avg_att < 75:
                dropout_score += 20
            elif avg_att < 85:
                dropout_score += 10

            # GPA
            if avg_gpa < 5:
                dropout_score += 35
            elif avg_gpa < 6:
                dropout_score += 20
            elif avg_gpa < 7:
                dropout_score += 10


            # Failed subjects
            cursor.execute("""
                SELECT COUNT(*) as failed   
                FROM marks
                WHERE student_id = %s AND total_marks < 50
            """, (student_id,))
            failed_subjects = cursor.fetchone()["failed"]

            dropout_score += min(failed_subjects * 8, 30)


            dropout_probability = min(dropout_score, 100)

            if dropout_probability >= 70:
                category = "Critical"
                high += 1
            elif dropout_probability >= 40:
                category = "High"
                moderate += 1
            else:
                category = "Low"
                low += 1

            detailed_results.append({
                "student_id": student_id,
                "name": student["name"],
                "department": student["department_name"],
                "semester": student["year"],
                "avg_attendance": round(avg_att, 2),
                "avg_gpa": round(avg_gpa, 2),
                "failed_subjects": failed_subjects,
                "dropout_probability": dropout_probability,
                "risk_category": category
            })

        summary = {
            "total_students": total_students,
            "low_risk": low,
            "moderate_risk": moderate,
            "high_risk": high,
            "low_percentage": round((low/total_students)*100, 2) if total_students else 0,
            "moderate_percentage": round((moderate/total_students)*100, 2) if total_students else 0,
            "high_percentage": round((high/total_students)*100, 2) if total_students else 0
        }


        conn2 = get_db_connection()
        cursor2 = conn2.cursor(dictionary=True)

        cursor2.execute("SELECT AVG(gpa) AS avg_gpa FROM semester_summary")
        institution_gpa = cursor2.fetchone()["avg_gpa"]

        cursor2.execute("""
            SELECT sub.subject_name, COUNT(*) AS fail_count
            FROM marks m
            JOIN subjects sub ON m.subject_id = sub.subject_id
            WHERE m.total_marks < 50
            GROUP BY sub.subject_name
            ORDER BY fail_count DESC
            LIMIT 3
        """)

        weak_subjects = cursor2.fetchall()

        cursor2.close()
        conn2.close()
        insight_prompt = f"""
            You are an institutional academic analytics strategist.

            Institution Overview:
            - Total Students: {summary["total_students"]}
            - Low Risk: {summary["low_risk"]}
            - Moderate Risk: {summary["moderate_risk"]}
            - High Risk: {summary["high_risk"]}
            - Institution Average GPA: {round(institution_gpa, 2)}

            Top Weak Subjects:
            {weak_subjects}

            Provide:
            1. Primary academic risk pattern.
            2. Core contributing factor.
            3. 3 targeted faculty interventions.
            4. 1 long-term institutional strategy.
            5. 1 early-warning automation idea.

            Be structured and analytical.
            """
        insight_response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You generate structured academic strategy reports."},
                    {"role": "user", "content": insight_prompt}
                ]
            )

        insight_text = insight_response.choices[0].message.content.strip()
        response_data = {
                "summary": summary,
                "detailed_results": detailed_results,
                "insights": insight_text
            }
        if cache:
            cache.setex("risk_dashboard", 60, json.dumps(response_data))

        cursor.close()
        conn.close()

        return jsonify(response_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/department_analytics", methods=["GET"])
def department_analytics():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Get all departments
        cursor.execute("SELECT department_id, department_name FROM departments ORDER BY department_name")
        departments = cursor.fetchall()

        result = {}
        department_names = []

        for dept in departments:
            dept_name = dept["department_name"]
            dept_id = dept["department_id"]
            department_names.append(dept_name)

            # Semester-wise avg GPA
            cursor.execute("""
                SELECT ss.semester, 
                       ROUND(AVG(ss.gpa), 2) AS avg_gpa,
                       ROUND(AVG(a.attendance_percentage), 2) AS avg_attendance
                FROM students s
                JOIN semester_summary ss ON s.student_id = ss.student_id
                JOIN attendance a ON s.student_id = a.student_id AND ss.semester = a.semester
                WHERE s.department_id = %s
                GROUP BY ss.semester
                ORDER BY ss.semester
            """, (dept_id,))

            rows = cursor.fetchall()

            semesters = []
            gpas = []
            attendances = []

            for row in rows:
                semesters.append(f"Sem {row['semester']}")
                gpas.append(float(row["avg_gpa"]))
                attendances.append(float(row["avg_attendance"]))

            result[dept_name] = {
                "semesters": semesters,
                "gpas": gpas,
                "attendances": attendances
            }

        cursor.close()
        conn.close()

        return jsonify({
            "departments": department_names,
            "data": result
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/backlog_predictions", methods=["GET"])
def backlog_predictions():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Get all students with department info
        cursor.execute("""
            SELECT s.student_id, s.name, s.year, d.department_name
            FROM students s
            JOIN departments d ON s.department_id = d.department_id
        """)
        students = cursor.fetchall()

        predictions = []

        for student in students:
            sid = student["student_id"]
            backlog_score = 0

            # 1. GPA Trend Analysis (max 30 pts)
            cursor.execute("""
                SELECT semester, gpa FROM semester_summary
                WHERE student_id = %s ORDER BY semester
            """, (sid,))
            gpa_rows = cursor.fetchall()
            gpas = [float(r["gpa"]) for r in gpa_rows]
            latest_gpa = gpas[-1] if gpas else 0

            # Check if GPA is declining
            declining = False
            if len(gpas) >= 2:
                declines = sum(1 for i in range(1, len(gpas)) if gpas[i] < gpas[i-1])
                if declines >= len(gpas) // 2:
                    declining = True
                    backlog_score += 15

            # Low GPA penalty
            if latest_gpa < 4.5:
                backlog_score += 30
            elif latest_gpa < 5.5:
                backlog_score += 20
            elif latest_gpa < 6.5:
                backlog_score += 10

            # 2. Attendance Trend (max 20 pts)
            cursor.execute("""
                SELECT semester, attendance_percentage FROM attendance
                WHERE student_id = %s ORDER BY semester
            """, (sid,))
            att_rows = cursor.fetchall()
            attendances = [float(r["attendance_percentage"]) for r in att_rows]
            latest_att = attendances[-1] if attendances else 0

            if latest_att < 65:
                backlog_score += 20
            elif latest_att < 75:
                backlog_score += 12
            elif latest_att < 80:
                backlog_score += 5

            # 3. Previously Failed Subjects (max 25 pts)
            cursor.execute("""
                SELECT COUNT(*) as failed FROM marks
                WHERE student_id = %s AND total_marks < 50
            """, (sid,))
            failed_count = cursor.fetchone()["failed"]
            backlog_score += min(failed_count * 6, 25)

            # 4. Engagement Metrics (max 15 pts)
            cursor.execute("""
                SELECT assignment_completion, participation_score
                FROM engagement_metrics
                WHERE student_id = %s
                ORDER BY semester DESC LIMIT 1
            """, (sid,))
            engagement = cursor.fetchone()
            if engagement:
                ac = float(engagement["assignment_completion"])
                ps = float(engagement["participation_score"])
                if ac < 60:
                    backlog_score += 8
                if ps < 50:
                    backlog_score += 7

            # 5. Weak subjects (subjects where marks are lowest)
            cursor.execute("""
                SELECT sub.subject_name, m.total_marks
                FROM marks m
                JOIN subjects sub ON m.subject_id = sub.subject_id
                WHERE m.student_id = %s
                ORDER BY m.total_marks ASC
                LIMIT 3
            """, (sid,))
            weak_subjects = cursor.fetchall()
            weak_subject_names = [ws["subject_name"] for ws in weak_subjects]

            # Extra penalty for borderline marks (50-60)
            cursor.execute("""
                SELECT COUNT(*) as borderline FROM marks
                WHERE student_id = %s AND total_marks >= 50 AND total_marks < 60
            """, (sid,))
            borderline = cursor.fetchone()["borderline"]
            backlog_score += min(borderline * 3, 10)

            # Cap at 100
            backlog_probability = min(backlog_score, 100)

            # Determine risk level
            if backlog_probability >= 65:
                risk = "High"
            elif backlog_probability >= 35:
                risk = "Moderate"
            else:
                risk = "Low"

            predictions.append({
                "student_id": sid,
                "name": student["name"],
                "department": student["department_name"],
                "year": student["year"],
                "latest_gpa": round(latest_gpa, 2),
                "latest_attendance": round(latest_att, 2),
                "failed_subjects": failed_count,
                "declining_gpa": declining,
                "weak_subjects": weak_subject_names,
                "backlog_probability": backlog_probability,
                "risk": risk
            })

        # Sort by highest backlog probability
        predictions.sort(key=lambda x: x["backlog_probability"], reverse=True)

        # Summary counts
        high_risk = sum(1 for p in predictions if p["risk"] == "High")
        mod_risk = sum(1 for p in predictions if p["risk"] == "Moderate")
        low_risk = sum(1 for p in predictions if p["risk"] == "Low")

        cursor.close()
        conn.close()

        return jsonify({
            "predictions": predictions,
            "summary": {
                "total": len(predictions),
                "high_risk": high_risk,
                "moderate_risk": mod_risk,
                "low_risk": low_risk
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/student_profile/<int:student_id>", methods=["GET"])
def student_profile(student_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Basic info
        cursor.execute("""
            SELECT s.student_id, s.name, s.year, s.gender, s.enrollment_year,
                   d.department_name
            FROM students s
            JOIN departments d ON s.department_id = d.department_id
            WHERE s.student_id = %s
        """, (student_id,))
        student = cursor.fetchone()

        if not student:
            cursor.close()
            conn.close()
            return jsonify({"error": "Student not found"}), 404

        # Semester-wise GPA
        cursor.execute("""
            SELECT semester, gpa, semester_avg FROM semester_summary
            WHERE student_id = %s ORDER BY semester
        """, (student_id,))
        gpa_rows = cursor.fetchall()
        semesters = [f"Sem {r['semester']}" for r in gpa_rows]
        gpas = [float(r["gpa"]) for r in gpa_rows]
        sem_avgs = [float(r["semester_avg"]) for r in gpa_rows]

        # Semester-wise Attendance
        cursor.execute("""
            SELECT semester, attendance_percentage FROM attendance
            WHERE student_id = %s ORDER BY semester
        """, (student_id,))
        att_rows = cursor.fetchall()
        attendances = [float(r["attendance_percentage"]) for r in att_rows]

        # Subject-wise marks (latest semester for radar)
        cursor.execute("""
            SELECT sub.subject_name, m.total_marks, m.internal_marks, m.external_marks, m.semester
            FROM marks m
            JOIN subjects sub ON m.subject_id = sub.subject_id
            WHERE m.student_id = %s
            ORDER BY m.semester DESC, sub.subject_name
        """, (student_id,))
        all_marks = cursor.fetchall()

        # Get latest semester marks for radar
        latest_sem = all_marks[0]["semester"] if all_marks else 0
        radar_subjects = []
        radar_marks = []
        for m in all_marks:
            if m["semester"] == latest_sem:
                radar_subjects.append(m["subject_name"])
                radar_marks.append(int(m["total_marks"]))

        # Failed subjects count
        failed_count = sum(1 for m in all_marks if m["total_marks"] < 50)

        # Engagement metrics per semester
        cursor.execute("""
            SELECT semester, assignment_completion, participation_score
            FROM engagement_metrics
            WHERE student_id = %s ORDER BY semester
        """, (student_id,))
        eng_rows = cursor.fetchall()
        eng_assignment = [float(r["assignment_completion"]) for r in eng_rows]
        eng_participation = [float(r["participation_score"]) for r in eng_rows]

        # AI Recommendation
        latest_gpa = gpas[-1] if gpas else 0
        latest_att = attendances[-1] if attendances else 0
        try:
            ai_prompt = f"""You are an academic advisor. Analyze this student and give a brief, personalized recommendation (3-4 sentences max).

Student: {student["name"]}
Department: {student["department_name"]}
Year: {student["year"]}
GPA Trend: {gpas}
Attendance Trend: {attendances}
Failed Subjects: {failed_count}
Latest Subject Marks: {dict(zip(radar_subjects, radar_marks))}
Assignment Completion: {eng_assignment}
Participation Score: {eng_participation}

Be specific and actionable. Mention exact subjects or areas to improve."""

            ai_response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a concise academic advisor."},
                    {"role": "user", "content": ai_prompt}
                ]
            )
            recommendation = ai_response.choices[0].message.content.strip()
        except Exception:
            recommendation = "AI recommendation unavailable at the moment."

        cursor.close()
        conn.close()

        return jsonify({
            "student": {
                "name": student["name"],
                "department": student["department_name"],
                "year": student["year"],
                "gender": student["gender"],
                "enrollment_year": student["enrollment_year"]
            },
            "semesters": semesters,
            "gpas": gpas,
            "semester_avgs": sem_avgs,
            "attendances": attendances,
            "radar_subjects": radar_subjects,
            "radar_marks": radar_marks,
            "failed_count": failed_count,
            "engagement": {
                "assignment": eng_assignment,
                "participation": eng_participation
            },
            "recommendation": recommendation
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/")
def dashboard():
    return render_template("dashboard.html")
@app.route("/query", methods=["POST"])
def query():
    try:
        user_question = request.json.get("question")

        if not user_question:
            return jsonify({"error": "No question provided"}), 400

        schema_description = """
        Tables:
        departments(department_id, department_name)
        students(student_id, name, department_id, year, gender, enrollment_year)
        subjects(subject_id, subject_name, department_id, semester)
        marks(student_id, subject_id, semester, internal_marks, external_marks, total_marks)
        attendance(student_id, semester, attendance_percentage)
        semester_summary(student_id, semester, semester_avg, gpa)
        engagement_metrics(student_id, semester, assignment_completion, participation_score)
        """
        prompt = f"""
        Convert the following natural language question into a valid MySQL SELECT query.
        Rules:
        - Only SELECT queries allowed.
        - If CGPA is requested, calculate it as AVG(gpa) from semester_summary grouped by student.
        - Use total_marks instead of marks.
        - Use proper JOINs when needed.
        - Return only the SQL query.
        - Always prefix column names with table aliases (e.g., s.student_id, ss.gpa).
        Schema:
        {schema_description}

        Question: {user_question}
        """

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an expert MySQL query generator."},
                {"role": "user", "content": prompt}
            ]
        )

        sql_query = response.choices[0].message.content.strip()
        if "student_id" in sql_query and "s.student_id" not in sql_query:
            sql_query = sql_query.replace("student_id", "s.student_id")

        # Extract SELECT portion safely
        if "select" in sql_query.lower():
            sql_query = sql_query[sql_query.lower().find("select"):]
        else:
            return jsonify({"error": "Only SELECT queries are allowed."}), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(sql_query)
        results = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify({
            "generated_sql": sql_query,
            "results": results
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
if __name__ == "__main__":
    app.run(debug=True)
