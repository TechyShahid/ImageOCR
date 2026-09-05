/**
 * DocEdit Pro — PDF & Image Text Editor
 * Core application logic: file handling, OCR, overlay editing, save/export.
 */

// ============================================================
// PDF.js Setup
// ============================================================
const pdfjsLib = window['pdfjs-dist/build/pdf'] || null;
let pdfjsLoaded = false;

async function ensurePdfJs() {
  if (pdfjsLoaded) return;
  // Dynamically import PDF.js as an ES module
  try {
    const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    window.pdfjsLib = pdfjs;
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    pdfjsLoaded = true;
  } catch (e) {
    console.error('Failed to load PDF.js:', e);
    showToast('Failed to load PDF engine. Please refresh.', 'error');
  }
}

// ============================================================
// State
// ============================================================
const state = {
  file: null,           // original File object
  fileType: null,       // 'pdf' | 'image'
  fileBytes: null,      // ArrayBuffer of the original file

  // PDF state
  pdfDoc: null,
  currentPage: 1,
  totalPages: 1,

  // Per-page data
  pages: {},            // { pageNum: { canvas, words, originalImageData, cleanCanvas } }
  cleanCanvas: null,    // Pristine offscreen canvas for current page

  // Current page OCR words
  words: [],            // [{ text, originalText, bbox, confidence, el, lineIndex }]

  // Lines (for side panel)
  lines: [],            // [{ text, wordIndices }]

  // Undo / Redo
  undoStack: [],
  redoStack: [],

  // Active word tracking for font styling
  activeWordIdx: null,

  // Zoom
  zoom: 1,
  baseWidth: 0,
  baseHeight: 0,

  // Image data
  originalImage: null,  // HTMLImageElement for image files

  // Manual Add Text Mode
  isAddingText: false,
};

// ============================================================
// Font Family Definitions
// ============================================================
const FONT_FAMILIES = {
  'sans-serif': {
    name: 'Clean Sans (Arial / Standard)',
    css: "Arial, Helvetica, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Liberation Sans', sans-serif",
    type: 'sans-serif',
  },
  'inter': {
    name: 'Inter (Modern Sans)',
    css: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    type: 'sans-serif',
  },
  'pos-thermal': {
    name: 'POS Thermal (Chivo Mono)',
    css: "'Chivo Mono', 'Courier Prime', 'Space Mono', monospace",
    type: 'monospace',
  },
  'space-mono': {
    name: 'Space Mono (Receipt Numbers)',
    css: "'Space Mono', 'Courier Prime', monospace",
    type: 'monospace',
  },
  'courier': {
    name: 'Courier Prime (Typewriter / POS)',
    css: "'Courier Prime', 'Courier New', Courier, monospace",
    type: 'monospace',
  },
  'dot-matrix': {
    name: 'Dot Matrix / VT323',
    css: "'VT323', 'Space Mono', monospace",
    type: 'monospace',
  },
  'serif': {
    name: 'Times New Roman (Serif)',
    css: "'Times New Roman', Times, 'Liberation Serif', Georgia, serif",
    type: 'serif',
  },
  'monospace': {
    name: 'Consolas / Code Mono',
    css: "Consolas, 'Liberation Mono', Menlo, Monaco, monospace",
    type: 'monospace',
  },
};

// ============================================================
// DOM References
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  uploadScreen: $('#uploadScreen'),
  uploadZone: $('#uploadZone'),
  fileInput: $('#fileInput'),
  editorScreen: $('#editorScreen'),
  editorToolbar: $('#editorToolbar'),
  canvasViewport: $('#canvasViewport'),
  canvasContainer: $('#canvasContainer'),
  mainCanvas: $('#mainCanvas'),
  textOverlay: $('#textOverlay'),
  sidePanel: $('#sidePanel'),
  sidePanelContent: $('#sidePanelContent'),
  lineEditor: $('#lineEditor'),
  wordCount: $('#wordCount'),

  // Header
  fileInfo: $('#fileInfo'),
  fileName: $('#fileName'),
  btnNewFile: $('#btnNewFile'),
  btnSave: $('#btnSave'),

  // Toolbar
  pageNavGroup: $('#pageNavGroup'),
  btnPrevPage: $('#btnPrevPage'),
  btnNextPage: $('#btnNextPage'),
  pageIndicator: $('#pageIndicator'),
  btnZoomIn: $('#btnZoomIn'),
  btnZoomOut: $('#btnZoomOut'),
  btnZoomFit: $('#btnZoomFit'),
  zoomValue: $('#zoomValue'),
  btnUndo: $('#btnUndo'),
  btnRedo: $('#btnRedo'),
  btnTogglePanel: $('#btnTogglePanel'),
  btnClosePanel: $('#btnClosePanel'),
  sidePanelBackdrop: $('#sidePanelBackdrop'),

  // Font Toolbar Group
  fontToolbarGroup: $('#fontToolbarGroup'),
  fontFamilySelect: $('#fontFamilySelect'),
  btnFontSizeDec: $('#btnFontSizeDec'),
  fontSizeInput: $('#fontSizeInput'),
  btnFontSizeInc: $('#btnFontSizeInc'),
  btnFontBold: $('#btnFontBold'),
  btnFontItalic: $('#btnFontItalic'),
  btnResetWordStyle: $('#btnResetWordStyle'),

  // Shade / Darkness Controls
  btnShadeDarker: $('#btnShadeDarker'),
  inkShadeValue: $('#inkShadeValue'),
  btnShadeLighter: $('#btnShadeLighter'),
  textColorPicker: $('#textColorPicker'),
  colorPickerSwatch: $('#colorPickerSwatch'),
  btnAddText: $('#btnAddText'),

  // Floating Quick Toolbar
  floatingWordToolbar: $('#floatingWordToolbar'),
  floatingFontSelect: $('#floatingFontSelect'),
  floatingBtnDec: $('#floatingBtnDec'),
  floatingSizeBadge: $('#floatingSizeBadge'),
  floatingBtnInc: $('#floatingBtnInc'),
  floatingBtnBold: $('#floatingBtnBold'),
  floatingBtnItalic: $('#floatingBtnItalic'),
  floatingBtnDarker: $('#floatingBtnDarker'),
  floatingShadeBadge: $('#floatingShadeBadge'),
  floatingBtnLighter: $('#floatingBtnLighter'),
  floatingBtnReset: $('#floatingBtnReset'),

  // Loading
  loadingOverlay: $('#loadingOverlay'),
  loadingTitle: $('#loadingTitle'),
  loadingStatus: $('#loadingStatus'),
  progressFill: $('#progressFill'),
  progressText: $('#progressText'),

  // Toast
  toastContainer: $('#toastContainer'),
};

// ============================================================
// Initialization
// ============================================================
function init() {
  if (window.innerWidth <= 768) {
    closeSidePanel();
  }
  bindUploadEvents();
  bindToolbarEvents();
  bindFontToolbarEvents();
  bindKeyboardShortcuts();

  window.loadDocFromUrl = async (url) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const filename = url.split('/').pop() || 'document.pdf';
      const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
      handleFile(file);
    } catch (err) {
      console.error('Failed to load doc from url:', err);
    }
  };

  checkUrlParameters();
}

async function checkUrlParameters() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fileParam = params.get('file') || (params.get('demo') === 'true' ? 'sample_aadhaar.pdf' : null);
    if (fileParam) {
      const res = await fetch(fileParam);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const filename = fileParam.split('/').pop() || 'document.pdf';
      const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
      handleFile(file);
    }
  } catch (err) {
    console.warn('Could not auto-load file param:', err);
  }
}

// ============================================================
// Upload Handling
// ============================================================
function bindUploadEvents() {
  // Click to browse
  DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());

  // File input change
  DOM.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });

  // Drag & Drop
  DOM.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.uploadZone.classList.add('drag-over');
  });

  DOM.uploadZone.addEventListener('dragleave', () => {
    DOM.uploadZone.classList.remove('drag-over');
  });

  DOM.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });

  // New file button
  DOM.btnNewFile.addEventListener('click', resetToUpload);
}

async function handleFile(file) {
  const validTypes = [
    'application/pdf',
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp'
  ];

  if (!validTypes.includes(file.type)) {
    showToast('Unsupported file type. Please upload a PDF or image.', 'error');
    return;
  }

  state.file = file;
  state.fileType = file.type === 'application/pdf' ? 'pdf' : 'image';
  state.fileBytes = await file.arrayBuffer();

  // Reset state
  state.pages = {};
  state.words = [];
  state.lines = [];
  state.undoStack = [];
  state.redoStack = [];
  state.currentPage = 1;
  state.zoom = 1;

  // On mobile, ensure side panel is closed by default to give full screen to canvas
  if (window.innerWidth <= 768) {
    closeSidePanel();
  }

  // Update UI
  DOM.fileName.textContent = file.name;
  DOM.fileInfo.style.display = 'flex';
  DOM.btnNewFile.style.display = 'flex';
  DOM.btnSave.style.display = 'flex';

  // Transition to editor
  DOM.uploadScreen.classList.add('hidden');
  DOM.editorScreen.classList.add('active');

  if (state.fileType === 'pdf') {
    await loadPDF();
  } else {
    await loadImage();
  }
}

function resetToUpload() {
  // Reset state
  state.file = null;
  state.fileType = null;
  state.fileBytes = null;
  state.pdfDoc = null;
  state.pages = {};
  state.words = [];
  state.lines = [];
  state.undoStack = [];
  state.redoStack = [];
  state.originalImage = null;
  state.cleanCanvas = null;

  // Reset UI
  DOM.uploadScreen.classList.remove('hidden');
  DOM.editorScreen.classList.remove('active');
  DOM.fileInfo.style.display = 'none';
  DOM.btnNewFile.style.display = 'none';
  DOM.btnSave.style.display = 'none';
  DOM.pageNavGroup.style.display = 'none';
  DOM.textOverlay.innerHTML = '';
  DOM.lineEditor.innerHTML = '';
  DOM.fileInput.value = '';

  updateUndoRedoButtons();
}

// ============================================================
// PDF Loading
// ============================================================
async function loadPDF() {
  await ensurePdfJs();
  showLoading('Loading PDF', 'Parsing document...');
  updateProgress(10);

  try {
    const pdfData = new Uint8Array(state.fileBytes.slice(0));
    state.pdfDoc = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
    state.totalPages = state.pdfDoc.numPages;

    // Show page nav if multi-page
    if (state.totalPages > 1) {
      DOM.pageNavGroup.style.display = 'flex';
    } else {
      DOM.pageNavGroup.style.display = 'none';
    }
    updatePageIndicator();

    updateProgress(20);
    await renderPage(1);
  } catch (err) {
    console.error('PDF load error:', err);
    hideLoading();
    showToast('Failed to load PDF: ' + err.message, 'error');
  }
}

async function renderPage(pageNum) {
  showLoading('Processing Page ' + pageNum, 'Rendering...');
  updateProgress(25);

  const page = await state.pdfDoc.getPage(pageNum);
  const scale = 2; // Render at 2x for sharpness
  const viewport = page.getViewport({ scale });

  const canvas = DOM.mainCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  state.baseWidth = viewport.width / scale;
  state.baseHeight = viewport.height / scale;

  await page.render({ canvasContext: ctx, viewport }).promise;
  updateProgress(40);

  // Store pristine clean copy of the rendered page for seamless inpainting & undo
  const clean = document.createElement('canvas');
  clean.width = canvas.width;
  clean.height = canvas.height;
  clean.getContext('2d').drawImage(canvas, 0, 0);
  state.cleanCanvas = clean;
  if (!state.pages[pageNum]) state.pages[pageNum] = {};
  state.pages[pageNum].cleanCanvas = clean;

  // Run OCR on this page
  await runOCR(canvas, pageNum);

  // Apply zoom (auto fit to width on mobile)
  if (window.innerWidth <= 768) {
    zoomFit();
  } else {
    applyZoom();
  }
}

// ============================================================
// Image Loading
// ============================================================
async function loadImage() {
  showLoading('Loading Image', 'Reading file...');
  updateProgress(10);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      state.originalImage = img;
      state.totalPages = 1;
      DOM.pageNavGroup.style.display = 'none';

      const canvas = DOM.mainCanvas;
      const ctx = canvas.getContext('2d');

      // Limit max render size for performance
      const maxDim = 3000;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      state.baseWidth = w;
      state.baseHeight = h;

      // Store pristine clean copy of the image for seamless inpainting
      const clean = document.createElement('canvas');
      clean.width = canvas.width;
      clean.height = canvas.height;
      clean.getContext('2d').drawImage(canvas, 0, 0);
      state.cleanCanvas = clean;
      state.pages[1] = { cleanCanvas: clean };

      updateProgress(30);

      // Run OCR
      await runOCR(canvas, 1);

      if (window.innerWidth <= 768) {
        zoomFit();
      } else {
        applyZoom();
      }
      resolve();
    };

    img.onerror = () => {
      hideLoading();
      showToast('Failed to load image.', 'error');
      resolve();
    };

    const blob = new Blob([state.fileBytes], { type: state.file.type });
    img.src = URL.createObjectURL(blob);
  });
}

// ============================================================
// OCR — Tesseract.js
// ============================================================
async function runOCR(canvas, pageNum) {
  showLoading('Recognizing Text', 'Initializing OCR engine...');
  updateProgress(45);

  try {
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(45 + m.progress * 45);
          updateProgress(pct);
          updateLoadingStatus(`Recognizing text... ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    const { data } = await worker.recognize(canvas);
    updateProgress(88);
    updateLoadingStatus('Scanning vertical margin text & numbers...');

    const verticalLines = await scanVerticalMargins(canvas, worker);
    await worker.terminate();

    updateProgress(94);
    updateLoadingStatus('Building editor...');

    // Process words
    processOCRResults(data, pageNum, verticalLines);

    updateProgress(100);
    setTimeout(() => hideLoading(), 300);

    showToast(`Recognized ${state.words.length} words`, 'success');
  } catch (err) {
    console.error('OCR error:', err);
    hideLoading();
    showToast('OCR failed: ' + err.message, 'error');
  }
}

/**
 * Scan vertical document margins by rotating them 90 degrees to detect
 * vertical numbers, issue dates, timestamps, and margin metadata.
 */
async function scanVerticalMargins(canvas, worker) {
  const verticalLines = [];
  const width = canvas.width;
  const height = canvas.height;
  const cropW = Math.max(50, Math.round(width * 0.12));
  const cropH = height;

  try {
    // 1. Scan Left Margin: rotated +90deg (bottom-to-top text becomes left-to-right)
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = cropH;
    rotCanvas.height = cropW;
    const rotCtx = rotCanvas.getContext('2d');
    rotCtx.translate(cropH, 0);
    rotCtx.rotate(Math.PI / 2);
    rotCtx.drawImage(canvas, 0, 0, cropW, cropH, 0, 0, cropW, cropH);

    const marginRes = await worker.recognize(rotCanvas);
    if (marginRes && marginRes.data && marginRes.data.lines) {
      marginRes.data.lines.forEach(line => {
        const words = [];
        (line.words || []).forEach(w => {
          const rawText = (w.text || '').trim();
          if (!rawText || w.confidence < 35 || rawText.length === 0) return;

          // In rotCanvas: x in [0, cropH], y in [0, cropW]
          // Canvas coordinates: cx = ry; cy = cropH - rx;
          const rx0 = w.bbox.x0;
          const ry0 = w.bbox.y0;
          const rx1 = w.bbox.x1;
          const ry1 = w.bbox.y1;

          const cx0 = ry0;
          const cx1 = ry1;
          const cy0 = Math.max(0, cropH - rx1);
          const cy1 = Math.min(cropH, cropH - rx0);

          words.push({
            text: rawText,
            confidence: w.confidence,
            orientation: 'vertical-btt',
            bbox: {
              x0: cx0,
              y0: cy0,
              x1: cx1,
              y1: cy1,
            },
            symbols: w.symbols,
          });
        });

        if (words.length > 0) {
          verticalLines.push({
            words,
            text: words.map(w => w.text).join(' '),
            orientation: 'vertical-btt',
            cropW: cropW,
          });
        }
      });
    }
  } catch (err) {
    console.warn('Vertical margin scan notice:', err);
  }

  return verticalLines;
}

// ============================================================
// Text Style & Color Extraction Engine
// ============================================================
function rgbToHex(r, g, b) {
  const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex) {
  if (!hex) return null;
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b };
  } else if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function analyzeLineMetrics(line, canvas) {
  const words = line.words || [];
  let baselineY = null;
  const baselineSamples = [];
  const capTopSamples = [];
  const xTopSamples = [];

  // 1. If Tesseract provides baseline on line
  if (line.baseline && line.baseline.has_baseline) {
    baselineY = (line.baseline.y0 + line.baseline.y1) / 2;
  }

  // 2. Extract baseline, cap top, and x-height from characters / words
  for (const w of words) {
    if (w.symbols && w.symbols.length > 0) {
      for (const s of w.symbols) {
        const char = s.text;
        if (!char || !s.bbox) continue;
        const { y0, y1 } = s.bbox;
        // Non-descender characters that sit directly on the baseline
        if (/[A-Za-z0-9\$\#\%\&\*\+\=\<\>\?]/.test(char) && !/[gjpqyQ]/.test(char)) {
          baselineSamples.push(y1);
        }
        // Capital letters and tall ascenders that reach cap-height
        if (/[A-Z0-9bdfhkltI]/.test(char)) {
          capTopSamples.push(y0);
        }
        // Short lowercase letters that reach x-height
        if (/^[aceimnorsuvwxz]$/.test(char)) {
          xTopSamples.push(y0);
        }
      }
    } else {
      const text = (w.text || '').trim();
      const { y0, y1 } = w.bbox;
      if (text && !/[gjpqyQ]/.test(text)) {
        baselineSamples.push(y1);
      }
      if (/[A-Z0-9bdfhklt]/.test(text)) {
        capTopSamples.push(y0);
      } else if (/^[aceimnorsuvwxz\s.,\-_]+$/.test(text)) {
        xTopSamples.push(y0);
      }
    }
  }

  const median = (arr) => {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const medBaseline = median(baselineSamples);
  const medCapTop = median(capTopSamples);
  const medXTop = median(xTopSamples);

  if (medBaseline !== null) {
    baselineY = medBaseline;
  }

  // Calculate precise font size
  let exactFontSize = 0;

  if (baselineY !== null && medCapTop !== null && baselineY > medCapTop) {
    const capHeight = baselineY - medCapTop;
    // Cap height in standard Arial/Helvetica/Times is ~71.4% of font em-size
    exactFontSize = capHeight / 0.714;
  } else if (baselineY !== null && medXTop !== null && baselineY > medXTop) {
    const xHeight = baselineY - medXTop;
    // x-height in standard fonts is ~52.3% of font em-size
    exactFontSize = xHeight / 0.523;
  } else if (line.bbox && (line.bbox.y1 - line.bbox.y0) > 0) {
    const lineH = line.bbox.y1 - line.bbox.y0;
    exactFontSize = lineH * 0.90;
    if (baselineY === null) {
      baselineY = line.bbox.y0 + lineH * 0.82;
    }
  } else {
    const maxWordH = Math.max(...words.map(w => (w.bbox ? w.bbox.y1 - w.bbox.y0 : 16)));
    exactFontSize = maxWordH * 1.15;
    if (baselineY === null && words.length > 0 && words[0].bbox) {
      baselineY = words[0].bbox.y1;
    }
  }

  // Cross-calibrate with width measurement of words on canvas context
  if (canvas && exactFontSize > 0 && words.length > 0) {
    const testCtx = canvas.getContext('2d');
    const multiLetterWords = words.filter(w => (w.text || '').trim().length >= 3);
    if (multiLetterWords.length > 0) {
      const ratios = [];
      for (const w of multiLetterWords) {
        const text = w.text.trim();
        const bboxW = w.bbox.x1 - w.bbox.x0;
        testCtx.font = `normal 400 ${exactFontSize}px Arial, Helvetica, sans-serif`;
        const measuredW = testCtx.measureText(text).width;
        if (measuredW > 0 && bboxW > 0) {
          const ratio = bboxW / measuredW;
          if (ratio >= 0.7 && ratio <= 1.3) {
            ratios.push(ratio);
          }
        }
      }
      if (ratios.length > 0) {
        const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        exactFontSize = exactFontSize * (0.65 + 0.35 * avgRatio);
      }
    }
  }

  exactFontSize = Math.max(8, Math.round(exactFontSize * 10) / 10);

  return {
    fontSize: exactFontSize,
    baselineY: baselineY,
    lineBbox: line.bbox ? { ...line.bbox } : null,
  };
}

function extractTextStyleFromCanvas(canvas, bbox, ocrWord = {}, lineFontSize = null) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;

  const x0 = Math.max(0, Math.min(width - 1, Math.round(bbox.x0)));
  const y0 = Math.max(0, Math.min(height - 1, Math.round(bbox.y0)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.round(bbox.x1)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.round(bbox.y1)));

  const boxW = x1 - x0;
  const boxH = y1 - y0;

  // Expand sampling area slightly (2-4px margin) to sample surrounding background
  const margin = Math.min(4, Math.max(2, Math.round(boxH * 0.1)));
  const sx0 = Math.max(0, x0 - margin);
  const sy0 = Math.max(0, y0 - margin);
  const sx1 = Math.min(width, x1 + margin);
  const sy1 = Math.min(height, y1 + margin);
  const sw = sx1 - sx0;
  const sh = sy1 - sy0;

  let bgRGB = { r: 255, g: 255, b: 255 };
  let textRGB = { r: 0, g: 0, b: 0 };
  let isBold = false;
  let isItalic = false;
  let fontFamilyType = 'sans-serif'; // 'sans-serif' | 'serif' | 'monospace'
  let fontFamilyKey = 'sans-serif';

  try {
    const imgData = ctx.getImageData(sx0, sy0, sw, sh);
    const data = imgData.data;

    // 1. Extract Background Color:
    // Sample perimeter pixels (border ring of the sampled rectangle)
    const borderPixels = [];
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (x < 2 || x >= sw - 2 || y < 2 || y >= sh - 2) {
          const idx = (y * sw + x) * 4;
          const a = data[idx + 3];
          if (a > 128) {
            borderPixels.push({
              r: data[idx],
              g: data[idx + 1],
              b: data[idx + 2],
            });
          }
        }
      }
    }

    if (borderPixels.length > 0) {
      const rs = borderPixels.map(p => p.r).sort((a, b) => a - b);
      const gs = borderPixels.map(p => p.g).sort((a, b) => a - b);
      const bs = borderPixels.map(p => p.b).sort((a, b) => a - b);
      const mid = Math.floor(borderPixels.length / 2);
      bgRGB = { r: rs[mid], g: gs[mid], b: bs[mid] };
    }

    // 2. Extract Text Color & Pixel Density:
    // Sample inner box pixels (corresponding to actual word bbox)
    const innerPixels = [];
    const textPixels = [];
    const innerX0 = x0 - sx0;
    const innerY0 = y0 - sy0;
    const innerX1 = x1 - sx0;
    const innerY1 = y1 - sy0;

    for (let y = innerY0; y < innerY1; y++) {
      if (y < 0 || y >= sh) continue;
      for (let x = innerX0; x < innerX1; x++) {
        if (x < 0 || x >= sw) continue;
        const idx = (y * sw + x) * 4;
        const a = data[idx + 3];
        if (a < 128) continue;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Euclidean / luminance-weighted color distance from background
        const dist = Math.sqrt(
          0.299 * (r - bgRGB.r) ** 2 +
          0.587 * (g - bgRGB.g) ** 2 +
          0.114 * (b - bgRGB.b) ** 2
        );

        innerPixels.push({ r, g, b, dist });

        if (dist > 25) {
          textPixels.push({ r, g, b, dist });
        }
      }
    }

    // Determine text RGB
    if (textPixels.length > 0) {
      textPixels.sort((a, b) => b.dist - a.dist);
      const coreCount = Math.max(1, Math.floor(textPixels.length * 0.4));
      const corePixels = textPixels.slice(0, coreCount);

      const rs = corePixels.map(p => p.r).sort((a, b) => a - b);
      const gs = corePixels.map(p => p.g).sort((a, b) => a - b);
      const bs = corePixels.map(p => p.b).sort((a, b) => a - b);
      const mid = Math.floor(corePixels.length / 2);
      textRGB = { r: rs[mid], g: gs[mid], b: bs[mid] };
    } else {
      const bgLum = 0.299 * bgRGB.r + 0.587 * bgRGB.g + 0.114 * bgRGB.b;
      textRGB = bgLum > 128 ? { r: 15, g: 23, b: 42 } : { r: 248, g: 250, b: 252 };
    }

    // 3. Boldness / Weight Detection
    // By default, document text is regular (400) weight.
    // Only mark as bold if explicitly flagged by OCR or font name contains bold
    if (ocrWord.is_bold === true || /bold|heavy|black/i.test(ocrWord.font_name || '')) {
      isBold = true;
    }

    // 4. Italic Detection
    if (ocrWord.is_italic === true || /italic|oblique/i.test(ocrWord.font_name || '')) {
      isItalic = true;
    }

    // 5. Font Family Classification
    const fontName = (ocrWord.font_name || '').toLowerCase();
    const rawWordText = (ocrWord.text || '').trim();
    const isNumeric = /^[\$€£#₹]?\s*[\d]+([.,:\/-][\d]+)*\s*[%]?$/.test(rawWordText);

    if (ocrWord.is_monospace || /courier|mono|consolas|menlo|vt323/i.test(fontName)) {
      fontFamilyType = 'monospace';
      fontFamilyKey = 'courier';
    } else if (ocrWord.is_serif || /times|roman|serif|georgia|cambria|palatino|garamond/i.test(fontName)) {
      fontFamilyType = 'serif';
      fontFamilyKey = 'serif';
    } else if (isNumeric) {
      // In receipts, invoices and documents, numbers often have monospace tabular layout
      if (ocrWord.symbols && ocrWord.symbols.length >= 2) {
        const widths = ocrWord.symbols.map(s => s.bbox ? (s.bbox.x1 - s.bbox.x0) : 0).filter(w => w > 0);
        if (widths.length >= 2) {
          const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
          const maxDiff = Math.max(...widths.map(w => Math.abs(w - avg)));
          if (maxDiff <= 2.5) {
            fontFamilyType = 'monospace';
            fontFamilyKey = 'pos-thermal';
          }
        }
      }
    } else {
      fontFamilyType = 'sans-serif';
      fontFamilyKey = 'sans-serif';
    }
  } catch (err) {
    console.warn('Style extraction error for word:', err);
  }

  const bgHex = rgbToHex(bgRGB.r, bgRGB.g, bgRGB.b);
  const textHex = rgbToHex(textRGB.r, textRGB.g, textRGB.b);

  // Calculate precise font size
  const wordText = (ocrWord.text || '').trim();
  const isNum = /^[\$€£#₹]?\s*[\d]+([.,:\/-][\d]+)*\s*[%]?$/.test(wordText);
  let fontSize = lineFontSize;

  if (ocrWord.orientation === 'vertical-btt' && boxW > 0) {
    fontSize = Math.max(9, Math.round(boxW * 1.1));
  } else {
    if (isNum && boxH > 0) {
      // Digits typically occupy ~71-73% of the font em-square.
      const digitFontSize = Math.round((boxH / 0.72) * 10) / 10;
      if (!fontSize || Math.abs(fontSize - digitFontSize) > 4) {
        fontSize = digitFontSize;
      }
    }
    if (!fontSize) {
      fontSize = Math.max(9, Math.round(boxH * 1.15));
    }
  }
  fontSize = Math.max(6, Math.round(fontSize * 10) / 10);

  const fontDef = FONT_FAMILIES[fontFamilyKey] || FONT_FAMILIES['sans-serif'];
  const fontFamilyCSS = fontDef.css;

  return {
    bgColor: bgRGB,
    bgHex,
    bgRgbString: `rgb(${bgRGB.r}, ${bgRGB.g}, ${bgRGB.b})`,
    textColor: textRGB,
    baseTextColor: { ...textRGB },
    darknessLevel: 1.0,
    textHex,
    textRgbString: `rgb(${textRGB.r}, ${textRGB.g}, ${textRGB.b})`,
    fontSize,
    fontWeight: isBold ? '700' : '400',
    fontStyle: isItalic ? 'italic' : 'normal',
    fontFamilyKey,
    fontFamilyType,
    fontFamilyCSS,
    isBold,
    isItalic,
  };
}

function processOCRResults(data, pageNum, verticalLines = []) {
  state.words = [];
  state.lines = [];
  state.activeWordIdx = null;
  hideFloatingToolbar();
  syncFontControls(null);
  DOM.textOverlay.innerHTML = '';
  DOM.lineEditor.innerHTML = '';

  const canvas = DOM.mainCanvas;
  const marginCropW = (verticalLines && verticalLines.length > 0)
    ? (verticalLines[0].cropW || Math.round(canvas.width * 0.12))
    : 0;

  // 1. Process standard horizontal lines & words
  if (data.lines && data.lines.length > 0) {
    data.lines.forEach((line) => {
      const lineWords = [];
      const lineMetrics = analyzeLineMetrics(line, canvas);

      line.words.forEach((word) => {
        const text = (word.text || '').trim();
        if (!text) return;

        // Skip gibberish single/short characters in the margin strip where vertical text was found
        if (marginCropW > 0 && word.bbox && word.bbox.x1 <= marginCropW && text.length <= 3) {
          return;
        }

        const style = extractTextStyleFromCanvas(canvas, word.bbox, word, lineMetrics.fontSize);

        const wordData = {
          text: word.text,
          originalText: word.text,
          bbox: { ...word.bbox },
          lineBbox: lineMetrics.lineBbox,
          baselineY: lineMetrics.baselineY,
          confidence: word.confidence,
          lineIndex: state.lines.length,
          orientation: 'horizontal',
          style: style,
          originalStyle: { ...style },
          styleModified: false,
          el: null,         // visual overlay element
          panelEl: null,    // side panel element
        };

        const idx = state.words.length;
        state.words.push(wordData);
        lineWords.push(idx);
      });

      if (lineWords.length > 0) {
        state.lines.push({
          text: lineWords.map(i => state.words[i].text).join(' '),
          originalText: lineWords.map(i => state.words[i].originalText).join(' '),
          wordIndices: lineWords,
          orientation: 'horizontal',
        });
      }
    });
  }

  // 2. Add detected vertical margin lines & words (e.g. "Aadhaar No. Issued: 20/06/2026")
  if (verticalLines && verticalLines.length > 0) {
    verticalLines.forEach((vLine) => {
      const lineWords = [];
      const lineIdx = state.lines.length;

      vLine.words.forEach((word) => {
        const style = extractTextStyleFromCanvas(canvas, word.bbox, word);

        const wordData = {
          text: word.text,
          originalText: word.text,
          bbox: { ...word.bbox },
          lineBbox: { ...word.bbox },
          baselineY: null,
          confidence: word.confidence,
          lineIndex: lineIdx,
          orientation: 'vertical-btt',
          style: style,
          originalStyle: { ...style },
          styleModified: false,
          el: null,
          panelEl: null,
        };

        const idx = state.words.length;
        state.words.push(wordData);
        lineWords.push(idx);
      });

      if (lineWords.length > 0) {
        state.lines.push({
          text: lineWords.map(i => state.words[i].text).join(' '),
          originalText: lineWords.map(i => state.words[i].originalText).join(' '),
          wordIndices: lineWords,
          orientation: 'vertical-btt',
        });
      }
    });
  }

  // Create visual overlay
  createVisualOverlay();

  // Create side panel lines
  createSidePanelLines();

  // Update word count
  DOM.wordCount.textContent = `${state.words.length} words`;

  // Store page data
  state.pages[pageNum] = {
    words: [...state.words],
    lines: [...state.lines],
    cleanCanvas: state.cleanCanvas,
  };
}

// ============================================================
// Seamless Ink-Only Inpainting & Text Rendering Engine
// ============================================================

/**
 * Seamlessly inpaint only the dark ink characters of a word,
 * preserving 100% of the underlying paper texture, guilloche patterns,
 * gradients, and colors without creating any flat solid color patches.
 */
function inpaintWordCharacters(targetCanvas, word, cleanCanvas) {
  if (!targetCanvas || !word || !cleanCanvas) return;
  const targetCtx = targetCanvas.getContext('2d');
  const cleanCtx = cleanCanvas.getContext('2d');

  const { x0: origX0, x1: origX1, y0: origY0, y1: origY1 } = word.bbox;
  const lineY0 = word.lineBbox ? word.lineBbox.y0 : origY0;
  const lineY1 = word.lineBbox ? word.lineBbox.y1 : origY1;
  const baseY0 = Math.min(origY0, lineY0);
  const baseY1 = Math.max(origY1, lineY1);

  const padX = 4;
  const x0 = Math.max(0, Math.min(targetCanvas.width - 1, origX0 - padX));
  const x1 = Math.max(x0 + 1, Math.min(targetCanvas.width, origX1 + padX));
  const y0 = Math.max(0, Math.min(targetCanvas.height - 1, baseY0 - 1));
  const y1 = Math.max(y0 + 1, Math.min(targetCanvas.height, baseY1 + 1));

  const boxW = x1 - x0;
  const boxH = y1 - y0;
  if (boxW <= 0 || boxH <= 0) return;

  const cleanImgData = cleanCtx.getImageData(x0, y0, boxW, boxH);
  const cleanData = cleanImgData.data;

  // Sample top strip (above y0) and bottom strip (below y1)
  const sampleTopY = Math.max(0, y0 - 4);
  const topRows = y0 - sampleTopY;
  const sampleBotY = y1;
  const botRows = Math.min(cleanCanvas.height - sampleBotY, 4);

  let topColors = new Float32Array(boxW * 3);
  let botColors = new Float32Array(boxW * 3);

  if (topRows > 0) {
    const topData = cleanCtx.getImageData(x0, sampleTopY, boxW, topRows).data;
    for (let x = 0; x < boxW; x++) {
      let r = 0, g = 0, b = 0;
      for (let y = 0; y < topRows; y++) {
        const idx = (y * boxW + x) * 4;
        r += topData[idx];
        g += topData[idx + 1];
        b += topData[idx + 2];
      }
      topColors[x * 3] = r / topRows;
      topColors[x * 3 + 1] = g / topRows;
      topColors[x * 3 + 2] = b / topRows;
    }
  }

  if (botRows > 0) {
    const botData = cleanCtx.getImageData(x0, sampleBotY, boxW, botRows).data;
    for (let x = 0; x < boxW; x++) {
      let r = 0, g = 0, b = 0;
      for (let y = 0; y < botRows; y++) {
        const idx = (y * boxW + x) * 4;
        r += botData[idx];
        g += botData[idx + 1];
        b += botData[idx + 2];
      }
      botColors[x * 3] = r / botRows;
      botColors[x * 3 + 1] = g / botRows;
      botColors[x * 3 + 2] = b / botRows;
    }
  }

  if (topRows === 0 && botRows > 0) {
    topColors.set(botColors);
  } else if (botRows === 0 && topRows > 0) {
    botColors.set(topColors);
  }

  // Smooth topColors and botColors horizontally
  function smoothColors(colors, len) {
    const smoothed = new Float32Array(len * 3);
    for (let i = 0; i < len; i++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let di = -2; di <= 2; di++) {
        const idx = i + di;
        if (idx >= 0 && idx < len) {
          r += colors[idx * 3];
          g += colors[idx * 3 + 1];
          b += colors[idx * 3 + 2];
          count++;
        }
      }
      smoothed[i * 3] = r / count;
      smoothed[i * 3 + 1] = g / count;
      smoothed[i * 3 + 2] = b / count;
    }
    return smoothed;
  }
  topColors = smoothColors(topColors, boxW);
  botColors = smoothColors(botColors, boxW);

  const style = word.style || extractTextStyleFromCanvas(cleanCanvas, word.bbox, word);
  const isDarkText = (style.textColor.r * 0.299 + style.textColor.g * 0.587 + style.textColor.b * 0.114) <=
                     (style.bgColor.r * 0.299 + style.bgColor.g * 0.587 + style.bgColor.b * 0.114);

  const outImgData = targetCtx.createImageData(boxW, boxH);
  const outData = outImgData.data;

  const mask = new Uint8Array(boxW * boxH);
  const bufR = new Float32Array(boxW * boxH);
  const bufG = new Float32Array(boxW * boxH);
  const bufB = new Float32Array(boxW * boxH);

  for (let y = 0; y < boxH; y++) {
    const v = boxH > 1 ? y / (boxH - 1) : 0;
    for (let x = 0; x < boxW; x++) {
      const pIdx = y * boxW + x;
      const idx = pIdx * 4;

      const origR = cleanData[idx];
      const origG = cleanData[idx + 1];
      const origB = cleanData[idx + 2];

      const bgR = (1 - v) * topColors[x * 3] + v * botColors[x * 3];
      const bgG = (1 - v) * topColors[x * 3 + 1] + v * botColors[x * 3 + 1];
      const bgB = (1 - v) * topColors[x * 3 + 2] + v * botColors[x * 3 + 2];

      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

      let isInk = false;
      if (isDarkText) {
        const lumDiff = bgLum - origLum;
        const colorDist = Math.hypot(origR - bgR, origG - bgG, origB - bgB);
        isInk = (lumDiff > 12) || (colorDist > 22 && origLum < bgLum);
      } else {
        const lumDiff = origLum - bgLum;
        const colorDist = Math.hypot(origR - bgR, origG - bgG, origB - bgB);
        isInk = (lumDiff > 12) || (colorDist > 22 && origLum > bgLum);
      }

      if (isInk) {
        mask[pIdx] = 1;
        bufR[pIdx] = bgR;
        bufG[pIdx] = bgG;
        bufB[pIdx] = bgB;
      } else {
        mask[pIdx] = 0;
        bufR[pIdx] = origR;
        bufG[pIdx] = origG;
        bufB[pIdx] = origB;
      }
    }
  }

  // Dilate mask by 2 pixels to cleanly capture stroke edges and antialiasing
  const dilatedMask = new Uint8Array(boxW * boxH);
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const pIdx = y * boxW + x;
      if (mask[pIdx]) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < boxH && nx >= 0 && nx < boxW) {
              dilatedMask[ny * boxW + nx] = 1;
            }
          }
        }
      }
    }
  }

  // Initialize dilated mask pixels with background
  for (let y = 0; y < boxH; y++) {
    const v = boxH > 1 ? y / (boxH - 1) : 0;
    for (let x = 0; x < boxW; x++) {
      const pIdx = y * boxW + x;
      if (dilatedMask[pIdx] && !mask[pIdx]) {
        const bgR = (1 - v) * topColors[x * 3] + v * botColors[x * 3];
        const bgG = (1 - v) * topColors[x * 3 + 1] + v * botColors[x * 3 + 1];
        const bgB = (1 - v) * topColors[x * 3 + 2] + v * botColors[x * 3 + 2];
        bufR[pIdx] = bgR;
        bufG[pIdx] = bgG;
        bufB[pIdx] = bgB;
      }
    }
  }

  // 25 iterations of Laplace harmonic diffusion
  for (let iter = 0; iter < 25; iter++) {
    for (let y = 1; y < boxH - 1; y++) {
      for (let x = 1; x < boxW - 1; x++) {
        const pIdx = y * boxW + x;
        if (dilatedMask[pIdx]) {
          bufR[pIdx] = 0.25 * (bufR[pIdx - 1] + bufR[pIdx + 1] + bufR[pIdx - boxW] + bufR[pIdx + boxW]);
          bufG[pIdx] = 0.25 * (bufG[pIdx - 1] + bufG[pIdx + 1] + bufG[pIdx - boxW] + bufG[pIdx + boxW]);
          bufB[pIdx] = 0.25 * (bufB[pIdx - 1] + bufB[pIdx + 1] + bufB[pIdx - boxW] + bufB[pIdx + boxW]);
        }
      }
    }
  }

  // Combine back: replace ONLY ink pixels; keep 100% of non-ink background untouched
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const pIdx = y * boxW + x;
      const idx = pIdx * 4;
      if (dilatedMask[pIdx]) {
        outData[idx] = Math.round(bufR[pIdx]);
        outData[idx + 1] = Math.round(bufG[pIdx]);
        outData[idx + 2] = Math.round(bufB[pIdx]);
        outData[idx + 3] = 255;
      } else {
        outData[idx] = cleanData[idx];
        outData[idx + 1] = cleanData[idx + 1];
        outData[idx + 2] = cleanData[idx + 2];
        outData[idx + 3] = cleanData[idx + 3];
      }
    }
  }

  targetCtx.putImageData(outImgData, x0, y0);
}

/**
 * Render replacement characters for a word directly onto the canvas with crisp subpixel typography.
 */
function renderWordTextOnCanvas(targetCanvas, word) {
  if (!targetCanvas || !word || !word.text) return;
  const ctx = targetCanvas.getContext('2d');
  const style = word.style || extractTextStyleFromCanvas(targetCanvas, word.bbox, word);

  const { x0, x1, y0, y1 } = word.bbox;

  if (word.orientation === 'vertical-btt') {
    const boxW = x1 - x0;
    const fontSize = style.fontSize || Math.round(boxW * 0.85);
    const fontStr = `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${fontSize}px ${style.fontFamilyCSS}`;
    ctx.save();
    ctx.font = fontStr;
    ctx.fillStyle = style.textRgbString;
    ctx.textBaseline = 'alphabetic';
    ctx.translate(x0, y1);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(word.text, 0, boxW * 0.82);
    ctx.restore();
    return;
  }

  const lineY0 = word.lineBbox ? word.lineBbox.y0 : word.bbox.y0;
  const lineY1 = word.lineBbox ? word.lineBbox.y1 : word.bbox.y1;
  const effectiveY0 = Math.min(y0, lineY0);
  const effectiveY1 = Math.max(y1, lineY1);
  const boxH = effectiveY1 - effectiveY0;

  const fontSize = style.fontSize || 14;
  const fontStr = `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${fontSize}px ${style.fontFamilyCSS}`;
  ctx.font = fontStr;
  ctx.fillStyle = style.textRgbString;
  ctx.textBaseline = 'alphabetic';

  const canvasBaselineY = (word.baselineY !== null && word.baselineY !== undefined)
    ? word.baselineY
    : (effectiveY0 + boxH * 0.82);

  ctx.fillText(word.text, x0, canvasBaselineY);
}

/**
 * Re-render all modified words onto the main canvas starting from the pristine cleanCanvas.
 */
function renderAllModifiedWordsOnCanvas(canvas) {
  if (!canvas || !state.cleanCanvas) return;
  const ctx = canvas.getContext('2d');
  // 1. Reset canvas to pristine clean image
  ctx.drawImage(state.cleanCanvas, 0, 0);

  // 2. Filter modified words
  const modifiedWords = state.words.filter(w => w.text !== w.originalText || !!w.styleModified);

  // 3. For each modified word, inpaint old ink strokes seamlessly
  for (const word of modifiedWords) {
    inpaintWordCharacters(canvas, word, state.cleanCanvas);
  }

  // 4. For each modified word, draw new text characters
  for (const word of modifiedWords) {
    renderWordTextOnCanvas(canvas, word);
  }
}

// ============================================================
// Visual Overlay Editor & Font Controls
// ============================================================
function applyWordElementStyle(el, word, isEditing = false) {
  if (!el) return;
  const isModified = word.text !== word.originalText || !!word.styleModified;
  const style = word.style || extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  const { x0, x1, y0, y1 } = word.bbox;
  const boxW = x1 - x0;
  const boxH = y1 - y0;

  // Handle Bottom-to-Top Vertical Text (rot-90)
  if (word.orientation === 'vertical-btt') {
    const fontSize = style.fontSize || Math.round(boxW * 0.85);
    el.classList.add('vertical-word-box');
    el.style.fontFamily = style.fontFamilyCSS;
    el.style.fontWeight = style.fontWeight || '400';
    el.style.fontStyle = style.fontStyle || 'normal';
    el.style.fontSize = fontSize + 'px';
    el.style.lineHeight = '1.0';
    el.style.left = x0 + 'px';
    el.style.top = y1 + 'px';
    el.style.width = boxH + 'px';
    el.style.height = boxW + 'px';
    el.style.transformOrigin = '0 0';
    el.style.transform = 'rotate(-90deg)';
    el.style.backgroundColor = 'transparent';
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'flex-start';
    el.style.whiteSpace = 'nowrap';

    if (isEditing) {
      el.style.color = style.textRgbString;
      el.style.zIndex = '45';
      el.style.overflow = 'visible';
    } else if (isModified) {
      el.style.color = 'transparent';
      el.style.zIndex = '15';
      el.style.overflow = 'visible';
    } else {
      el.style.color = 'transparent';
      el.style.zIndex = '1';
      el.style.overflow = 'hidden';
    }
    return;
  }

  const lineY0 = word.lineBbox ? word.lineBbox.y0 : word.bbox.y0;
  const lineY1 = word.lineBbox ? word.lineBbox.y1 : word.bbox.y1;
  const effectiveY0 = Math.min(y0, lineY0);
  const effectiveY1 = Math.max(y1, lineY1);
  const effectiveBoxH = effectiveY1 - effectiveY0;

  const fontSize = style.fontSize || 14;
  const effectiveHeight = Math.max(effectiveBoxH, Math.round(fontSize * 1.25));

  el.style.fontFamily = style.fontFamilyCSS;
  el.style.fontWeight = style.fontWeight || '400';
  el.style.fontStyle = style.fontStyle || 'normal';
  el.style.fontSize = fontSize + 'px';
  el.style.lineHeight = '1.15';
  el.style.display = 'inline-flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'flex-start';

  // NEVER set an opaque solid background - keep 100% transparent to preserve background
  el.style.backgroundColor = 'transparent';

  if (isEditing) {
    // When typing, show text in DOM element so user sees what they type
    el.style.color = style.textRgbString;
    el.style.minWidth = boxW + 'px';
    el.style.width = 'auto';
    el.style.minHeight = boxH + 'px';
    el.style.height = effectiveHeight + 'px';
    if (effectiveHeight > boxH) {
      const diffY = effectiveHeight - boxH;
      el.style.top = Math.max(0, y0 - diffY / 2) + 'px';
    } else {
      el.style.top = y0 + 'px';
    }
    el.style.padding = '0 3px';
    el.style.zIndex = '25';
    el.style.overflow = 'visible';
    el.style.whiteSpace = 'nowrap';
  } else if (isModified) {
    // Word is modified: the canvas underneath already displays the inpainting + text
    // The DOM overlay remains transparent and allows clicking/focusing
    el.style.color = 'transparent';
    el.style.minWidth = boxW + 'px';
    el.style.width = 'auto';
    el.style.minHeight = boxH + 'px';
    el.style.height = effectiveHeight + 'px';
    if (effectiveHeight > boxH) {
      const diffY = effectiveHeight - boxH;
      el.style.top = Math.max(0, y0 - diffY / 2) + 'px';
    } else {
      el.style.top = y0 + 'px';
    }
    el.style.padding = '0 3px';
    el.style.zIndex = '15';
    el.style.overflow = 'visible';
    el.style.whiteSpace = 'nowrap';
  } else {
    el.style.color = 'transparent';
    el.style.minWidth = boxW + 'px';
    el.style.width = boxW + 'px';
    el.style.minHeight = boxH + 'px';
    el.style.height = boxH + 'px';
    el.style.top = y0 + 'px';
    el.style.padding = '0';
    el.style.zIndex = '1';
    el.style.overflow = 'hidden';
    el.style.whiteSpace = 'nowrap';
  }
}

function syncFontControls(word) {
  if (!word || !word.style) {
    if (DOM.fontToolbarGroup) {
      DOM.fontToolbarGroup.style.opacity = '0.45';
      DOM.fontToolbarGroup.style.pointerEvents = 'none';
    }
    return;
  }

  if (DOM.fontToolbarGroup) {
    DOM.fontToolbarGroup.style.opacity = '1';
    DOM.fontToolbarGroup.style.pointerEvents = 'all';
  }

  const style = word.style;
  const fontKey = style.fontFamilyKey || 'sans-serif';
  const size = Math.round(style.fontSize || 14);
  const isBold = style.fontWeight === '700' || !!style.isBold;
  const isItalic = style.fontStyle === 'italic' || !!style.isItalic;

  // Sync toolbar selects
  if (DOM.fontFamilySelect) DOM.fontFamilySelect.value = fontKey;
  if (DOM.fontSizeInput) DOM.fontSizeInput.value = size;
  if (DOM.btnFontBold) DOM.btnFontBold.classList.toggle('active', isBold);
  if (DOM.btnFontItalic) DOM.btnFontItalic.classList.toggle('active', isItalic);

  // Sync floating toolbar
  if (DOM.floatingFontSelect) DOM.floatingFontSelect.value = fontKey;
  if (DOM.floatingSizeBadge) DOM.floatingSizeBadge.textContent = `${size}px`;
  if (DOM.floatingBtnBold) DOM.floatingBtnBold.classList.toggle('active', isBold);
  if (DOM.floatingBtnItalic) DOM.floatingBtnItalic.classList.toggle('active', isItalic);

  // Sync ink shade / darkness & color
  const level = Math.round(((style && style.darknessLevel !== undefined) ? style.darknessLevel : 1.0) * 100);
  const colorHex = (style && style.textHex) ? style.textHex : '#000000';

  if (DOM.inkShadeValue) DOM.inkShadeValue.textContent = `${level}%`;
  if (DOM.floatingShadeBadge) DOM.floatingShadeBadge.textContent = `${level}%`;
  if (DOM.textColorPicker) DOM.textColorPicker.value = colorHex;
  if (DOM.colorPickerSwatch) DOM.colorPickerSwatch.style.backgroundColor = colorHex;
}

function showFloatingToolbar(wordIdx) {
  if (wordIdx === null || wordIdx === undefined) return;
  const word = state.words[wordIdx];
  if (!word || !word.el) return;

  if (DOM.floatingWordToolbar) {
    DOM.floatingWordToolbar.style.display = 'flex';
    syncFontControls(word);
    positionFloatingToolbar(wordIdx);
  }
}

function hideFloatingToolbar() {
  if (DOM.floatingWordToolbar) {
    DOM.floatingWordToolbar.style.display = 'none';
  }
}

function positionFloatingToolbar(wordIdx) {
  if (wordIdx === null || wordIdx === undefined) wordIdx = state.activeWordIdx;
  if (wordIdx === null || wordIdx === undefined) return;
  const word = state.words[wordIdx];
  if (!word || !word.el) return;

  const toolbar = DOM.floatingWordToolbar;
  if (!toolbar || toolbar.style.display === 'none') return;

  const wordRect = word.el.getBoundingClientRect();
  const vpRect = DOM.canvasViewport.getBoundingClientRect();

  const toolbarWidth = toolbar.offsetWidth || 260;
  const toolbarHeight = toolbar.offsetHeight || 34;

  let left = wordRect.left + (wordRect.width / 2) - (toolbarWidth / 2);
  const minLeft = vpRect.left + 10;
  const maxLeft = vpRect.right - toolbarWidth - 10;
  left = Math.max(minLeft, Math.min(maxLeft, left));

  let top = wordRect.top - toolbarHeight - 8;
  if (top < vpRect.top + 10) {
    top = wordRect.bottom + 8;
  }

  toolbar.style.position = 'fixed';
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
}

function changeActiveWordFontSize(delta) {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  const currentSize = (word.style && word.style.fontSize) ? word.style.fontSize : 14;
  const newSize = Math.max(6, Math.min(150, Math.round((currentSize + delta) * 10) / 10));
  setActiveWordFontSize(newSize);
}

function setActiveWordFontSize(newSize) {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  if (!word.style) {
    word.style = extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  }

  pushStyleUndo(state.activeWordIdx, { ...word.style });

  word.style.fontSize = newSize;
  word.styleModified = true;

  if (word.el) {
    word.el.classList.add('modified');
    applyWordElementStyle(word.el, word, document.activeElement === word.el);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  syncFontControls(word);
  positionFloatingToolbar(state.activeWordIdx);
}

function setActiveWordFontFamily(fontKey) {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  const fontDef = FONT_FAMILIES[fontKey] || FONT_FAMILIES['sans-serif'];
  if (!word.style) {
    word.style = extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  }

  pushStyleUndo(state.activeWordIdx, { ...word.style });

  word.style.fontFamilyKey = fontKey;
  word.style.fontFamilyCSS = fontDef.css;
  word.style.fontFamilyType = fontDef.type;
  word.styleModified = true;

  if (word.el) {
    word.el.classList.add('modified');
    applyWordElementStyle(word.el, word, document.activeElement === word.el);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  syncFontControls(word);
  positionFloatingToolbar(state.activeWordIdx);
}

function toggleActiveWordBold() {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  if (!word.style) {
    word.style = extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  }

  pushStyleUndo(state.activeWordIdx, { ...word.style });

  word.style.isBold = !word.style.isBold;
  word.style.fontWeight = word.style.isBold ? '700' : '400';
  word.styleModified = true;

  if (word.el) {
    word.el.classList.add('modified');
    applyWordElementStyle(word.el, word, document.activeElement === word.el);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  syncFontControls(word);
}

function toggleActiveWordItalic() {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  if (!word.style) {
    word.style = extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  }

  pushStyleUndo(state.activeWordIdx, { ...word.style });

  word.style.isItalic = !word.style.isItalic;
  word.style.fontStyle = word.style.isItalic ? 'italic' : 'normal';
  word.styleModified = true;

  if (word.el) {
    word.el.classList.add('modified');
    applyWordElementStyle(word.el, word, document.activeElement === word.el);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  syncFontControls(word);
}

function adjustActiveWordDarkness(delta) {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  if (!word.style) {
    word.style = extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  }

  pushStyleUndo(state.activeWordIdx, { ...word.style });

  // Current darkness level (1.0 = 100% normal detected shade)
  // Step by 0.15 (15%), range 0.20 to 2.00
  const currentLevel = (word.style.darknessLevel !== undefined) ? word.style.darknessLevel : 1.0;
  const newLevel = Math.max(0.20, Math.min(2.0, Math.round((currentLevel + delta) * 100) / 100));

  applyWordDarknessLevel(word, newLevel);
}

function applyWordDarknessLevel(word, newLevel) {
  if (!word.style.baseTextColor) {
    word.style.baseTextColor = { ...word.style.textColor };
  }
  const base = word.style.baseTextColor;
  const bg = word.style.bgColor || { r: 255, g: 255, b: 255 };

  let r, g, b;
  if (newLevel >= 1.0) {
    // Darker: interpolate towards pure black (0, 0, 0)
    const t = Math.min(1.0, newLevel - 1.0);
    r = Math.max(0, Math.round(base.r * (1 - t)));
    g = Math.max(0, Math.round(base.g * (1 - t)));
    b = Math.max(0, Math.round(base.b * (1 - t)));
  } else {
    // Lighter: fade towards document background color (or lighter gray)
    const t = Math.min(1.0, 1.0 - newLevel);
    r = Math.min(255, Math.round(base.r * (1 - t) + bg.r * t));
    g = Math.min(255, Math.round(base.g * (1 - t) + bg.g * t));
    b = Math.min(255, Math.round(base.b * (1 - t) + bg.b * t));
  }

  word.style.darknessLevel = newLevel;
  word.style.textColor = { r, g, b };
  word.style.textHex = rgbToHex(r, g, b);
  word.style.textRgbString = `rgb(${r}, ${g}, ${b})`;
  word.styleModified = true;

  if (word.el) {
    word.el.classList.add('modified');
    applyWordElementStyle(word.el, word, document.activeElement === word.el);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  syncFontControls(word);
}

function setActiveWordColor(hex) {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  if (!word.style) {
    word.style = extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  }

  pushStyleUndo(state.activeWordIdx, { ...word.style });

  const parsed = hexToRgb(hex);
  if (!parsed) return;

  word.style.baseTextColor = { ...parsed };
  word.style.textColor = { ...parsed };
  word.style.textHex = hex;
  word.style.textRgbString = `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;
  word.style.darknessLevel = 1.0;
  word.styleModified = true;

  if (word.el) {
    word.el.classList.add('modified');
    applyWordElementStyle(word.el, word, document.activeElement === word.el);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  syncFontControls(word);
}

function resetActiveWordStyle() {
  if (state.activeWordIdx === null || state.activeWordIdx === undefined) return;
  const word = state.words[state.activeWordIdx];
  if (!word) return;

  if (word.originalStyle) {
    pushStyleUndo(state.activeWordIdx, { ...word.style });
    word.style = {
      ...word.originalStyle,
      baseTextColor: { ...word.originalStyle.textColor },
      darknessLevel: 1.0,
    };
    word.styleModified = false;
    if (word.text === word.originalText && word.el) {
      word.el.classList.remove('modified');
    }
    if (word.el) {
      applyWordElementStyle(word.el, word, document.activeElement === word.el);
    }
    renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
    syncFontControls(word);
    positionFloatingToolbar(state.activeWordIdx);
    showToast('Reset to detected font style & shade', 'info');
  }
}

function createVisualOverlay() {
  DOM.textOverlay.innerHTML = '';

  state.words.forEach((word, idx) => {
    const el = document.createElement('div');
    el.className = 'word-box';
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.textContent = word.text;
    el.dataset.wordIdx = idx;

    // Position based on bbox (using line-level height for baseline consistency)
    const isVertical = word.orientation === 'vertical-btt';
    const { x0, x1, y0, y1 } = word.bbox;
    const boxW = x1 - x0;
    const boxH = y1 - y0;

    if (isVertical) {
      el.classList.add('vertical-word-box');
      el.style.left = x0 + 'px';
      el.style.top = y1 + 'px';
      el.style.width = boxH + 'px';
      el.style.height = boxW + 'px';
      el.style.transformOrigin = '0 0';
      el.style.transform = 'rotate(-90deg)';
    } else {
      const lineY0 = word.lineBbox ? word.lineBbox.y0 : word.bbox.y0;
      const lineY1 = word.lineBbox ? word.lineBbox.y1 : word.bbox.y1;
      const effectiveY0 = Math.min(y0, lineY0);
      const effectiveY1 = Math.max(y1, lineY1);
      const effectiveBoxH = effectiveY1 - effectiveY0;

      el.style.left = x0 + 'px';
      el.style.top = effectiveY0 + 'px';
      el.style.height = effectiveBoxH + 'px';
      el.style.minWidth = boxW + 'px';
    }

    if (word.text !== word.originalText || word.styleModified) {
      el.classList.add('modified');
    }

    applyWordElementStyle(el, word, false);

    // Events
    el.addEventListener('focus', () => {
      state.activeWordIdx = idx;
      el.classList.add('editing');
      if (state.cleanCanvas) {
        // Inpaint the underlying word so no double text appears while typing
        inpaintWordCharacters(DOM.mainCanvas, word, state.cleanCanvas);
      }
      applyWordElementStyle(el, word, true);
      highlightSidePanelLine(word.lineIndex);
      syncFontControls(word);
      showFloatingToolbar(idx);
    });

    el.addEventListener('input', () => {
      word.text = el.textContent;
      el.classList.toggle('modified', word.text !== word.originalText || !!word.styleModified);
    });

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeWordIdx = idx;
      syncFontControls(word);
      showFloatingToolbar(idx);
    });

    el.addEventListener('blur', () => {
      el.classList.remove('editing');
      const newText = el.textContent.trim();
      if (newText !== word.text) {
        pushUndo(idx, word.text, newText);
        word.text = newText;
      }
      el.classList.toggle('modified', word.text !== word.originalText || !!word.styleModified);
      renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
      applyWordElementStyle(el, word, false);
      syncSidePanelLine(word.lineIndex);

      setTimeout(() => {
        const active = document.activeElement;
        const insideToolbar = active && (active.closest('#floatingWordToolbar') || active.closest('#fontToolbarGroup'));
        if (!insideToolbar && (!active || !active.classList.contains('word-box'))) {
          hideFloatingToolbar();
        }
      }, 180);
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        // Focus next word
        const nextIdx = idx + 1;
        if (nextIdx < state.words.length && state.words[nextIdx].el) {
          state.words[nextIdx].el.focus();
        }
      }
      // Bracket keys for quick font size adjustment while editing
      if ((e.key === '[' || e.key === '{') && (e.ctrlKey || e.metaKey || e.altKey)) {
        e.preventDefault();
        changeActiveWordFontSize(-1);
      }
      if ((e.key === ']' || e.key === '}') && (e.ctrlKey || e.metaKey || e.altKey)) {
        e.preventDefault();
        changeActiveWordFontSize(1);
      }
      if ((e.key === 'b' || e.key === 'B') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleActiveWordBold();
      }
      if ((e.key === 'i' || e.key === 'I') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleActiveWordItalic();
      }
    });

    word.el = el;
    DOM.textOverlay.appendChild(el);
  });
}

// ============================================================
// Side Panel — Line Editor
// ============================================================
function createSidePanelLines() {
  DOM.lineEditor.innerHTML = '';

  state.lines.forEach((line, lineIdx) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'text-line';
    lineEl.dataset.lineIdx = lineIdx;

    const numEl = document.createElement('span');
    numEl.className = 'line-number';
    numEl.textContent = lineIdx + 1;

    const contentEl = document.createElement('div');
    contentEl.className = 'line-content';
    contentEl.contentEditable = 'true';
    contentEl.spellcheck = true;
    contentEl.textContent = line.text;
    contentEl.dataset.lineIdx = lineIdx;

    contentEl.addEventListener('focus', () => {
      lineEl.classList.add('active');
      // Highlight corresponding words on canvas
      line.wordIndices.forEach(idx => {
        if (state.words[idx].el) {
          state.words[idx].el.classList.add('highlighted');
        }
      });
      scrollToWord(line.wordIndices[0]);
    });

    contentEl.addEventListener('blur', () => {
      lineEl.classList.remove('active');
      line.wordIndices.forEach(idx => {
        if (state.words[idx].el) {
          state.words[idx].el.classList.remove('highlighted');
        }
      });

      const newText = contentEl.textContent.trim();
      if (newText !== line.text) {
        // Update line
        line.text = newText;

        // Split new text into words and assign back
        const newWords = newText.split(/\s+/);
        line.wordIndices.forEach((wordIdx, i) => {
          const word = state.words[wordIdx];
          const oldWordText = word.text;
          const newWordText = i < newWords.length ? newWords[i] : '';

          if (newWordText !== oldWordText) {
            pushUndo(wordIdx, oldWordText, newWordText);
            word.text = newWordText;
            if (word.el) {
              word.el.textContent = newWordText;
              word.el.classList.toggle('modified', newWordText !== word.originalText);
              applyWordElementStyle(word.el, word, false);
            }
          }
        });

        // Handle extra words if user added more than original count
        // (We'll just combine extras into the last word)
        if (newWords.length > line.wordIndices.length && line.wordIndices.length > 0) {
          const lastIdx = line.wordIndices[line.wordIndices.length - 1];
          const word = state.words[lastIdx];
          const extraWords = newWords.slice(line.wordIndices.length - 1).join(' ');
          if (extraWords !== word.text) {
            pushUndo(lastIdx, word.text, extraWords);
            word.text = extraWords;
            if (word.el) {
              word.el.textContent = extraWords;
              word.el.classList.toggle('modified', extraWords !== word.originalText);
              applyWordElementStyle(word.el, word, false);
            }
          }
        }

        contentEl.classList.toggle('modified', newText !== line.originalText);
        renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
      }
    });

    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        contentEl.blur();
      }
    });

    line.panelEl = contentEl;
    lineEl.appendChild(numEl);
    lineEl.appendChild(contentEl);
    DOM.lineEditor.appendChild(lineEl);
  });
}

function syncSidePanelLine(lineIdx) {
  const line = state.lines[lineIdx];
  if (!line) return;

  const newText = line.wordIndices.map(i => state.words[i].text).join(' ');
  line.text = newText;

  if (line.panelEl) {
    line.panelEl.textContent = newText;
    line.panelEl.classList.toggle('modified', newText !== line.originalText);
  }
}

function highlightSidePanelLine(lineIdx) {
  DOM.lineEditor.querySelectorAll('.text-line.active').forEach(el => el.classList.remove('active'));

  const lineEl = DOM.lineEditor.querySelector(`.text-line[data-line-idx="${lineIdx}"]`);
  if (lineEl) {
    lineEl.classList.add('active');
    lineEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function scrollToWord(wordIdx) {
  const word = state.words[wordIdx];
  if (!word || !word.el) return;

  word.el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

// ============================================================
// Undo / Redo
// ============================================================
function pushUndo(wordIdx, oldText, newText) {
  state.undoStack.push({ type: 'text', wordIdx, oldText, newText });
  state.redoStack = []; // Clear redo on new edit
  updateUndoRedoButtons();
}

function pushStyleUndo(wordIdx, oldStyle) {
  state.undoStack.push({
    type: 'style',
    wordIdx,
    oldStyle: { ...oldStyle },
    newStyle: null,
  });
  state.redoStack = [];
  updateUndoRedoButtons();
}

function performUndo() {
  if (state.undoStack.length === 0) return;

  const action = state.undoStack.pop();
  const word = state.words[action.wordIdx];
  if (!word) return;

  if (action.type === 'style') {
    action.newStyle = { ...word.style };
    word.style = { ...action.oldStyle };
    word.styleModified = true;
    if (word.el) {
      applyWordElementStyle(word.el, word, document.activeElement === word.el);
    }
    syncFontControls(word);
    state.redoStack.push(action);
  } else {
    word.text = action.oldText;
    if (word.el) {
      word.el.textContent = action.oldText;
      word.el.classList.toggle('modified', word.text !== word.originalText || !!word.styleModified);
      applyWordElementStyle(word.el, word, false);
    }
    syncSidePanelLine(word.lineIndex);
    state.redoStack.push(action);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  updateUndoRedoButtons();
  if (state.activeWordIdx !== null) positionFloatingToolbar(state.activeWordIdx);
}

function performRedo() {
  if (state.redoStack.length === 0) return;

  const action = state.redoStack.pop();
  const word = state.words[action.wordIdx];
  if (!word) return;

  if (action.type === 'style') {
    if (action.newStyle) {
      word.style = { ...action.newStyle };
      word.styleModified = true;
      if (word.el) {
        applyWordElementStyle(word.el, word, document.activeElement === word.el);
      }
      syncFontControls(word);
    }
    state.undoStack.push(action);
  } else {
    word.text = action.newText;
    if (word.el) {
      word.el.textContent = action.newText;
      word.el.classList.toggle('modified', word.text !== word.originalText || !!word.styleModified);
      applyWordElementStyle(word.el, word, false);
    }
    syncSidePanelLine(word.lineIndex);
    state.undoStack.push(action);
  }

  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);
  updateUndoRedoButtons();
  if (state.activeWordIdx !== null) positionFloatingToolbar(state.activeWordIdx);
}

function updateUndoRedoButtons() {
  DOM.btnUndo.disabled = state.undoStack.length === 0;
  DOM.btnRedo.disabled = state.redoStack.length === 0;
}

// ============================================================
// Zoom
// ============================================================
function applyZoom() {
  const w = state.baseWidth * state.zoom;
  const h = state.baseHeight * state.zoom;

  DOM.canvasContainer.style.width = w + 'px';
  DOM.canvasContainer.style.height = h + 'px';
  DOM.mainCanvas.style.width = w + 'px';
  DOM.mainCanvas.style.height = h + 'px';

  // Scale overlay to match
  const scaleX = w / DOM.mainCanvas.width;
  const scaleY = h / DOM.mainCanvas.height;
  DOM.textOverlay.style.width = DOM.mainCanvas.width + 'px';
  DOM.textOverlay.style.height = DOM.mainCanvas.height + 'px';
  DOM.textOverlay.style.transform = `scale(${scaleX}, ${scaleY})`;
  DOM.textOverlay.style.transformOrigin = 'top left';

  DOM.zoomValue.textContent = Math.round(state.zoom * 100) + '%';
  if (state.activeWordIdx !== null) positionFloatingToolbar(state.activeWordIdx);
}

function zoomIn() {
  state.zoom = Math.min(3, state.zoom + 0.15);
  applyZoom();
}

function zoomOut() {
  state.zoom = Math.max(0.25, state.zoom - 0.15);
  applyZoom();
}

function zoomFit() {
  if (!state.baseWidth || state.baseWidth <= 0) return;
  const isMobile = window.innerWidth <= 768;
  const vpPadding = isMobile ? 24 : 48;
  let vpWidth = DOM.canvasViewport.clientWidth;
  if (!vpWidth || vpWidth < 100) {
    vpWidth = window.innerWidth;
  }
  const availableWidth = Math.max(100, vpWidth - vpPadding);
  const fitZoom = availableWidth / state.baseWidth;
  state.zoom = Math.max(0.15, Math.min(3, fitZoom));
  applyZoom();
}

// ============================================================
// Page Navigation
// ============================================================
function goToPage(pageNum) {
  if (pageNum < 1 || pageNum > state.totalPages) return;
  if (pageNum === state.currentPage) return;

  // Save current page data
  state.pages[state.currentPage] = {
    words: [...state.words],
    lines: [...state.lines],
  };

  state.currentPage = pageNum;
  updatePageIndicator();
  hideFloatingToolbar();
  state.activeWordIdx = null;
  syncFontControls(null);

  // Check if page already processed
  if (state.pages[pageNum]) {
    // Restore cached data
    state.words = state.pages[pageNum].words;
    state.lines = state.pages[pageNum].lines;
    // Re-render page canvas
    renderPageFromCache(pageNum);
  } else {
    renderPage(pageNum);
  }
}

async function renderPageFromCache(pageNum) {
  showLoading('Loading Page ' + pageNum, 'Rendering...');
  updateProgress(30);

  const page = await state.pdfDoc.getPage(pageNum);
  const scale = 2;
  const viewport = page.getViewport({ scale });

  const canvas = DOM.mainCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  state.baseWidth = viewport.width / scale;
  state.baseHeight = viewport.height / scale;

  await page.render({ canvasContext: ctx, viewport }).promise;
  updateProgress(80);

  // Snapshot clean canvas
  const clean = document.createElement('canvas');
  clean.width = canvas.width;
  clean.height = canvas.height;
  clean.getContext('2d').drawImage(canvas, 0, 0);
  state.cleanCanvas = clean;
  if (state.pages[pageNum]) state.pages[pageNum].cleanCanvas = clean;

  // Re-render modified words onto the canvas
  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);

  // Rebuild overlay from cached words
  createVisualOverlay();
  createSidePanelLines();

  DOM.wordCount.textContent = `${state.words.length} words`;

  if (window.innerWidth <= 768) {
    zoomFit();
  } else {
    applyZoom();
  }
  updateProgress(100);
  setTimeout(() => hideLoading(), 200);
}

function updatePageIndicator() {
  DOM.pageIndicator.textContent = `${state.currentPage} / ${state.totalPages}`;
  DOM.btnPrevPage.disabled = state.currentPage <= 1;
  DOM.btnNextPage.disabled = state.currentPage >= state.totalPages;
}

// ============================================================
// Save / Export
// ============================================================
async function saveFile() {
  if (state.fileType === 'pdf') {
    await savePDF();
  } else {
    saveImage();
  }
}

async function savePDF() {
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }

  showLoading('Saving PDF', 'Applying text changes...');
  updateProgress(10);

  try {
    const { PDFDocument } = PDFLib;

    // Load original PDF (retrieve fresh ArrayBuffer to prevent detachment errors)
    const pdfBytes = state.file ? await state.file.arrayBuffer() : state.fileBytes.slice(0);
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });

    // Ensure all custom fonts are ready before export
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Process all pages that have edits
    const pagesToProcess = Object.keys(state.pages).map(Number);
    if (!pagesToProcess.includes(state.currentPage)) {
      state.pages[state.currentPage] = {
        words: [...state.words],
        lines: [...state.lines],
        cleanCanvas: state.cleanCanvas,
      };
      pagesToProcess.push(state.currentPage);
    }

    for (const pageNum of pagesToProcess) {
      const pageData = state.pages[pageNum];
      if (!pageData) continue;

      const pageWords = (pageNum === state.currentPage) ? state.words : (pageData.words || []);
      const modifiedWords = pageWords.filter(w => w.text !== w.originalText || !!w.styleModified);

      // Only modify pages that actually have edits
      if (modifiedWords.length === 0) continue;

      const page = pdfDoc.getPages()[pageNum - 1];
      if (!page) continue;

      const { width: pdfWidth, height: pdfHeight } = page.getSize();

      let pageCanvas;
      if (pageNum === state.currentPage) {
        pageCanvas = DOM.mainCanvas;
        renderAllModifiedWordsOnCanvas(pageCanvas);
      } else {
        pageCanvas = document.createElement('canvas');
        pageCanvas.width = pageData.cleanCanvas.width;
        pageCanvas.height = pageData.cleanCanvas.height;
        const pageCtx = pageCanvas.getContext('2d');
        pageCtx.drawImage(pageData.cleanCanvas, 0, 0);
        for (const w of modifiedWords) {
          inpaintWordCharacters(pageCanvas, w, pageData.cleanCanvas);
        }
        for (const w of modifiedWords) {
          renderWordTextOnCanvas(pageCanvas, w);
        }
      }

      // Convert high-res rendered canvas to PNG
      const pngDataUrl = pageCanvas.toDataURL('image/png');
      const pngImage = await pdfDoc.embedPng(pngDataUrl);

      // Draw the modified page canvas directly onto the PDF page
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight,
      });

      updateProgress(10 + (pageNum / pagesToProcess.length) * 70);
    }

    updateProgress(85);
    updateLoadingStatus('Generating PDF...');

    const modifiedBytes = await pdfDoc.save();

    updateProgress(95);

    // Download as blob URL (keeps file openable from browser download history)
    const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
    triggerDownload(blob, state.file ? state.file.name : 'document.pdf');

    updateProgress(100);
    setTimeout(() => hideLoading(), 300);
    showToast('PDF saved successfully!', 'success');
  } catch (err) {
    console.error('Save PDF error:', err);
    hideLoading();
    showToast('Failed to save PDF: ' + err.message, 'error');
  }
}

async function saveImage() {
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }

  showLoading('Saving Image', 'Applying text changes...');
  updateProgress(20);

  try {
    // Ensure all custom fonts are ready before drawing to canvas
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Render all modified words on the main canvas with seamless inpainting
    renderAllModifiedWordsOnCanvas(DOM.mainCanvas);

    updateProgress(70);

    // Determine output format — preserve the original MIME type
    const mimeMap = {
      'image/jpeg': 'image/jpeg',
      'image/jpg': 'image/jpeg',
      'image/png': 'image/png',
      'image/webp': 'image/webp',
    };
    const mimeType = (state.file && mimeMap[state.file.type]) || 'image/png';

    // Convert canvas to blob, then trigger download
    DOM.mainCanvas.toBlob((blob) => {
      triggerDownload(blob, state.file ? state.file.name : 'document.png');
      updateProgress(100);
      setTimeout(() => hideLoading(), 300);
      showToast('Image saved successfully!', 'success');
    }, mimeType, 0.95);
  } catch (err) {
    console.error('Save image error:', err);
    hideLoading();
    showToast('Failed to save image: ' + err.message, 'error');
  }
}

// Reliable download trigger using blob URL
// The blob URL is intentionally NOT revoked so the file can be
// opened from the browser's download bar/history while the page is open.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Remove the anchor after a short delay, but keep the blob URL alive
  // so the browser download history can still "Open" the file
  setTimeout(() => {
    document.body.removeChild(a);
  }, 3000);
}

/**
 * Manually add an editable text box anywhere on the document canvas.
 */
function addNewTextBoxAt(canvasX, canvasY) {
  const defaultFontSize = 18;
  const wordData = {
    text: 'New Text',
    originalText: '',
    bbox: {
      x0: canvasX,
      y0: Math.max(0, canvasY - defaultFontSize),
      x1: canvasX + 90,
      y1: canvasY + 4,
    },
    lineBbox: null,
    baselineY: canvasY,
    confidence: 100,
    lineIndex: state.lines.length,
    orientation: 'horizontal',
    style: {
      bgColor: { r: 255, g: 255, b: 255 },
      bgHex: '#ffffff',
      bgRgbString: 'rgb(255, 255, 255)',
      textColor: { r: 15, g: 23, b: 42 },
      baseTextColor: { r: 15, g: 23, b: 42 },
      darknessLevel: 1.0,
      textHex: '#0f172a',
      textRgbString: 'rgb(15, 23, 42)',
      fontSize: defaultFontSize,
      fontWeight: '400',
      fontStyle: 'normal',
      fontFamilyKey: 'sans-serif',
      fontFamilyType: 'sans-serif',
      fontFamilyCSS: FONT_FAMILIES['sans-serif'].css,
      isBold: false,
      isItalic: false,
    },
    originalStyle: null,
    styleModified: true,
    el: null,
    panelEl: null,
  };

  const newIdx = state.words.length;
  state.words.push(wordData);
  state.lines.push({
    text: 'New Text',
    originalText: '',
    wordIndices: [newIdx],
    orientation: 'horizontal',
  });

  state.isAddingText = false;
  DOM.btnAddText?.classList.remove('active');
  if (DOM.canvasContainer) DOM.canvasContainer.style.cursor = '';

  createVisualOverlay();
  createSidePanelLines();
  DOM.wordCount.textContent = `${state.words.length} words`;
  renderAllModifiedWordsOnCanvas(DOM.mainCanvas);

  setTimeout(() => {
    const el = state.words[newIdx]?.el;
    if (el) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 60);
}

// ============================================================
// Toolbar Events
// ============================================================
function bindToolbarEvents() {
  DOM.btnZoomIn.addEventListener('click', zoomIn);
  DOM.btnZoomOut.addEventListener('click', zoomOut);
  DOM.btnZoomFit.addEventListener('click', zoomFit);

  DOM.btnPrevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
  DOM.btnNextPage.addEventListener('click', () => goToPage(state.currentPage + 1));

  DOM.btnUndo.addEventListener('click', performUndo);
  DOM.btnRedo.addEventListener('click', performRedo);

  DOM.btnSave.addEventListener('click', saveFile);

  DOM.btnTogglePanel.addEventListener('click', toggleSidePanel);
  DOM.btnClosePanel.addEventListener('click', closeSidePanel);
  if (DOM.sidePanelBackdrop) {
    DOM.sidePanelBackdrop.addEventListener('click', closeSidePanel);
  }

  // Add Text Tool Button
  DOM.btnAddText?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.isAddingText = !state.isAddingText;
    DOM.btnAddText.classList.toggle('active', state.isAddingText);
    if (state.isAddingText) {
      if (DOM.canvasContainer) DOM.canvasContainer.style.cursor = 'crosshair';
      showToast('Click anywhere on the document to place a new text box', 'info');
    } else {
      if (DOM.canvasContainer) DOM.canvasContainer.style.cursor = '';
    }
  });

  // Click on canvas to place new text box when Add Text mode is active
  DOM.canvasContainer?.addEventListener('click', (e) => {
    if (!state.isAddingText) return;
    if (e.target.closest('.word-box') || e.target.closest('#floatingWordToolbar')) return;

    const rect = DOM.mainCanvas.getBoundingClientRect();
    const scaleX = DOM.mainCanvas.width / rect.width;
    const scaleY = DOM.mainCanvas.height / rect.height;
    const canvasX = Math.round((e.clientX - rect.left) * scaleX);
    const canvasY = Math.round((e.clientY - rect.top) * scaleY);

    addNewTextBoxAt(canvasX, canvasY);
  });

  // Zoom with scroll (Desktop)
  DOM.canvasViewport.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  }, { passive: false });

  // Touch Gestures: Pinch-to-Zoom (Mobile & Tablets)
  let initialPinchDistance = null;
  let initialZoom = 1;

  DOM.canvasViewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      initialPinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialZoom = state.zoom;
    }
  }, { passive: true });

  DOM.canvasViewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = currentDistance / initialPinchDistance;
      state.zoom = Math.max(0.2, Math.min(3, initialZoom * factor));
      applyZoom();
    }
  }, { passive: true });

  DOM.canvasViewport.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialPinchDistance = null;
    }
  }, { passive: true });

  // Resize handler for responsive zoom
  window.addEventListener('resize', () => {
    if (state.file && window.innerWidth <= 768) {
      zoomFit();
    }
  });
}

function toggleSidePanel() {
  const isCollapsed = DOM.sidePanel.classList.toggle('collapsed');
  if (DOM.sidePanelBackdrop) {
    DOM.sidePanelBackdrop.classList.toggle('active', !isCollapsed);
  }
}

function closeSidePanel() {
  DOM.sidePanel.classList.add('collapsed');
  if (DOM.sidePanelBackdrop) {
    DOM.sidePanelBackdrop.classList.remove('active');
  }
}

// ============================================================
// Font Toolbar & Floating Controls Events
// ============================================================
function bindFontToolbarEvents() {
  if (!DOM.fontToolbarGroup) return;

  // Prevent blurring the active word when clicking toolbar controls
  DOM.fontToolbarGroup.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
    }
  });

  if (DOM.floatingWordToolbar) {
    DOM.floatingWordToolbar.addEventListener('mousedown', (e) => {
      if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
      }
    });
  }

  // Top toolbar font family select
  DOM.fontFamilySelect?.addEventListener('change', (e) => {
    setActiveWordFontFamily(e.target.value);
  });

  // Floating toolbar font family select
  DOM.floatingFontSelect?.addEventListener('change', (e) => {
    setActiveWordFontFamily(e.target.value);
  });

  // Top toolbar font size buttons
  DOM.btnFontSizeDec?.addEventListener('click', () => changeActiveWordFontSize(-1));
  DOM.btnFontSizeInc?.addEventListener('click', () => changeActiveWordFontSize(1));

  // Floating toolbar font size buttons
  DOM.floatingBtnDec?.addEventListener('click', () => changeActiveWordFontSize(-1));
  DOM.floatingBtnInc?.addEventListener('click', () => changeActiveWordFontSize(1));

  // Font size input
  DOM.fontSizeInput?.addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 6 && val <= 150) {
      setActiveWordFontSize(val);
    }
  });

  // Bold toggles
  DOM.btnFontBold?.addEventListener('click', toggleActiveWordBold);
  DOM.floatingBtnBold?.addEventListener('click', toggleActiveWordBold);

  // Italic toggles
  DOM.btnFontItalic?.addEventListener('click', toggleActiveWordItalic);
  DOM.floatingBtnItalic?.addEventListener('click', toggleActiveWordItalic);

  // Reset to original style
  DOM.btnResetWordStyle?.addEventListener('click', resetActiveWordStyle);
  DOM.floatingBtnReset?.addEventListener('click', resetActiveWordStyle);

  // Shade Darker / Lighter toggles
  DOM.btnShadeDarker?.addEventListener('click', () => adjustActiveWordDarkness(0.15));
  DOM.btnShadeLighter?.addEventListener('click', () => adjustActiveWordDarkness(-0.15));
  DOM.floatingBtnDarker?.addEventListener('click', () => adjustActiveWordDarkness(0.15));
  DOM.floatingBtnLighter?.addEventListener('click', () => adjustActiveWordDarkness(-0.15));

  // Custom text color picker
  DOM.textColorPicker?.addEventListener('input', (e) => {
    setActiveWordColor(e.target.value);
  });
  DOM.textColorPicker?.addEventListener('change', (e) => {
    setActiveWordColor(e.target.value);
  });

  // Reposition floating toolbar on scroll or resize
  DOM.canvasViewport?.addEventListener('scroll', () => {
    if (state.activeWordIdx !== null) positionFloatingToolbar(state.activeWordIdx);
  });

  window.addEventListener('resize', () => {
    if (state.activeWordIdx !== null) positionFloatingToolbar(state.activeWordIdx);
  });

  // Clicking outside words hides the floating toolbar
  document.addEventListener('pointerdown', (e) => {
    if (
      !e.target.closest('.word-box') &&
      !e.target.closest('#floatingWordToolbar') &&
      !e.target.closest('#fontToolbarGroup')
    ) {
      hideFloatingToolbar();
      state.activeWordIdx = null;
      syncFontControls(null);
    }
  });
}

// ============================================================
// Keyboard Shortcuts
// ============================================================
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isMeta = e.metaKey || e.ctrlKey;

    // Cmd/Ctrl + Z = Undo
    if (isMeta && !e.shiftKey && e.key === 'z') {
      // Only if not focused on a contenteditable
      if (!document.activeElement.isContentEditable) {
        e.preventDefault();
        performUndo();
      }
    }

    // Cmd/Ctrl + Shift + Z = Redo
    if (isMeta && e.shiftKey && e.key === 'z') {
      if (!document.activeElement.isContentEditable) {
        e.preventDefault();
        performRedo();
      }
    }

    // Cmd/Ctrl + S = Save
    if (isMeta && e.key === 's') {
      e.preventDefault();
      if (state.file) saveFile();
    }

    // Cmd/Ctrl + = / + = Zoom In
    if (isMeta && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomIn();
    }

    // Cmd/Ctrl + - = Zoom Out
    if (isMeta && e.key === '-') {
      e.preventDefault();
      zoomOut();
    }

    // Cmd/Ctrl + B = Bold (when word is active)
    if (isMeta && (e.key === 'b' || e.key === 'B') && state.activeWordIdx !== null) {
      e.preventDefault();
      toggleActiveWordBold();
    }

    // Cmd/Ctrl + I = Italic (when word is active)
    if (isMeta && (e.key === 'i' || e.key === 'I') && state.activeWordIdx !== null) {
      e.preventDefault();
      toggleActiveWordItalic();
    }

    // [ / ] font size shortcuts (with modifier or when editing)
    if (state.activeWordIdx !== null && isMeta) {
      if (e.key === '[' || e.key === '{') {
        e.preventDefault();
        changeActiveWordFontSize(-1);
      }
      if (e.key === ']' || e.key === '}') {
        e.preventDefault();
        changeActiveWordFontSize(1);
      }
    }

    // Escape = Blur active element & hide toolbar
    if (e.key === 'Escape') {
      document.activeElement?.blur();
      hideFloatingToolbar();
      state.activeWordIdx = null;
      syncFontControls(null);
    }
  });
}

// ============================================================
// Loading UI
// ============================================================
function showLoading(title, status) {
  DOM.loadingTitle.textContent = title;
  DOM.loadingStatus.textContent = status;
  DOM.loadingOverlay.classList.add('active');
}

function hideLoading() {
  DOM.loadingOverlay.classList.remove('active');
  updateProgress(0);
}

function updateProgress(pct) {
  DOM.progressFill.style.width = pct + '%';
  DOM.progressText.textContent = pct + '%';
}

function updateLoadingStatus(status) {
  DOM.loadingStatus.textContent = status;
}

// ============================================================
// Toast Notifications
// ============================================================
function showToast(message, type = 'info') {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span>${message}</span>
  `;

  DOM.toastContainer.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// Start App
// ============================================================
init();
