import os
import json
import re
import unicodedata


import fitz
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# 3. Membaca isi file .env
load_dotenv()


# 4. Mengambil API key dan model dari file .env
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "nvidia/nemotron-3-super-120b-a12b:free"
)

SYSTEM_PROMPT = """
You are an expert AI Resume Reviewer with deep expertise in HR, recruitment, and ATS (Applicant Tracking Systems). Your task is to analyze resumes and provide actionable, constructive feedback.

You MUST respond in valid JSON format with this exact structure:
{
  "overall_score": <integer 0-100>,
  "summary": "<brief 2-3 sentence summary of the resume quality>",
  "categories": [
    {"name": "Format & Layout", "score": <integer 0-100>, "feedback": "<detailed feedback>"},
    {"name": "Content Quality", "score": <integer 0-100>, "feedback": "<detailed feedback>"},
    {"name": "Impact & Achievements", "score": <integer 0-100>, "feedback": "<detailed feedback>"},
    {"name": "ATS Compatibility", "score": <integer 0-100>, "feedback": "<detailed feedback>"}
  ],
  "strengths": ["<strength 1>", "<strength 2>", "..."],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "..."],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>", "..."]
}

Scoring Guidelines:
- 90-100: Exceptional resume, ready for top-tier positions
- 75-89: Strong resume with minor improvements needed
- 60-74: Good foundation but needs significant improvements
- 40-59: Below average, requires major revisions
- 0-39: Poor, needs complete overhaul

Evaluation Criteria:
1. Format & Layout: Clean structure, consistent formatting, proper sections, readability, appropriate length
2. Content Quality: Relevant skills, clear job descriptions, proper grammar, professional language
3. Impact & Achievements: Quantified results, action verbs, demonstrated impact, specific accomplishments
4. ATS Compatibility: Standard section headings, keyword optimization, no complex formatting, parseable structure

Provide at least 3 strengths, 3 weaknesses, and 5 actionable suggestions.
Be specific and constructive. Reference actual content from the resume when possible.
RESPOND ONLY WITH THE JSON, no additional text.
"""

# 5. Membuat aplikasi FastAPI
app = FastAPI(title="AI Resume Reviewer API")


# 6. Mengatur CORS agar frontend bisa mengakses backend
FRONTEND_URL = os.getenv("FRONTEND_URL")

allowed_origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://ariefmulyawan.github.io",
]

if FRONTEND_URL:
    allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 7. Endpoint untuk mengecek apakah API hidup
@app.get("/")
def home():
    return {
        "message": "AI Resume Reviewer API is running"
    }

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "API is healthy"
    }
    
# 8. Fungsi untuk mengambil teks dari PDF menggunakan PyMuPDF
def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        pdf_document = fitz.open(
            stream=file_bytes,
            filetype="pdf"
        )

        text = ""

        for page in pdf_document:
            page_text = page.get_text("text", sort=True)
            text += page_text + "\n"

        pdf_document.close()

        return text.strip()

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Gagal membaca PDF dengan PyMuPDF: {str(e)}"
        )

def extract_json_from_ai_response(ai_text: str) -> dict:
    try:
        return json.loads(ai_text)

    except json.JSONDecodeError:
        pass

    json_match = re.search(r"\{.*\}", ai_text, re.DOTALL)

    if json_match:
        try:
            return json.loads(json_match.group())

        except json.JSONDecodeError:
            pass

    return {
        "overall_score": None,
        "summary": ai_text,
        "categories": [
            {
                "name": "Format & Layout",
                "score": None,
                "feedback": ""
            },
            {
                "name": "Content Quality",
                "score": None,
                "feedback": ""
            },
            {
                "name": "Impact & Achievements",
                "score": None,
                "feedback": ""
            },
            {
                "name": "ATS Compatibility",
                "score": None,
                "feedback": ""
            }
        ],
        "strengths": [],
        "weaknesses": [],
        "suggestions": []
    }

def review_resume_with_ai(resume_text: str, target_role: str) -> dict:
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY belum diatur di file .env"
        )

    user_prompt = f"""
Target Role:
{target_role}

Resume:
{resume_text[:12000]}

Please review this resume for the target role above.
Focus on whether the resume is strong, clear, ATS-friendly, and relevant for the target role.
"""

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ],
        "temperature": 0.2
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"OpenRouter error: {response.text[:500]}"
            )

        data = response.json()
        ai_text = data["choices"][0]["message"]["content"]

        review_result = extract_json_from_ai_response(ai_text)

        return review_result

    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menghubungi OpenRouter: {str(e)}"
        )

    except KeyError:
        raise HTTPException(
            status_code=500,
            detail="Format response dari OpenRouter tidak sesuai."
        )

def clean_resume_text(text: str) -> str:
    # Normalisasi unicode agar karakter yang bisa dirapikan menjadi bentuk standar
    text = unicodedata.normalize("NFKC", text)

    # Ganti beberapa bullet/simbol umum menjadi bullet standar
    bullet_symbols = [
        "•", "●", "○", "▪", "▫", "‣", "⁃", "–", "—"
    ]

    for symbol in bullet_symbols:
        text = text.replace(symbol, "-")

    # Hapus karakter Private Use Area.
    # Karakter seperti "" biasanya masuk kategori ini.
    text = re.sub(r"[\uE000-\uF8FF]", "", text)

    # Hapus control characters yang tidak berguna
    text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", text)

    # Rapikan spasi berlebihan
    text = re.sub(r"[ \t]+", " ", text)

    # Rapikan baris kosong berlebihan
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()

# 9. Endpoint untuk upload resume dan mengambil teksnya
@app.post("/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...)
):
    file_bytes = await resume.read()

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail="File kosong."
        )

    filename = resume.filename.lower()

    if not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Untuk tahap ini, hanya file PDF yang didukung."
        )

    resume_text = extract_text_from_pdf(file_bytes)
    resume_text = clean_resume_text(resume_text)

    if len(resume_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Teks resume terlalu sedikit atau PDF tidak bisa diekstrak."
        )

    return {
        "filename": resume.filename,
        "text_preview": resume_text[:1000],
        "total_characters": len(resume_text)
    }
    
@app.post("/review")
async def review_resume(
    resume: UploadFile = File(...),
    target_role: str = Form(...)
):
    file_bytes = await resume.read()

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail="File kosong."
        )

    filename = resume.filename.lower()

    if not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Untuk tahap ini, hanya file PDF yang didukung."
        )

    resume_text = extract_text_from_pdf(file_bytes)
    resume_text = clean_resume_text(resume_text)

    if len(resume_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Teks resume terlalu sedikit atau PDF tidak bisa diekstrak."
        )

    if len(target_role.strip()) < 2:
        raise HTTPException(
            status_code=400,
            detail="Target role tidak boleh kosong."
        )

    review_result = review_resume_with_ai(
        resume_text=resume_text,
        target_role=target_role
    )

    return {
        "filename": resume.filename,
        "target_role": target_role,
        "total_characters": len(resume_text),
        "review": review_result
    }
