/**
 * AI Resume Reviewer — Frontend Logic
 * Handles file upload, API calls, and dynamic rendering of results.
 */

// =====================
// Configuration
// =====================
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://vercel1-xi-sandy.vercel.app';  // same-origin in production

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf'];

// =====================
// DOM Elements
// =====================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileRemove = document.getElementById('fileRemove');
const submitBtn = document.getElementById('submitBtn');
const uploadForm = document.getElementById('uploadForm');
const loadingState = document.getElementById('loadingState');
const resultsSection = document.getElementById('resultsSection');
const jobTitleInput = document.getElementById('jobTitle');

// =====================
// State
// =====================
let selectedFile = null;

// =====================
// File Upload Handlers
// =====================

// Click to browse
dropZone.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

// Remove file
fileRemove.addEventListener('click', () => {
    clearFile();
});

// Submit
submitBtn.addEventListener('click', () => {
    if (selectedFile) {
        submitResume();
    }
});

/**
 * Handle file selection — validate and show file info.
 */
function handleFileSelect(file) {
    // Validate extension
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        showToast(`Format file "${ext}" tidak didukung. Gunakan: ${ALLOWED_EXTENSIONS.join(', ')}`);
        return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
        showToast(`File terlalu besar (${formatFileSize(file.size)}). Maksimal 10 MB.`);
        return;
    }

    if (file.size === 0) {
        showToast('File kosong. Silakan pilih file yang valid.');
        return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    dropZone.style.display = 'none';
    fileInfo.style.display = 'block';
    submitBtn.disabled = false;
}

/**
 * Clear selected file.
 */
function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    dropZone.style.display = 'block';
    fileInfo.style.display = 'none';
    submitBtn.disabled = true;
}

/**
 * Submit resume for AI review.
 */
async function submitResume() {
    if (!selectedFile) return;

    // Show loading
    uploadForm.style.display = 'none';
    loadingState.style.display = 'block';
    resultsSection.style.display = 'none';

    // Animate loading steps
    animateLoadingSteps();

    // Build form data
    const formData = new FormData();
    formData.append('resume', selectedFile);
    const targetRole = jobTitleInput.value.trim();

if (!targetRole) {
    showToast('Target posisi wajib diisi.');
    loadingState.style.display = 'none';
    uploadForm.style.display = 'block';
    return;
}

formData.append('target_role', targetRole);
    try {
        const response = await fetch(`${API_BASE_URL}/review`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const data = await response.json();
        renderResults(data);

    } catch (error) {
        console.error('Review failed:', error);
        showToast(error.message || 'Gagal menghubungi server. Silakan coba lagi.');

        // Reset to upload form
        loadingState.style.display = 'none';
        uploadForm.style.display = 'block';
    }
}

// =====================
// Loading Animation
// =====================

function animateLoadingSteps() {
    const steps = ['step1', 'step2', 'step3'];
    const texts = [
        'Membaca dan mengekstrak teks dari resume Anda',
        'AI sedang menganalisis konten dan struktur resume',
        'Menyiapkan feedback dan saran perbaikan'
    ];
    const loadingText = document.getElementById('loadingText');

    let currentStep = 0;

    const interval = setInterval(() => {
        if (currentStep >= steps.length) {
            clearInterval(interval);
            return;
        }

        // Mark current as done
        if (currentStep > 0) {
            document.getElementById(steps[currentStep - 1]).classList.remove('active');
            document.getElementById(steps[currentStep - 1]).classList.add('done');
        }

        // Mark next as active
        document.getElementById(steps[currentStep]).classList.add('active');
        loadingText.textContent = texts[currentStep];

        currentStep++;
    }, 3000);

    // Store interval so we can clear it later
    window._loadingInterval = interval;
}

// =====================
// Render Results
// =====================

function renderResults(data) {
    console.log("Response dari backend:", data);

    if (window._loadingInterval) clearInterval(window._loadingInterval);

    // Backend kita membungkus hasil AI di dalam key "review"
    const review = data.review || data;

    loadingState.style.display = 'none';
    uploadForm.style.display = 'block';
    clearFile();

    ['step1', 'step2', 'step3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active', 'done');
        }
    });

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const overallScore = review.overall_score || 0;

    animateScore(overallScore);

    document.getElementById('scoreSummary').textContent = review.summary || 'Tidak ada ringkasan.';
    document.getElementById('scoreLabel').textContent = getScoreLabel(overallScore);

    injectSvgGradient();

    renderCategories(review.categories || []);

    renderFeedbackList('strengthsList', review.strengths || []);
    renderFeedbackList('weaknessesList', review.weaknesses || []);
    renderFeedbackList('suggestionsList', review.suggestions || []);
}
/**
 * Animate the overall score ring and number.
 */
function animateScore(targetScore) {
    const scoreEl = document.getElementById('overallScore');
    const ringFill = document.getElementById('scoreRingFill');

    // Animate number
    let current = 0;
    const duration = 1500;
    const startTime = performance.now();

    function updateNumber(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        current = Math.round(eased * targetScore);
        scoreEl.textContent = current;
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        }
    }
    requestAnimationFrame(updateNumber);

    // Animate ring
    const circumference = 2 * Math.PI * 85; // r=85
    const offset = circumference - (targetScore / 100) * circumference;
    // Small delay for visual effect
    setTimeout(() => {
        ringFill.style.strokeDashoffset = offset;
    }, 100);
}

/**
 * Inject SVG gradient definition for the score ring.
 */
function injectSvgGradient() {
    const svg = document.querySelector('.score-ring');
    if (!svg) return;

    // Check if gradient already exists
    if (svg.querySelector('#scoreGradient')) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#6366f1"/>
            <stop offset="50%" style="stop-color:#a855f7"/>
            <stop offset="100%" style="stop-color:#ec4899"/>
        </linearGradient>
    `;
    svg.prepend(defs);
}

/**
 * Get score label based on score value.
 */
function getScoreLabel(score) {
    if (score >= 90) return '🌟 Exceptional!';
    if (score >= 75) return '💪 Strong Resume';
    if (score >= 60) return '👍 Good Foundation';
    if (score >= 40) return '📝 Needs Improvement';
    return '🔧 Needs Major Revision';
}

/**
 * Render category score cards.
 */
function renderCategories(categories) {
    const grid = document.getElementById('categoriesGrid');
    grid.innerHTML = '';

    categories.forEach((cat, index) => {
        const scoreClass = getScoreClass(cat.score);
        const card = document.createElement('div');
        card.className = `category-card ${scoreClass}`;
        card.style.animationDelay = `${index * 0.1}s`;
        card.innerHTML = `
            <div class="category-header">
                <span class="category-name">${escapeHtml(cat.name)}</span>
                <span class="category-score">${cat.score}</span>
            </div>
            <div class="category-bar">
                <div class="category-bar-fill" data-width="${cat.score}"></div>
            </div>
            <p class="category-feedback">${escapeHtml(cat.feedback)}</p>
        `;
        grid.appendChild(card);
    });

    // Animate bars with delay
    setTimeout(() => {
        grid.querySelectorAll('.category-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width + '%';
        });
    }, 300);
}

/**
 * Get CSS class for score range.
 */
function getScoreClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-average';
    return 'score-poor';
}

/**
 * Render a feedback list (strengths, weaknesses, suggestions).
 */
function renderFeedbackList(elementId, items) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';

    if (!items || items.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Tidak ada data yang ditampilkan.';
        list.appendChild(li);
        return;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.textContent = item;
        li.style.animationDelay = `${index * 0.08}s`;
        list.appendChild(li);
    });
}
// =====================
// Toast Notifications
// =====================

function showToast(message) {
    const toast = document.getElementById('errorToast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.style.display = 'block';

    // Auto-hide after 6 seconds
    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(hideToast, 6000);
}

function hideToast() {
    const toast = document.getElementById('errorToast');
    toast.style.display = 'none';
}

// =====================
// Hero Stats Counter Animation
// =====================

function animateStats() {
    const statNumbers = document.querySelectorAll('.stat-number[data-count]');
    statNumbers.forEach(el => {
        const target = parseInt(el.dataset.count);
        const duration = 2000;
        const startTime = performance.now();

        function update(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * target);
            el.textContent = current >= 1000 ? (current / 1000).toFixed(0) + 'K+' : current;
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    });
}

// =====================
// Utility Functions
// =====================

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToUpload(e) {
    e.preventDefault();
    document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
}

// =====================
// Initialize
// =====================

// Animate hero stats on page load
window.addEventListener('load', () => {
    // Use IntersectionObserver for stats animation
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateStats();
                observer.disconnect();
            }
        });
    }, { threshold: 0.5 });

    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) observer.observe(heroStats);
});

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(10, 10, 15, 0.9)';
    } else {
        navbar.style.background = 'rgba(10, 10, 15, 0.7)';
    }
});
