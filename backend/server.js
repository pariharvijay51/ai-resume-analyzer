require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdf = require("pdf-parse");
const { initDb, q } = require("./db");

const app = express();
app.get("/", (req, res) => {
  res.json({
    message: "AI Resume Analyzer API is running!",
    status: "success"
  });
});
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const PROMPT = (resume, jd) => `You are an ATS and career assistant. Compare the RESUME with the JOB DESCRIPTION.
Only use facts present in the resume. Never invent achievements or metrics.
Return ONLY JSON in this exact shape:
{
 "matchScore": number 0-100,
 "verdict": "Strong Match" | "Good Match" | "Partial Match" | "Weak Match",
 "matchedSkills": [string],
 "missingSkills": [string],
 "jdKeywords": [string],
 "resumeKeywords": [string],
 "sections": {"Contact Information": bool, "Education": bool, "Skills": bool, "Projects": bool, "Experience": bool, "Certifications": bool},
 "suggestions": [string],
 "interviewQuestions": [{"category": string, "question": string, "difficulty": "Easy"|"Medium"|"Hard"}]
}
Give 4-6 specific suggestions and 9-12 interview questions grouped by the job's key skills.

RESUME:
${resume.slice(0, 12000)}

JOB DESCRIPTION:
${jd.slice(0, 6000)}`;

async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing in backend/.env");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Gemini request failed");
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

app.post("/api/analyze", upload.single("resume"), async (req, res) => {
  try {
    const { jobTitle = "Untitled role", jobDescription = "" } = req.body;
    if (!req.file) return res.status(400).json({ error: "Please upload a PDF resume." });
    if (jobDescription.trim().length < 30) return res.status(400).json({ error: "Please paste a longer job description." });

    const text = (await pdf(req.file.buffer)).text.trim();
    if (text.length < 50) return res.status(400).json({ error: "Could not read text from this PDF. Is it a scanned image?" });

    const result = await askGemini(PROMPT(text, jobDescription));

    const [r1] = await q("INSERT INTO resumes (file_name, extracted_text) VALUES (?,?)", [req.file.originalname, text]);
    const [r2] = await q("INSERT INTO job_descriptions (title, description) VALUES (?,?)", [jobTitle, jobDescription]);
    const [r3] = await q(
      "INSERT INTO analysis (resume_id, job_id, match_score, matched_skills, missing_skills, ai_feedback) VALUES (?,?,?,?,?,?)",
      [r1.insertId, r2.insertId, result.matchScore, JSON.stringify(result.matchedSkills), JSON.stringify(result.missingSkills), JSON.stringify({ ...result })]
    );
    for (const iq of result.interviewQuestions || [])
      await q("INSERT INTO interview_questions (analysis_id, question, category, difficulty) VALUES (?,?,?,?)", [r3.insertId, iq.question, iq.category, iq.difficulty]);

    res.json({ id: r3.insertId, jobTitle, fileName: req.file.originalname, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/history", async (_req, res) => {
  const [rows] = await q(
    `SELECT a.id, a.match_score, a.created_at, j.title, r.file_name
     FROM analysis a JOIN job_descriptions j ON j.id=a.job_id JOIN resumes r ON r.id=a.resume_id
     ORDER BY a.id DESC LIMIT 20`
  );
  res.json(rows);
});

app.get("/api/analysis/:id", async (req, res) => {
  const [rows] = await q(
    `SELECT a.id, a.ai_feedback, j.title, r.file_name FROM analysis a
     JOIN job_descriptions j ON j.id=a.job_id JOIN resumes r ON r.id=a.resume_id WHERE a.id=?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  const fb = typeof rows[0].ai_feedback === "string" ? JSON.parse(rows[0].ai_feedback) : rows[0].ai_feedback;
  res.json({ id: rows[0].id, jobTitle: rows[0].title, fileName: rows[0].file_name, ...fb });
});

initDb()
  .then(() => app.listen(process.env.PORT || 5000, () => console.log("API on http://localhost:" + (process.env.PORT || 5000))))
  .catch((e) => { console.error("Database error:", e.message); process.exit(1); });
