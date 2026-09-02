# DocEdit Pro — PDF & Image Text Editor 📝

<div align="center">

![DocEdit Pro Banner](assets/banner.png)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-DocEdit%20Pro-6366f1?style=for-the-badge&logo=githubpages&logoColor=white)](https://techyshahid.github.io/ImageOCR/)

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](LICENSE)
[![OCR: Tesseract.js](https://img.shields.io/badge/OCR-Tesseract.js%20v5-blue.svg)](https://github.com/naptha/tesseract.js)
[![PDF: PDF.js & PDF--Lib](https://img.shields.io/badge/PDF-PDF.js%20%7C%20PDF--Lib-orange.svg)](https://pdf-lib.js.org/)
[![Privacy: 100% Client--Side](https://img.shields.io/badge/Privacy-100%25%20Client--Side-emerald.svg)](#privacy--security)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/TechyShahid/ImageOCR/pulls)

**DocEdit Pro** is an open-source, client-side web application for in-browser OCR, direct text editing, and document export for PDFs and images (PNG, JPEG, WebP). It automatically analyzes and replicates the original document's typography, font size, text color, and background color for edits.

[🚀 **Try Live Demo**](https://techyshahid.github.io/ImageOCR/) • [Features](#-key-features) • [Architecture](#-architecture--pipeline) • [How It Works](#-how-it-works) • [Getting Started](#-getting-started) • [Shortcuts](#-keyboard-shortcuts) • [Privacy](#-privacy--security)

</div>

---

## ✨ Key Features

- **🔍 Client-Side OCR**: Powered by Tesseract.js v5 with multi-word bounding box detection, character tracking, and line extraction.
- **🎨 Color Sampling Engine**: Samples the perimeter ring around bounding boxes to capture the background color, and isolates high-contrast ink pixels to extract text color.
- **📐 Typographic Calibration**:
  - Computes font size from line-level metrics, cap-height ($\text{capHeight} / 0.714$), and x-height ($\text{xHeight} / 0.523$).
  - Cross-calibrates against standard glyph widths using offscreen canvas context measurement.
  - Aligns replacement text with the original line's typographic baseline.
- **⚡ Dual-Mode Editing**:
  - **Direct Canvas Overlay**: Click and edit words directly on top of the document canvas.
  - **Extracted Text Side Panel**: Line-by-line synchronized text editor with bi-directional scrolling and real-time word synchronization.
- **💾 Multi-Format Export**:
  - **PDF Export**: Inpaints background rectangles and embeds matching font families (`Helvetica`, `Times Roman`, `Courier` in regular, bold, and italic) with baseline alignment.
  - **Image Export**: Generates lossless PNG, JPEG, or WebP images with matched typography and background color fills.
- **🔒 100% Client-Side Privacy**: All OCR processing, PDF rendering, editing, and saving happens entirely inside the user's browser. No documents or data are sent to any remote server.
- **🎯 Full Editor Controls**: Smooth pan & zoom (fit to width, up to 300%), multi-level undo/redo history (`Ctrl/Cmd + Z`), page navigation for multi-page PDFs, and keyboard shortcuts.

---

## 🏗️ Architecture & Pipeline

```mermaid
flowchart TD
    A[📄 Upload PDF / Image] --> B{Document Type}
    
    B -->|PDF File| C[PDF.js 2x High-DPI Page Rendering]
    B -->|Image File| D[Canvas Image Ingestion & Scaler]
    
    C --> E[Canvas Frame Buffer]
    D --> E
    
    E --> F[Tesseract.js OCR Engine]
    F --> G[Word & Line Bounding Boxes + Text Tokens]
    
    E & G --> H[🎨 Color & Style Analysis Engine]
    
    subgraph StyleEngine [Intelligent Typography & Color Analysis]
        H1[Perimeter Background Color Sampling]
        H2[Contrast Ink Text Color Extraction]
        H3[Dual-Metric Font Sizing: Cap-Height & X-Height]
        H4[Baseline Y Extraction & Width Cross-Calibration]
    end
    
    H --> H1 & H2 & H3 & H4
    H1 & H2 & H3 & H4 --> I[Word Style Metadata Engine]
    
    I --> J[Interactive Canvas Overlay]
    I --> K[Side-Panel Line Editor]
    
    J <-->|Bi-directional Sync & Undo/Redo| K
    
    J & K --> L{Export Document}
    L -->|Save PDF| M[PDF-Lib Inpainting & Font Embedding]
    L -->|Save Image| N[HTML5 2D Canvas Inpainting & Encoding]
    
    M --> O[💾 Clean PDF Download]
    N --> P[💾 High-Res Image Download]
```

---

## 🔬 How It Works

### 1. Optical Character Recognition (OCR)
When a file is loaded, DocEdit Pro renders the page onto a high-DPI canvas. The OCR engine identifies words, coordinates $(x_0, y_0, x_1, y_1)$, line groupings, and character symbols.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as DocEdit Pro UI
    participant OCR as Tesseract.js Worker
    participant Analyzer as Typography & Color Engine
    participant Editor as Overlay & Line Editor
    participant Exporter as PDF-Lib / Canvas Exporter

    User->>UI: Uploads PDF / Image
    UI->>UI: Renders Page on Canvas (2x scale)
    UI->>OCR: Runs recognize(canvas)
    OCR-->>UI: Returns lines, words, bboxes, & symbols
    UI->>Analyzer: Analyzes canvas pixels per bbox
    Analyzer-->>UI: Attaches background, text color, font size & baseline
    UI->>Editor: Builds visual overlay + side panel
    User->>Editor: Edits text content
    Editor->>Editor: Masks original text & renders matching font
    User->>UI: Clicks "Save & Download"
    UI->>Exporter: Applies vector patches & renders matching text
    Exporter-->>User: Downloads modified file
```

### 2. Dual-Metric Font Sizing & Baseline Alignment
Rather than using arbitrary word heights (which shrinks lowercase-only words like `"man"` or `"one"`), the engine analyzes:
$$\text{fontSize} = \frac{\text{capHeight}}{0.714} = \frac{Y_{\text{baseline}} - Y_{\text{capTop}}}{0.714}$$
$$\text{xHeight} = Y_{\text{baseline}} - Y_{\text{xTop}} \implies \text{fontSize} = \frac{\text{xHeight}}{0.523}$$

The calculated size is cross-calibrated against horizontal text tracking measurements using `ctx.measureText()`, and replacement text is anchored to the original typographic baseline.

### 3. Background Inpainting
The background color is sampled from the outer 2-pixel perimeter of the bounding box. When text is modified, a solid patch matching the exact background color covers the original ink before rendering the new text.

---

## 💻 Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Core UI** | HTML5, CSS3, ES Modules | Modern glassmorphism dark-mode UI |
| **OCR Engine** | [Tesseract.js v5](https://tesseract.projectnaptha.com/) | Pure client-side WebAssembly OCR |
| **PDF Rendering** | [PDF.js v4](https://mozilla.github.io/pdf.js/) | Mozilla's client-side PDF renderer |
| **PDF Generation** | [PDF-Lib v1.17](https://pdf-lib.js.org/) | In-browser PDF modification and font embedding |
| **Canvas Processing** | HTML5 Canvas 2D API | Sub-pixel raster manipulation and color sampling |

---

## 🚀 Getting Started

### Prerequisites
A modern web browser (Chrome, Firefox, Safari, Edge) that supports WebAssembly and ES Modules.

### Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/TechyShahid/ImageOCR.git
   cd ImageOCR
   ```

2. **Start a local web server**:
   Using Python:
   ```bash
   python3 -m http.server 8080
   ```
   Or using Node (`npx`):
   ```bash
   npx serve .
   ```
   Or using PHP:
   ```bash
   php -S localhost:8080
   ```

3. **Open in browser**:
   Navigate to `http://localhost:8080`.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo last text modification |
| <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>⇧ Shift</kbd> + <kbd>Z</kbd> | Redo text modification |
| <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save & Download modified document |
| <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>+</kbd> / <kbd>=</kbd> | Zoom In |
| <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>-</kbd> | Zoom Out |
| <kbd>Tab</kbd> | Focus next editable word |
| <kbd>Enter</kbd> | Confirm word edit and blur |
| <kbd>Esc</kbd> | Dismiss active word focus |

---

## 🛡️ Privacy & Security

DocEdit Pro is engineered with a **zero-telemetry, offline-first** architecture:
- ✅ **No Server Uploads**: Files are never transmitted across the network.
- ✅ **Local Execution**: All OCR, canvas rendering, and PDF generation execute locally inside the browser's JavaScript sandbox.
- ✅ **Safe for Sensitive Documents**: Invoices, contracts, medical records, and identification documents remain private on your device.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/TechyShahid">Shahid Khan</a></sub>
</div>
