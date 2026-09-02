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
  pages: {},            // { pageNum: { canvas, words, originalImageData } }

  // Current page OCR words
  words: [],            // [{ text, originalText, bbox, confidence, el, lineIndex }]

  // Lines (for side panel)
  lines: [],            // [{ text, wordIndices }]

  // Undo / Redo
  undoStack: [],
  redoStack: [],

  // Zoom
  zoom: 1,
  baseWidth: 0,
  baseHeight: 0,

  // Image data
  originalImage: null,  // HTMLImageElement for image files
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
  bindKeyboardShortcuts();
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
    const pdfData = new Uint8Array(state.fileBytes);
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

  // Store canvas image data for later use in saving
  const imageData = canvas.toDataURL('image/png');

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
    await worker.terminate();

    updateProgress(92);
    updateLoadingStatus('Building editor...');

    // Process words
    processOCRResults(data, pageNum);

    updateProgress(100);
    setTimeout(() => hideLoading(), 300);

    showToast(`Recognized ${state.words.length} words`, 'success');
  } catch (err) {
    console.error('OCR error:', err);
    hideLoading();
    showToast('OCR failed: ' + err.message, 'error');
  }
}

// ============================================================
// Text Style & Color Extraction Engine
// ============================================================
function rgbToHex(r, g, b) {
  const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(b)}`;
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
    if (ocrWord.is_monospace || /courier|mono|consolas|menlo/i.test(fontName)) {
      fontFamilyType = 'monospace';
    } else if (ocrWord.is_serif || /times|roman|serif|georgia|cambria|palatino|garamond/i.test(fontName)) {
      fontFamilyType = 'serif';
    } else {
      fontFamilyType = 'sans-serif';
    }
  } catch (err) {
    console.warn('Style extraction error for word:', err);
  }

  const bgHex = rgbToHex(bgRGB.r, bgRGB.g, bgRGB.b);
  const textHex = rgbToHex(textRGB.r, textRGB.g, textRGB.b);
  const fontSize = lineFontSize || Math.max(9, Math.round(boxH * 1.15));

  // Standard document font stacks matching original typography
  let fontFamilyCSS = "Arial, Helvetica, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Liberation Sans', sans-serif";
  if (fontFamilyType === 'serif') {
    fontFamilyCSS = "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', Georgia, serif";
  } else if (fontFamilyType === 'monospace') {
    fontFamilyCSS = "'Courier New', Courier, 'Liberation Mono', Menlo, Consolas, monospace";
  }

  return {
    bgColor: bgRGB,
    bgHex,
    bgRgbString: `rgb(${bgRGB.r}, ${bgRGB.g}, ${bgRGB.b})`,
    textColor: textRGB,
    textHex,
    textRgbString: `rgb(${textRGB.r}, ${textRGB.g}, ${textRGB.b})`,
    fontSize,
    fontWeight: isBold ? '700' : '400',
    fontStyle: isItalic ? 'italic' : 'normal',
    fontFamilyType,
    fontFamilyCSS,
    isBold,
    isItalic,
  };
}

function processOCRResults(data, pageNum) {
  state.words = [];
  state.lines = [];
  DOM.textOverlay.innerHTML = '';
  DOM.lineEditor.innerHTML = '';

  if (!data.lines || data.lines.length === 0) {
    showToast('No text detected in this document.', 'warning');
    return;
  }

  const canvas = DOM.mainCanvas;

  // Build lines and words
  data.lines.forEach((line, lineIdx) => {
    const lineWords = [];
    const lineMetrics = analyzeLineMetrics(line, canvas);

    line.words.forEach((word) => {
      if (!word.text.trim()) return;

      const style = extractTextStyleFromCanvas(canvas, word.bbox, word, lineMetrics.fontSize);

      const wordData = {
        text: word.text,
        originalText: word.text,
        bbox: { ...word.bbox },
        lineBbox: lineMetrics.lineBbox,
        baselineY: lineMetrics.baselineY,
        confidence: word.confidence,
        lineIndex: lineIdx,
        style: style,
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
      });
    }
  });

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
  };
}

// ============================================================
// Visual Overlay Editor
// ============================================================
function applyWordElementStyle(el, word, isEditing = false) {
  if (!el) return;
  const isModified = word.text !== word.originalText;
  const style = word.style || extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
  const { x0, x1 } = word.bbox;
  const lineY0 = word.lineBbox ? word.lineBbox.y0 : word.bbox.y0;
  const lineY1 = word.lineBbox ? word.lineBbox.y1 : word.bbox.y1;
  const y0 = Math.min(word.bbox.y0, lineY0);
  const y1 = Math.max(word.bbox.y1, lineY1);
  const boxW = x1 - x0;
  const boxH = y1 - y0;

  el.style.fontFamily = style.fontFamilyCSS;
  el.style.fontWeight = style.fontWeight;
  el.style.fontStyle = style.fontStyle;
  el.style.fontSize = style.fontSize + 'px';
  el.style.lineHeight = boxH + 'px';
  el.style.height = boxH + 'px';
  el.style.display = 'inline-flex';
  el.style.alignItems = 'center';

  if (isModified || isEditing) {
    el.style.backgroundColor = style.bgRgbString;
    el.style.color = style.textRgbString;
    el.style.minWidth = boxW + 'px';
    el.style.width = 'auto';
    el.style.padding = '0 2px';
    el.style.zIndex = isEditing ? '25' : '15';
    el.style.overflow = 'visible';
    el.style.whiteSpace = 'nowrap';
  } else {
    el.style.backgroundColor = 'transparent';
    el.style.color = 'transparent';
    el.style.minWidth = boxW + 'px';
    el.style.width = boxW + 'px';
    el.style.padding = '0';
    el.style.zIndex = '1';
    el.style.overflow = 'hidden';
    el.style.whiteSpace = 'nowrap';
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
    const { x0, x1 } = word.bbox;
    const lineY0 = word.lineBbox ? word.lineBbox.y0 : word.bbox.y0;
    const lineY1 = word.lineBbox ? word.lineBbox.y1 : word.bbox.y1;
    const y0 = Math.min(word.bbox.y0, lineY0);
    const y1 = Math.max(word.bbox.y1, lineY1);
    const boxW = x1 - x0;
    const boxH = y1 - y0;

    el.style.left = x0 + 'px';
    el.style.top = y0 + 'px';
    el.style.height = boxH + 'px';
    el.style.minWidth = boxW + 'px';

    if (word.text !== word.originalText) {
      el.classList.add('modified');
    }

    applyWordElementStyle(el, word, false);

    // Events
    el.addEventListener('focus', () => {
      el.classList.add('editing');
      applyWordElementStyle(el, word, true);
      highlightSidePanelLine(word.lineIndex);
    });

    el.addEventListener('blur', () => {
      el.classList.remove('editing');
      const newText = el.textContent.trim();
      if (newText !== word.text) {
        pushUndo(idx, word.text, newText);
        word.text = newText;
      }
      el.classList.toggle('modified', word.text !== word.originalText);
      applyWordElementStyle(el, word, false);
      syncSidePanelLine(word.lineIndex);
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
  state.undoStack.push({ wordIdx, oldText, newText });
  state.redoStack = []; // Clear redo on new edit
  updateUndoRedoButtons();
}

function performUndo() {
  if (state.undoStack.length === 0) return;

  const action = state.undoStack.pop();
  const word = state.words[action.wordIdx];
  word.text = action.oldText;

  if (word.el) {
    word.el.textContent = action.oldText;
    word.el.classList.toggle('modified', action.oldText !== word.originalText);
    applyWordElementStyle(word.el, word, false);
  }

  syncSidePanelLine(word.lineIndex);
  state.redoStack.push(action);
  updateUndoRedoButtons();
}

function performRedo() {
  if (state.redoStack.length === 0) return;

  const action = state.redoStack.pop();
  const word = state.words[action.wordIdx];
  word.text = action.newText;

  if (word.el) {
    word.el.textContent = action.newText;
    word.el.classList.toggle('modified', action.newText !== word.originalText);
    applyWordElementStyle(word.el, word, false);
  }

  syncSidePanelLine(word.lineIndex);
  state.undoStack.push(action);
  updateUndoRedoButtons();
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
  showLoading('Saving PDF', 'Applying text changes...');
  updateProgress(10);

  try {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;

    // Load original PDF
    const pdfDoc = await PDFDocument.load(state.fileBytes, {
      ignoreEncryption: true,
    });

    // Embed font variants for faithful typography matching
    const fonts = {
      helvetica: await pdfDoc.embedFont(StandardFonts.Helvetica),
      helveticaBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      helveticaOblique: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      helveticaBoldOblique: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      times: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      timesBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      timesItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      timesBoldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
      courier: await pdfDoc.embedFont(StandardFonts.Courier),
      courierBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
      courierOblique: await pdfDoc.embedFont(StandardFonts.CourierOblique),
      courierBoldOblique: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
    };

    function selectPdfFont(style) {
      const { fontFamilyType, isBold, isItalic } = style;
      if (fontFamilyType === 'serif') {
        if (isBold && isItalic) return fonts.timesBoldItalic;
        if (isBold) return fonts.timesBold;
        if (isItalic) return fonts.timesItalic;
        return fonts.times;
      } else if (fontFamilyType === 'monospace') {
        if (isBold && isItalic) return fonts.courierBoldOblique;
        if (isBold) return fonts.courierBold;
        if (isItalic) return fonts.courierOblique;
        return fonts.courier;
      } else {
        if (isBold && isItalic) return fonts.helveticaBoldOblique;
        if (isBold) return fonts.helveticaBold;
        if (isItalic) return fonts.helveticaOblique;
        return fonts.helvetica;
      }
    }

    // Process all pages that have edits
    const pagesToProcess = Object.keys(state.pages).map(Number);
    // Include current page
    if (!pagesToProcess.includes(state.currentPage)) {
      state.pages[state.currentPage] = {
        words: [...state.words],
        lines: [...state.lines],
      };
      pagesToProcess.push(state.currentPage);
    }

    const renderScale = 2; // Must match the scale used in renderPage

    for (const pageNum of pagesToProcess) {
      const pageData = state.pages[pageNum];
      if (!pageData) continue;

      const page = pdfDoc.getPages()[pageNum - 1];
      if (!page) continue;

      const { width: pdfWidth, height: pdfHeight } = page.getSize();

      // The canvas was rendered at 2x scale
      const canvasWidth = DOM.mainCanvas.width;
      const canvasHeight = DOM.mainCanvas.height;

      // Find modified words
      const modifiedWords = pageData.words.filter(w => w.text !== w.originalText);

      for (const word of modifiedWords) {
        const style = word.style || extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
        const pdfFont = selectPdfFont(style);

        // Convert canvas coords to PDF coords
        // Canvas Y is top-down, PDF Y is bottom-up
        const scaleX = pdfWidth / (canvasWidth / renderScale);
        const scaleY = pdfHeight / (canvasHeight / renderScale);

        // Bbox in canvas pixel coords (using line-level span for vertical alignment)
        const { x0, x1 } = word.bbox;
        const lineY0 = word.lineBbox ? word.lineBbox.y0 : word.bbox.y0;
        const lineY1 = word.lineBbox ? word.lineBbox.y1 : word.bbox.y1;
        const y0 = Math.min(word.bbox.y0, lineY0);
        const y1 = Math.max(word.bbox.y1, lineY1);

        // Convert to PDF coords
        const pdfX = (x0 / renderScale) * scaleX;
        const boxW = ((x1 - x0) / renderScale) * scaleX;
        const boxH = ((y1 - y0) / renderScale) * scaleY;
        const pdfY = pdfHeight - ((y0 / renderScale) * scaleY) - boxH;

        // Scale font size from canvas pixels to PDF points
        const fontSize = Math.max(6, (style.fontSize / renderScale) * scaleY);
        let textWidth = boxW;
        try {
          textWidth = pdfFont.widthOfTextAtSize(word.text, fontSize);
        } catch (e) {
          textWidth = boxW;
        }
        const rectW = Math.max(boxW + 2, textWidth + 4);

        // Inpaint background rectangle with original sampled background color
        page.drawRectangle({
          x: pdfX - 1,
          y: pdfY - 1,
          width: rectW,
          height: boxH + 2,
          color: rgb(style.bgColor.r / 255, style.bgColor.g / 255, style.bgColor.b / 255),
          borderWidth: 0,
        });

        // Exact PDF baseline Y calculation
        const canvasBaselineY = (word.baselineY !== null && word.baselineY !== undefined)
          ? word.baselineY
          : (y0 + (y1 - y0) * 0.82);
        const pdfBaselineY = pdfHeight - ((canvasBaselineY / renderScale) * scaleY);

        // Draw new text with exact matched font size, color, and baseline
        page.drawText(word.text, {
          x: pdfX,
          y: pdfBaselineY,
          size: fontSize,
          font: pdfFont,
          color: rgb(style.textColor.r / 255, style.textColor.g / 255, style.textColor.b / 255),
        });
      }

      updateProgress(10 + (pageNum / pagesToProcess.length) * 70);
    }

    updateProgress(85);
    updateLoadingStatus('Generating PDF...');

    const modifiedBytes = await pdfDoc.save();

    updateProgress(95);

    // Download as blob URL (keeps file openable from browser download history)
    const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
    triggerDownload(blob, state.file.name);

    updateProgress(100);
    setTimeout(() => hideLoading(), 300);
    showToast('PDF saved successfully!', 'success');
  } catch (err) {
    console.error('Save PDF error:', err);
    hideLoading();
    showToast('Failed to save PDF: ' + err.message, 'error');
  }
}

function saveImage() {
  showLoading('Saving Image', 'Applying text changes...');
  updateProgress(20);

  try {
    // Create a new canvas with original dimensions
    const offscreen = document.createElement('canvas');
    offscreen.width = DOM.mainCanvas.width;
    offscreen.height = DOM.mainCanvas.height;
    const ctx = offscreen.getContext('2d');

    // Draw original image
    if (state.originalImage) {
      ctx.drawImage(state.originalImage, 0, 0, offscreen.width, offscreen.height);
    } else {
      // Fallback: copy from main canvas
      ctx.drawImage(DOM.mainCanvas, 0, 0);
    }

    updateProgress(50);

    // Find modified words and apply changes
    const modifiedWords = state.words.filter(w => w.text !== w.originalText);

    for (const word of modifiedWords) {
      const style = word.style || extractTextStyleFromCanvas(DOM.mainCanvas, word.bbox, word);
      const { x0, x1 } = word.bbox;
      const lineY0 = word.lineBbox ? word.lineBbox.y0 : word.bbox.y0;
      const lineY1 = word.lineBbox ? word.lineBbox.y1 : word.bbox.y1;
      const y0 = Math.min(word.bbox.y0, lineY0);
      const y1 = Math.max(word.bbox.y1, lineY1);
      const boxW = x1 - x0;
      const boxH = y1 - y0;

      const fontSize = style.fontSize;
      const fontStr = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamilyCSS}`;
      ctx.font = fontStr;
      const textMetrics = ctx.measureText(word.text);
      const rectW = Math.max(boxW + 2, textMetrics.width + 4);

      // Inpaint original text area with sampled background color
      ctx.fillStyle = style.bgRgbString;
      ctx.fillRect(x0 - 1, y0 - 1, rectW, boxH + 2);

      // Draw new text with sampled text color and font on exact baseline
      ctx.fillStyle = style.textRgbString;
      ctx.font = fontStr;
      ctx.textBaseline = 'alphabetic';
      const canvasBaselineY = (word.baselineY !== null && word.baselineY !== undefined)
        ? word.baselineY
        : (y0 + boxH * 0.82);
      ctx.fillText(word.text, x0, canvasBaselineY);
    }

    updateProgress(80);

    // Determine output format — preserve the original MIME type
    const mimeMap = {
      'image/jpeg': 'image/jpeg',
      'image/jpg': 'image/jpeg',
      'image/png': 'image/png',
      'image/webp': 'image/webp',
    };
    const mimeType = mimeMap[state.file.type] || 'image/png';

    // Convert canvas to blob, then trigger download
    offscreen.toBlob((blob) => {
      triggerDownload(blob, state.file.name);
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

    // Escape = Blur active element
    if (e.key === 'Escape') {
      document.activeElement?.blur();
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
