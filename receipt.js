/**
 * Fuel Receipt Generator — Main Interactive Logic
 * Handles templating, reactive calculations, zero-padding, PDF export, and PNG image export.
 */

(function () {
  'use strict';

  // --- Preset Template Data ---
  const TEMPLATES = {
    indianoil: {
      name: 'IndianOil',
      dealerName: 'BAHADUR SHETH FUEL',
      address1: 'KARAUNDHI DEORIA',
      address2: '',
      telNo: '9869005844',
      invNo: '232903226H208288',
      fccId: '300420727',
      fipNo: '02',
      nozzleNo: '02',
      product: 'Petrol',
      presetType: 'Volume',
      rate: 101.74,
      volume: 41.78,
      amount: 4250.70,
      atot: '00081384546.13',
      vtot: '0000854181.980',
      density: '743.3Kg/Cu.mtr',
      vehicleNo: 'BR01JZ0007',
      mobileNo: 'Not Entered',
      cstNo: '',
      lstNo: '',
      vatNo: '',
      attendantId: 'Not Available',
      fccDate: 'Not Available',
      footerMsg: 'Thank You! Please Visit\nAgain..'
    },
    bharat: {
      name: 'Bharat Petroleum',
      dealerName: 'SUKH SAMPAT FUEL ADHOC',
      address1: 'GT ROAD JHANSI',
      address2: 'CHANDAULI',
      telNo: '7380473252',
      invNo: 'H5223',
      fccId: '00014000',
      fipNo: '02',
      nozzleNo: '04',
      product: 'Xtra Prem',
      presetType: 'Volume',
      rate: 101.83,
      volume: 36.69,
      amount: 3736.14,
      atot: '00052341201.50',
      vtot: '0000514055.230',
      density: '743.3Kg/Cu.mtr',
      vehicleNo: 'BR01JZ0007',
      mobileNo: 'Not Entered',
      cstNo: '',
      lstNo: '',
      vatNo: '',
      attendantId: 'Not Available',
      fccDate: 'Not Available',
      footerMsg: 'Thank You! Please Visit Again..'
    },
    hpcl: {
      name: 'HPCL',
      dealerName: 'SHREE BALAJI PETROLEUM',
      address1: 'NH-19 HIGHWAY',
      address2: 'VARANASI',
      telNo: '9450123456',
      invNo: 'HP98214',
      fccId: '1002934',
      fipNo: '01',
      nozzleNo: '03',
      product: 'Power Petrol',
      presetType: 'Volume',
      rate: 102.15,
      volume: 35.00,
      amount: 3575.25,
      atot: '00063214567.89',
      vtot: '0000618840.120',
      density: '742.8Kg/Cu.mtr',
      vehicleNo: 'UP65AB1234',
      mobileNo: 'Not Entered',
      cstNo: '',
      lstNo: '',
      vatNo: '',
      attendantId: 'Not Available',
      fccDate: 'Not Available',
      footerMsg: 'Thank You! Please Visit Again..'
    },
    custom: {
      name: 'Generic / Custom',
      dealerName: 'CITY FUEL STATION',
      address1: 'MAIN ROAD',
      address2: '',
      telNo: '9876543210',
      invNo: 'INV-2026-001',
      fccId: '500123',
      fipNo: '01',
      nozzleNo: '01',
      product: 'Petrol',
      presetType: 'Volume',
      rate: 100.00,
      volume: 40.00,
      amount: 4000.00,
      atot: '00010000000.00',
      vtot: '0000100000.000',
      density: '740.0Kg/Cu.mtr',
      vehicleNo: 'DL01AB9999',
      mobileNo: 'Not Entered',
      cstNo: '',
      lstNo: '',
      vatNo: '',
      attendantId: 'Not Available',
      fccDate: 'Not Available',
      footerMsg: 'Thank You! Please Visit Again..'
    }
  };

  // --- Logos Matching Real Thermal Receipts ---
  const LOGOS = {
    indianoil: `
      <img src="assets/indianoil_logo.png?v=3" class="receipt-logo-img" alt="IndianOil">
    `,
    bharat: `
      <img src="assets/bharat_petroleum_logo.png?v=3" class="receipt-logo-img" alt="Bharat Petroleum">
    `,
    hpcl: `
      <img src="assets/hpcl_logo.png?v=3" class="receipt-logo-img" alt="Hindustan Petroleum">
    `,
    custom: `
      <svg viewBox="0 0 160 65" xmlns="http://www.w3.org/2000/svg" class="receipt-logo-svg">
        <rect x="15" y="8" width="130" height="48" rx="4" fill="none" stroke="#111111" stroke-width="2.5"/>
        <text x="80" y="40" font-family="'Inter', Arial, sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#111111">⛽ FUEL RECEIPT</text>
      </svg>
    `
  };

  let currentTemplateKey = 'indianoil';

  // --- DOM Elements ---
  const form = document.getElementById('receiptForm');
  const templateButtons = document.querySelectorAll('.tpl-btn');
  const receiptPaper = document.getElementById('receiptPaper');
  const receiptWrapper = document.getElementById('receiptWrapper');

  // Input fields
  const elDealerName = document.getElementById('dealerName');
  const elAddress1 = document.getElementById('addressLine1');
  const elAddress2 = document.getElementById('addressLine2');
  const elTelNo = document.getElementById('telNo');
  const elInvNo = document.getElementById('invNo');
  const elFccId = document.getElementById('fccId');
  const elFipNo = document.getElementById('fipNo');
  const elNozzleNo = document.getElementById('nozzleNo');
  const elProduct = document.getElementById('product');
  const elDensity = document.getElementById('density');
  const elAtot = document.getElementById('atot');
  const elVtot = document.getElementById('vtot');
  const elPresetType = document.getElementById('presetType');
  const elRate = document.getElementById('rate');
  const elVolume = document.getElementById('volume');
  const elAmount = document.getElementById('amount');
  const elPadZeros = document.getElementById('padZeros');
  const elVehicleNo = document.getElementById('vehicleNo');
  const elMobileNo = document.getElementById('mobileNo');
  const elReceiptDate = document.getElementById('receiptDate');
  const elReceiptTime = document.getElementById('receiptTime');
  const elPrintOffset = document.getElementById('printTimeOffset');
  const elCustomPrintDate = document.getElementById('customPrintDate');
  const elCustomPrintTime = document.getElementById('customPrintTime');
  const elCstNo = document.getElementById('cstNo');
  const elLstNo = document.getElementById('lstNo');
  const elVatNo = document.getElementById('vatNo');
  const elAttendantId = document.getElementById('attendantId');
  const elFccDate = document.getElementById('fccDate');
  const elFooterMessage = document.getElementById('footerMessage');

  // Styling inputs
  const elPaperTone = document.getElementById('paperTone');
  const elFontStyle = document.getElementById('fontStyle');
  const elPrintIntensity = document.getElementById('printIntensity');
  const elJaggedEdges = document.getElementById('jaggedEdges');

  // Font & Logo Size controls
  const btnFontDec = document.getElementById('btnFontDec');
  const btnFontInc = document.getElementById('btnFontInc');
  const fontSizeBadge = document.getElementById('fontSizeBadge');
  const fontSizeSlider = document.getElementById('fontSizeSlider');

  const btnLogoDec = document.getElementById('btnLogoDec');
  const btnLogoInc = document.getElementById('btnLogoInc');
  const logoSizeBadge = document.getElementById('logoSizeBadge');
  const logoSizeSlider = document.getElementById('logoSizeSlider');

  const showReceiptLogo = document.getElementById('showReceiptLogo');
  const customLogoInput = document.getElementById('customLogoInput');
  const btnResetLogo = document.getElementById('btnResetLogo');

  // Preview Toolbar Quick Steppers
  const btnQuickFontDec = document.getElementById('btnQuickFontDec');
  const btnQuickFontInc = document.getElementById('btnQuickFontInc');
  const quickFontBadge = document.getElementById('quickFontBadge');

  const btnQuickLogoDec = document.getElementById('btnQuickLogoDec');
  const btnQuickLogoInc = document.getElementById('btnQuickLogoInc');
  const quickLogoBadge = document.getElementById('quickLogoBadge');

  const presetPills = document.querySelectorAll('.preset-pill');

  // State
  let receiptFontSize = 17; // px (12 to 24)
  let receiptLogoWidth = 170; // px (80 to 280)
  let isLogoVisible = true;
  let customLogoDataUrl = null;

  // UI sections
  const densityRow = document.getElementById('densityRow');
  const totalizerRow = document.getElementById('totalizerRow');
  const bpclExtraRow = document.getElementById('bpclExtraRow');
  const fccLabel = document.getElementById('fccLabel');
  const customPrintRow = document.getElementById('customPrintRow');
  const topJagged = document.getElementById('topJagged');
  const bottomJagged = document.getElementById('bottomJagged');

  // Preview elements
  const elLogoArea = document.getElementById('receiptLogoArea');
  const elRDealerName = document.getElementById('rDealerName');
  const elRAddress1 = document.getElementById('rAddress1');
  const elRAddress2 = document.getElementById('rAddress2');
  const elRTelNo = document.getElementById('rTelNo');
  const elRMeta = document.getElementById('receiptMeta');
  const elRPricing = document.getElementById('receiptPricing');
  const elRVehicleNo = document.getElementById('rVehicleNo');
  const elRMobileNo = document.getElementById('rMobileNo');
  const elRDateTime = document.getElementById('receiptDateTime');
  const elRTax = document.getElementById('receiptTax');
  const elRFooterMsg = document.getElementById('rFooterMsg');
  const elRPrintedBlock = document.getElementById('rPrintedBlock');

  // Action buttons
  const btnDownloadPDF = document.getElementById('btnDownloadPDF');
  const btnDownloadPNG = document.getElementById('btnDownloadPNG');
  const btnPrint = document.getElementById('btnPrint');
  const btnRandomize = document.getElementById('btnRandomize');
  const btnReset = document.getElementById('btnReset');
  const btnGenInv = document.getElementById('btnGenInv');
  const btnToggleMobile = document.getElementById('btnToggleMobile');
  const btnSetCurrentDateTime = document.getElementById('btnSetCurrentDateTime');

  // --- Initial Setup ---
  function init() {
    initDefaultDates();
    setupAccordions();
    setupEventListeners();
    setFontSize(17);
    setLogoSize(170);
    applyTemplate('indianoil');
  }

  function initDefaultDates() {
    // Default to a realistic recent date
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    elReceiptDate.value = `${yyyy}-${mm}-${dd}`;
    elReceiptTime.value = `${hh}:${min}`;
    elCustomPrintDate.value = `${yyyy}-${mm}-${dd}`;
    elCustomPrintTime.value = `${hh}:${min}`;
  }

  // --- Template Management ---
  function applyTemplate(key) {
    currentTemplateKey = key;
    const tpl = TEMPLATES[key] || TEMPLATES.indianoil;

    // Update buttons UI
    templateButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.template === key);
    });

    // Populate values
    elDealerName.value = tpl.dealerName;
    elAddress1.value = tpl.address1;
    elAddress2.value = tpl.address2;
    elTelNo.value = tpl.telNo;
    elInvNo.value = tpl.invNo;
    elFccId.value = tpl.fccId;
    elFipNo.value = tpl.fipNo;
    elNozzleNo.value = tpl.nozzleNo;
    elProduct.value = tpl.product;
    elPresetType.value = tpl.presetType;
    elRate.value = tpl.rate.toFixed(2);
    elVolume.value = tpl.volume.toFixed(2);
    elAmount.value = tpl.amount.toFixed(2);
    elAtot.value = tpl.atot;
    elVtot.value = tpl.vtot;
    elDensity.value = tpl.density;
    elVehicleNo.value = tpl.vehicleNo;
    elMobileNo.value = tpl.mobileNo;
    elCstNo.value = tpl.cstNo;
    elLstNo.value = tpl.lstNo;
    elVatNo.value = tpl.vatNo;
    elAttendantId.value = tpl.attendantId;
    elFccDate.value = tpl.fccDate;
    elFooterMessage.value = tpl.footerMsg;

    // Adjust specific UI form rows
    if (key === 'bharat') {
      densityRow.style.display = 'flex';
      totalizerRow.style.display = 'none';
      bpclExtraRow.style.display = 'flex';
      fccLabel.textContent = 'Local ID';
    } else {
      densityRow.style.display = 'none';
      totalizerRow.style.display = 'flex';
      bpclExtraRow.style.display = 'none';
      fccLabel.textContent = 'FCC ID';
    }

    renderReceipt();
  }

  // --- Number & Text Formatting Helpers ---
  function padThermalZero(num, intDigits, decDigits = 2) {
    const val = parseFloat(num) || 0;
    const parts = val.toFixed(decDigits).split('.');
    const integerPart = parts[0].padStart(intDigits, '0');
    return `${integerPart}.${parts[1]}`;
  }

  function formatDDMMYY(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      // Return DD/MM/YY
      const yy = parts[0].slice(-2);
      return `${parts[2]}/${parts[1]}/${yy}`;
    }
    return dateStr;
  }

  function computePrintedDateTime() {
    const offset = elPrintOffset.value;
    if (offset === 'custom') {
      const pDate = formatDDMMYY(elCustomPrintDate.value);
      const pTime = elCustomPrintTime.value || '00:00';
      return `${pDate} ${pTime}`;
    }

    const txDateStr = elReceiptDate.value;
    const txTimeStr = elReceiptTime.value || '12:00';
    if (!txDateStr) return '';

    try {
      const [year, month, day] = txDateStr.split('-').map(Number);
      const [hours, minutes] = txTimeStr.split(':').map(Number);
      const d = new Date(year, month - 1, day, hours, minutes);

      const addMinutes = parseInt(offset, 10) || 0;
      d.setMinutes(d.getMinutes() + addMinutes);

      const dDay = String(d.getDate()).padStart(2, '0');
      const dMonth = String(d.getMonth() + 1).padStart(2, '0');
      const dYear = String(d.getFullYear()).slice(-2);
      const dHour = String(d.getHours()).padStart(2, '0');
      const dMin = String(d.getMinutes()).padStart(2, '0');

      return `${dDay}/${dMonth}/${dYear} ${dHour}:${dMin}`;
    } catch (e) {
      return `${formatDDMMYY(txDateStr)} ${txTimeStr}`;
    }
  }

  // --- Real-time Rendering Engine ---
  function renderReceipt() {
    const isZeroPadded = elPadZeros.checked;
    const rateVal = parseFloat(elRate.value) || 0;
    const volVal = parseFloat(elVolume.value) || 0;
    const amtVal = parseFloat(elAmount.value) || 0;

    // Formatted numbers
    const rateFormatted = rateVal.toFixed(2);
    const volFormatted = isZeroPadded ? padThermalZero(volVal, 5, 2) : volVal.toFixed(2);
    const amtFormatted = isZeroPadded ? padThermalZero(amtVal, 5, 2) : amtVal.toFixed(2);

    // 1. Logo
    if (customLogoDataUrl) {
      elLogoArea.innerHTML = `<img src="${customLogoDataUrl}" class="receipt-logo-img" alt="Custom Station Logo">`;
    } else {
      elLogoArea.innerHTML = LOGOS[currentTemplateKey] || LOGOS.indianoil;
    }

    // 2. Station Header
    elRDealerName.textContent = (elDealerName.value || '').toUpperCase();
    elRAddress1.textContent = (elAddress1.value || '').toUpperCase();
    if (elAddress2.value.trim()) {
      elRAddress2.textContent = elAddress2.value.trim().toUpperCase();
      elRAddress2.style.display = 'block';
    } else {
      elRAddress2.style.display = 'none';
    }
    elRTelNo.textContent = elTelNo.value ? `Tel. No.: ${elTelNo.value}` : '';

    // 3. Meta Details based on Template Style
    if (currentTemplateKey === 'bharat') {
      elRMeta.innerHTML = `
        <div class="r-row">Receipt No. :  ${escapeHtml(elInvNo.value)}</div>
        <div class="r-row">Local ID : ${escapeHtml(elFccId.value)}</div>
        <div class="r-row">FIP No.  : ${escapeHtml(elFipNo.value)}</div>
        <div class="r-row">Nozzle No. : ${escapeHtml(elNozzleNo.value)}</div>
        <div class="r-row">Product   : ${escapeHtml(elProduct.value)}</div>
        ${elDensity.value ? `<div class="r-row">Density : ${escapeHtml(elDensity.value)}</div>` : ''}
      `;

      elRPricing.innerHTML = `
        <div class="r-row">Preset Type: ${escapeHtml(elPresetType.value)}</div>
        <div class="r-row">Rate      :   ${rateFormatted}</div>
        <div class="r-row">Volume    : ${volFormatted}</div>
        <div class="r-row">Amount    : ${amtFormatted}</div>
      `;

      // Date & Time on same line for BPCL (Sample 2 match)
      elRDateTime.innerHTML = `
        <div class="r-row">Date : ${formatDDMMYY(elReceiptDate.value)} Time: ${elReceiptTime.value || ''}</div>
      `;

      elRTax.innerHTML = `
        <div class="r-row">CST No    : ${escapeHtml(elCstNo.value)}</div>
        <div class="r-row">LST No    : ${escapeHtml(elLstNo.value)}</div>
        <div class="r-row">VAT No    : ${escapeHtml(elVatNo.value)}</div>
        <div class="r-row">ATTENDANT ID : ${escapeHtml(elAttendantId.value || 'Not Available')}</div>
        <div class="r-row">FCC DATE : ${escapeHtml(elFccDate.value || 'Not Available')}</div>
        <div class="r-row">FCC TIME : Not Available</div>
      `;

      const printedStr = computePrintedDateTime();
      elRPrintedBlock.innerHTML = `<div class="r-printed-val">Printed on:${printedStr}</div>`;

    } else {
      // IndianOil / HPCL / Custom Style (Sample 1 match)
      elRMeta.innerHTML = `
        <div class="r-row">Inv.No: ${escapeHtml(elInvNo.value)}</div>
        <div class="r-row">FCC ID: ${escapeHtml(elFccId.value)}</div>
        <div class="r-row">FIP No.   : ${escapeHtml(elFipNo.value)}</div>
        <div class="r-row">Nozzle No.: ${escapeHtml(elNozzleNo.value)}</div>
        <div class="r-row">Product   : ${escapeHtml(elProduct.value)}</div>
      `;

      elRPricing.innerHTML = `
        <div class="r-row">Preset Type: ${escapeHtml(elPresetType.value)}</div>
        <div class="r-row">Rate(Rs/L) :    ${rateFormatted}</div>
        <div class="r-row">Volume(L)  :  ${volFormatted}</div>
        <div class="r-row">Amount(Rs) :  ${amtFormatted}</div>
        ${elAtot.value ? `<div class="r-row">Atot: ${escapeHtml(elAtot.value)}</div>` : ''}
        ${elVtot.value ? `<div class="r-row">Vtot: ${escapeHtml(elVtot.value)}</div>` : ''}
      `;

      // Date & Time on separate lines for IOCL (Sample 1 match)
      elRDateTime.innerHTML = `
        <div class="r-row">Date : ${formatDDMMYY(elReceiptDate.value)}</div>
        <div class="r-row">Time: ${elReceiptTime.value || ''}</div>
      `;

      elRTax.innerHTML = `
        <div class="r-row">CST No: ${escapeHtml(elCstNo.value)}</div>
        <div class="r-row">LST No: ${escapeHtml(elLstNo.value)}</div>
        <div class="r-row">VAT No: ${escapeHtml(elVatNo.value)}</div>
      `;

      const printedStr = computePrintedDateTime();
      elRPrintedBlock.innerHTML = `
        <div class="r-printed-lbl">Printed on:</div>
        <div class="r-printed-val">${printedStr}</div>
      `;
    }

    // 4. Vehicle & Customer
    const elRVehicleRow = document.getElementById('rVehicleRow');
    const elRMobileRow = document.getElementById('rMobileRow');
    if (elRVehicleRow) elRVehicleRow.textContent = `Vehicle No: ${elVehicleNo.value || 'BR01JZ0007'}`;
    if (elRMobileRow) elRMobileRow.textContent = `Mobile No : ${elMobileNo.value || 'Not Entered'}`;

    // 5. Footer Message
    elRFooterMsg.textContent = elFooterMessage.value || 'Thank You! Please Visit Again..';

    // 6. Visual Effects
    updateVisualStyles();
  }

  function updateVisualStyles() {
    // Apply font size and logo width as CSS custom variables
    receiptPaper.style.setProperty('--receipt-font-size', `${receiptFontSize}px`);
    receiptPaper.style.setProperty('--receipt-logo-width', `${receiptLogoWidth}px`);

    // Paper tone & font style
    receiptPaper.className = `receipt-paper font-${elFontStyle.value} tone-${elPaperTone.value}`;

    // Print ink opacity
    const inkVal = parseInt(elPrintIntensity.value, 10) / 100;
    receiptPaper.style.setProperty('--receipt-ink-opacity', inkVal);

    // Jagged edges
    const showJagged = elJaggedEdges.checked;
    topJagged.style.display = showJagged ? 'block' : 'none';
    bottomJagged.style.display = showJagged ? 'block' : 'none';

    // Logo visibility
    if (elLogoArea) {
      if (isLogoVisible) {
        elLogoArea.classList.remove('hidden');
      } else {
        elLogoArea.classList.add('hidden');
      }
    }
  }

  function setFontSize(newSize, triggerSource) {
    const size = Math.max(12, Math.min(24, parseInt(newSize, 10) || 17));
    receiptFontSize = size;

    if (fontSizeSlider && triggerSource !== 'slider') fontSizeSlider.value = size;
    if (fontSizeBadge) fontSizeBadge.textContent = `${size}px`;
    if (quickFontBadge) quickFontBadge.textContent = `${size}px`;

    presetPills.forEach(pill => {
      if (pill.dataset.sizeTarget === 'font') {
        pill.classList.toggle('active', parseInt(pill.dataset.sizeVal, 10) === size);
      }
    });

    updateVisualStyles();
  }

  function setLogoSize(newWidth, triggerSource) {
    const width = Math.max(80, Math.min(280, parseInt(newWidth, 10) || 170));
    receiptLogoWidth = width;

    if (logoSizeSlider && triggerSource !== 'slider') logoSizeSlider.value = width;
    if (logoSizeBadge) logoSizeBadge.textContent = `${width}px`;
    if (quickLogoBadge) quickLogoBadge.textContent = `${width}px`;

    presetPills.forEach(pill => {
      if (pill.dataset.sizeTarget === 'logo') {
        pill.classList.toggle('active', parseInt(pill.dataset.sizeVal, 10) === width);
      }
    });

    updateVisualStyles();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Auto Calculations for Rate, Volume, Amount ---
  function handleRateChange() {
    const rate = parseFloat(elRate.value) || 0;
    const volume = parseFloat(elVolume.value) || 0;
    if (rate > 0 && volume > 0) {
      elAmount.value = (rate * volume).toFixed(2);
    }
    renderReceipt();
  }

  function handleVolumeChange() {
    const rate = parseFloat(elRate.value) || 0;
    const volume = parseFloat(elVolume.value) || 0;
    if (rate > 0 && volume > 0) {
      elAmount.value = (rate * volume).toFixed(2);
    }
    renderReceipt();
  }

  function handleAmountChange() {
    const rate = parseFloat(elRate.value) || 0;
    const amount = parseFloat(elAmount.value) || 0;
    if (rate > 0 && amount > 0) {
      elVolume.value = (amount / rate).toFixed(2);
    }
    renderReceipt();
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Template switcher
    templateButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        applyTemplate(btn.dataset.template);
        showToast(`Switched to ${btn.dataset.template.toUpperCase()} template`, 'success');
      });
    });

    // Form input listeners
    form.addEventListener('input', (e) => {
      if (e.target === elRate) {
        handleRateChange();
      } else if (e.target === elVolume) {
        handleVolumeChange();
      } else if (e.target === elAmount) {
        handleAmountChange();
      } else {
        renderReceipt();
      }
    });

    form.addEventListener('change', renderReceipt);

    // Custom print offset toggle
    elPrintOffset.addEventListener('change', () => {
      customPrintRow.style.display = elPrintOffset.value === 'custom' ? 'flex' : 'none';
      renderReceipt();
    });

    // Mobile number toggle
    btnToggleMobile.addEventListener('click', () => {
      if (elMobileNo.value === 'Not Entered') {
        elMobileNo.value = '9876543210';
      } else {
        elMobileNo.value = 'Not Entered';
      }
      renderReceipt();
    });

    // Randomize Invoice generator
    btnGenInv.addEventListener('click', () => {
      const randNum = Math.floor(100000000 + Math.random() * 900000000);
      if (currentTemplateKey === 'bharat') {
        elInvNo.value = 'H' + Math.floor(1000 + Math.random() * 9000);
      } else {
        elInvNo.value = `${randNum}H${Math.floor(100000 + Math.random() * 900000)}`;
      }
      renderReceipt();
      showToast('Generated new invoice number', 'success');
    });

    // Set current date & time
    btnSetCurrentDateTime.addEventListener('click', () => {
      initDefaultDates();
      renderReceipt();
      showToast('Set to current date & time', 'success');
    });

    // Font Size Steppers & Slider
    if (btnFontDec) btnFontDec.addEventListener('click', () => setFontSize(receiptFontSize - 1));
    if (btnFontInc) btnFontInc.addEventListener('click', () => setFontSize(receiptFontSize + 1));
    if (fontSizeSlider) fontSizeSlider.addEventListener('input', (e) => setFontSize(e.target.value, 'slider'));

    // Quick Font adjustments on Preview Toolbar
    if (btnQuickFontDec) btnQuickFontDec.addEventListener('click', () => setFontSize(receiptFontSize - 1));
    if (btnQuickFontInc) btnQuickFontInc.addEventListener('click', () => setFontSize(receiptFontSize + 1));

    // Logo Size Steppers & Slider
    if (btnLogoDec) btnLogoDec.addEventListener('click', () => setLogoSize(receiptLogoWidth - 10));
    if (btnLogoInc) btnLogoInc.addEventListener('click', () => setLogoSize(receiptLogoWidth + 10));
    if (logoSizeSlider) logoSizeSlider.addEventListener('input', (e) => setLogoSize(e.target.value, 'slider'));

    // Quick Logo adjustments on Preview Toolbar
    if (btnQuickLogoDec) btnQuickLogoDec.addEventListener('click', () => setLogoSize(receiptLogoWidth - 10));
    if (btnQuickLogoInc) btnQuickLogoInc.addEventListener('click', () => setLogoSize(receiptLogoWidth + 10));

    // Preset pills for Font and Logo
    presetPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const target = pill.dataset.sizeTarget;
        const val = parseInt(pill.dataset.sizeVal, 10);
        if (target === 'font') {
          setFontSize(val);
        } else if (target === 'logo') {
          setLogoSize(val);
        }
      });
    });

    // Show/Hide Logo toggle
    if (showReceiptLogo) {
      showReceiptLogo.addEventListener('change', () => {
        isLogoVisible = showReceiptLogo.checked;
        updateVisualStyles();
        showToast(isLogoVisible ? 'Logo visible on receipt' : 'Logo hidden from receipt', 'success');
      });
    }

    // Custom Logo File Input
    if (customLogoInput) {
      customLogoInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          showToast('Please select a valid image file (PNG, JPG, SVG)', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          customLogoDataUrl = event.target.result;
          if (btnResetLogo) btnResetLogo.style.display = 'inline-flex';
          renderReceipt();
          showToast('Custom logo uploaded successfully!', 'success');
        };
        reader.readAsDataURL(file);
      });
    }

    // Reset Custom Logo
    if (btnResetLogo) {
      btnResetLogo.addEventListener('click', () => {
        customLogoDataUrl = null;
        if (customLogoInput) customLogoInput.value = '';
        btnResetLogo.style.display = 'none';
        renderReceipt();
        showToast('Reset to template brand logo', 'success');
      });
    }

    // Reset button
    btnReset.addEventListener('click', () => {
      setFontSize(17);
      setLogoSize(170);
      isLogoVisible = true;
      if (showReceiptLogo) showReceiptLogo.checked = true;
      customLogoDataUrl = null;
      if (customLogoInput) customLogoInput.value = '';
      if (btnResetLogo) btnResetLogo.style.display = 'none';
      applyTemplate(currentTemplateKey);
      showToast('Form and styling reset to default', 'success');
    });

    // Randomize sample data
    btnRandomize.addEventListener('click', () => {
      randomizeData();
    });

    // Exports
    btnDownloadPNG.addEventListener('click', () => downloadImage('png'));
    btnDownloadPDF.addEventListener('click', downloadPDF);
    btnPrint.addEventListener('click', () => window.print());
  }

  function setupAccordions() {
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const item = header.parentElement;
        item.classList.toggle('open');
      });
    });
  }

  function randomizeData() {
    const rates = [98.50, 101.74, 101.83, 104.20, 92.40];
    const volumes = [15.50, 25.00, 36.69, 41.78, 50.00, 12.35];
    const randomRate = rates[Math.floor(Math.random() * rates.length)];
    const randomVol = volumes[Math.floor(Math.random() * volumes.length)];

    elRate.value = randomRate.toFixed(2);
    elVolume.value = randomVol.toFixed(2);
    elAmount.value = (randomRate * randomVol).toFixed(2);

    const states = ['BR', 'UP', 'DL', 'MH', 'KA', 'HR'];
    const rState = states[Math.floor(Math.random() * states.length)];
    const rDigit = String(Math.floor(1 + Math.random() * 99)).padStart(2, '0');
    const rLetters = ['JZ', 'AB', 'XY', 'CD', 'EQ'][Math.floor(Math.random() * 5)];
    const rNum = String(Math.floor(100 + Math.random() * 9000)).padStart(4, '0');
    elVehicleNo.value = `${rState}${rDigit}${rLetters}${rNum}`;

    renderReceipt();
    showToast('Randomized fuel receipt values', 'success');
  }

  // --- Export as Image (PNG / JPEG) ---
  async function downloadImage(format = 'png') {
    if (typeof html2canvas === 'undefined') {
      showToast('html2canvas library is loading, please try again in a moment.', 'error');
      return;
    }

    showToast('Generating high-resolution receipt image...', 'success');

    try {
      const canvas = await html2canvas(receiptWrapper, {
        scale: 3, // 3x sharp retina rendering
        useCORS: true,
        backgroundColor: elPaperTone.value === 'transparent' ? null : null,
        logging: false
      });

      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const fileExt = format === 'jpeg' ? 'jpg' : 'png';
      const link = document.createElement('a');
      const filename = `Fuel_Receipt_${currentTemplateKey.toUpperCase()}_${formatDDMMYY(elReceiptDate.value).replace(/\//g, '')}_${Date.now()}.${fileExt}`;
      
      link.download = filename;
      link.href = canvas.toDataURL(mimeType, 0.95);
      link.click();

      showToast(`Receipt downloaded as ${fileExt.toUpperCase()}!`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Error exporting receipt image.', 'error');
    }
  }

  // --- Export as PDF ---
  async function downloadPDF() {
    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
      showToast('PDF export libraries are loading, please try again.', 'error');
      return;
    }

    showToast('Generating receipt PDF document...', 'success');

    try {
      const canvas = await html2canvas(receiptWrapper, {
        scale: 3,
        useCORS: true,
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;

      // Calculate receipt dimensions in mm (standard 58mm handheld POS width)
      const pdfWidth = 58;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight + 6]
      });

      pdf.addImage(imgData, 'PNG', 0, 3, pdfWidth, pdfHeight);
      
      const filename = `Fuel_Receipt_${currentTemplateKey.toUpperCase()}_${formatDDMMYY(elReceiptDate.value).replace(/\//g, '')}.pdf`;
      pdf.save(filename);

      showToast('Receipt PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('PDF error:', err);
      showToast('Error exporting receipt to PDF.', 'error');
    }
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : '⚠️'}</span>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
