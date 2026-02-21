import random
import mysql.connector
import statistics

# ---------- CONFIG ----------
NUM_STUDENTS = 100
SEMESTERS = [1, 2, 3, 4]

MALE_NAMES = ["Arjun", "Rohit", "Karthik", "Aditya", "Vikram",
              "Siddharth", "Rahul", "Harish", "Pranav", "Manoj"]

FEMALE_NAMES = ["Ananya", "Priya", "Sneha", "Kavya", "Divya",
                "Meera", "Aishwarya", "Pooja", "Neha", "Ritika"]

LAST_NAMES = ["Sharma", "Reddy", "Patel", "Iyer", "Nair",
              "Verma", "Gupta", "Menon", "Yadav", "Rao"]

SUBJECT_LIST = ["Mathematics", "Programming", "Data Structures",
                "Physics", "Electronics", "Mechanics"]

# ---------- DB CONNECTION ----------
conn = mysql.connector.connect(
    host="localhost",
    user="root",
    password="arunkasi",
    database="college_ai"
)

cursor = conn.cursor()

# ---------- INSERT SUBJECTS ----------
cursor.execute("SELECT COUNT(*) FROM subjects")
if cursor.fetchone()[0] == 0:
    cursor.execute("SELECT department_id FROM departments")
    departments = cursor.fetchall()

    for (dept_id,) in departments:
        for sem in SEMESTERS:
            for subject in SUBJECT_LIST:
                cursor.execute("""
                    INSERT INTO subjects (subject_name, department_id, semester)
                    VALUES (%s, %s, %s)
                """, (subject, dept_id, sem))

    conn.commit()
    print("Subjects inserted.")

# ---------- FETCH DEPARTMENTS ----------
cursor.execute("SELECT department_id FROM departments")
departments = cursor.fetchall()
students_per_dept = NUM_STUDENTS // len(departments)

student_id = 1

# ---------- GENERATE STUDENTS ----------
for (dept_id,) in departments:
    for _ in range(students_per_dept):

        gender = random.choice(["Male", "Female"])
        first_name = random.choice(MALE_NAMES if gender == "Male" else FEMALE_NAMES)
        last_name = random.choice(LAST_NAMES)
        name = f"{first_name} {last_name}"

        year = random.randint(1, 4)
        enrollment_year = 2020 + (4 - year)

        cursor.execute("""
            INSERT INTO students
            (student_id, name, department_id, year, gender, enrollment_year)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (student_id, name, dept_id, year, gender, enrollment_year))

        # ---- Attendance ----
        attendance_trend = random.randint(-5, 5)
        base_attendance = random.randint(65, 95)

        # Fetch subject IDs for dept + semester
        semester_gpas = []

        for sem in SEMESTERS:

            attendance = max(50, min(100, base_attendance + attendance_trend * (sem - 1)))

            cursor.execute("""
                INSERT INTO attendance
                (student_id, semester, attendance_percentage)
                VALUES (%s, %s, %s)
            """, (student_id, sem, attendance))

            cursor.execute("""
                SELECT subject_id FROM subjects
                WHERE department_id = %s AND semester = %s
            """, (dept_id, sem))

            subject_ids = cursor.fetchall()

            semester_totals = []

            for (subject_id,) in subject_ids:

                internal = random.randint(15, 40)
                external = random.randint(25, 60)
                total = internal + external

                semester_totals.append(total)

                cursor.execute("""
                    INSERT INTO marks
                    (student_id, subject_id, semester, internal_marks, external_marks, total_marks)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (student_id, subject_id, sem, internal, external, total))

            semester_avg = sum(semester_totals) / len(semester_totals)
            gpa = round((semester_avg / 100) * 10, 2)
            semester_gpas.append(gpa)

            cursor.execute("""
                INSERT INTO semester_summary
                (student_id, semester, semester_avg, gpa)
                VALUES (%s, %s, %s, %s)
            """, (student_id, sem, semester_avg, gpa))

            # ---- Engagement ----
            participation = random.randint(40, 100)
            assignment_completion = random.randint(50, 100)

            cursor.execute("""
                INSERT INTO engagement_metrics
                (student_id, semester, assignment_completion, participation_score)
                VALUES (%s, %s, %s, %s)
            """, (student_id, sem, assignment_completion, participation))

        student_id += 1

conn.commit()
cursor.close()
conn.close()

print("500 Indian students with full academic structure generated successfully.")
