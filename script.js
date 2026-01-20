/\* script.js integrado:

   - PapaParse CSV parsing

   - Fuse.js fuzzy search (si está disponible)

   - doble slider para monto (minMonto / maxMonto)

   - paginación (21 por página)

   - modal con requisitos + unidad + area + contactos

   - calculadora de estimados por canal en modal

   - export PDF (jsPDF + autoTable) landscape con encabezado y pie

   - NOTE: si tienes config.js que define SHEET\_CSV\_URL, el script usará esa URL automáticamente

\*/



const CSV\_URL = (typeof SHEET\_CSV\_URL !== "undefined") ? SHEET\_CSV\_URL :

  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSvu5g5Ubgccjk\_GafzxPj7J1WQYvlFLWD4OURUQQ8BgTKREDec4R5aXNRoqOgU9avsFvggsWfafWyS/pub?gid=1276577330\&single=true\&output=csv";



// DOM

const searchInput = document.getElementById("searchInput");

const unidadFilter = document.getElementById("unidadFilter");

const exportPdfBtn = document.getElementById("exportPdfBtn");

const cardsContainer = document.getElementById("cardsContainer");

const statusEl = document.getElementById("status");

const paginationEl = document.getElementById("pagination");



const minMontoInput = document.getElementById("minMonto");

const maxMontoInput = document.getElementById("maxMonto");

const minMontoValue = document.getElementById("minMontoValue");

const maxMontoValue = document.getElementById("maxMontoValue");



// Modal elements

const modalOverlay = document.getElementById("modalOverlay");

const modalTitle = document.getElementById("modalTitle");

const modalUnidad = document.getElementById("modalUnidad");

const modalArea = document.getElementById("modalArea");

const modalCorreo = document.getElementById("modalCorreo");

const modalTelefono = document.getElementById("modalTelefono");

const modalRequisitos = document.getElementById("modalRequisitos");

const modalCloseBtn = document.getElementById("modalClose");

const modalCorreoLink = document.getElementById("modalCorreoLink");

const modalTelefonoLink = document.getElementById("modalTelefonoLink");



// Modal calc controls

const canalSelect = document.getElementById("canalSelect");

const estimationResult = document.getElementById("estimationResult");



// Data

let rawData = \[];

let mappedData = \[];

let fuse = null;

let filteredData = \[];

let pageSize = 21;

let currentPage = 1;



// Utilities

function keyify(s){ return s ? s.toString().trim().toLowerCase().replace(/\\s+/g," ") : ""; }



function parseMonto(v){

  if(!v) return 0;

  let s = v.toString().trim();

  s = s.replace(/S\\/|s\\/|soles|sol/gi, "");

  s = s.replace(/\\s/g,"");

  s = s.replace(/,/g,".");

  s = s.replace(/\[^0-9.]/g,"");

  const parts = s.split(".");

  if(parts.length>2){

    const dec = parts.pop();

    s = parts.join("") + "." + dec;

  }

  const n = parseFloat(s);

  return isNaN(n) ? 0 : n;

}



function escapeHTML(s){

  if(!s) return "";

  return s.replace(/\[\&<>"']/g, m => ({'\&':'\&amp;','<':'\&lt;','>':'\&gt;','"':'\&quot;',"'":'\&#39;'})\[m]);

}



// Map CSV row to normalized object

function mapRow(row){

  const normalized = {};

  Object.keys(row || {}).forEach(k => normalized\[keyify(k)] = (row\[k] || "").toString().trim());



  const out = {};

  out.origen = normalized\["tupa/tusne"] || normalized\["tupa/tusne (origen de la tarifa)"] || normalized\["origen"] || "";

  out.unidad = normalized\["centro de costo"] || normalized\["unidad responsable"] || "";

  out.cxc = normalized\["cxc"] || "";

  out.area =

  normalized\["área responsable"] ||

  normalized\["area responsable"] ||

  normalized\["área responsable de brindar el servicio"] ||

  normalized\["area responsable de brindar el servicio"] ||

  normalized\["area"] ||

  "";

  out.proceso = normalized\["proceso"] || "";

  out.tarifa = normalized\["tarifas"] || normalized\["tarifa"] || normalized\["denominación de la tarifa"] || "";

  out.montoRaw = normalized\["monto"] || "";

  out.monto = parseMonto(out.montoRaw);

  out.requisitos = normalized\["requisitos generales"] || normalized\["requisitos"] || "";

  out.correo = normalized\["correo"] || "";

  out.celular = (normalized\["n° celular"] || normalized\["numero celular"] || normalized\["celular"] || "").replace(/\\s/g,"");

  return out;

}



// Load CSV via PapaParse

function loadCSV(url){

  statusEl.textContent = "Cargando datos...";

  if(typeof Papa === "undefined"){

    statusEl.textContent = "Error: PapaParse no está cargado.";

    console.error("PapaParse no encontrado.");

    return;

  }



  Papa.parse(url, {

    download: true,

    header: true,

    skipEmptyLines: true,

    complete: result => {

      rawData = result.data || \[];

      mappedData = rawData.map(mapRow).filter(r => r \&\& (r.tarifa || r.proceso));

      if(mappedData.length === 0){

        statusEl.textContent = "No se encontraron registros.";

        return;

      }



      // Fuse.js fuzzy search init if available

      if(typeof Fuse !== "undefined"){

        fuse = new Fuse(mappedData, {

          keys: \[

            {name: "proceso", weight: 0.9},

            {name: "tarifa", weight: 0.8},

            {name: "unidad", weight: 0.7},

            {name: "area", weight: 0.5}

          ],

          threshold: 0.35

        });

      } else {

        fuse = null;

      }



      initMontoRange();

      populateFilters();

      applyAllFilters();



      statusEl.classList.add("hidden");

    },

    error: err => {

      console.error("PapaParse error:", err);

      statusEl.textContent = "Error cargando datos. Revisa consola.";

    }

  });

}



// Initialize monto slider bounds

function initMontoRange(){

  const montos = mappedData.map(r => r.monto || 0);

  const min = Math.min(...montos);

  const max = Math.max(...montos);



  const pad = Math.max(1, Math.round(max \* 0.02));

  const low = Math.max(0, Math.floor(min) - pad);

  const high = Math.ceil(max) + pad;



  minMontoInput.min = low;

  minMontoInput.max = high;

  maxMontoInput.min = low;

  maxMontoInput.max = high;



  minMontoInput.value = low;

  maxMontoInput.value = high;



  minMontoValue.textContent = low;

  maxMontoValue.textContent = high;



  // listeners

  minMontoInput.addEventListener("input", onSliderChange);

  maxMontoInput.addEventListener("input", onSliderChange);

}



function onSliderChange(){

  let a = Number(minMontoInput.value);

  let b = Number(maxMontoInput.value);

  if(a > b) \[a,b] = \[b,a];

  minMontoValue.textContent = a;

  maxMontoValue.textContent = b;

  currentPage = 1;

  applyAllFilters();

}



// Populate Unidad select (Proceso removed intentionally)

function populateFilters(){

  const unidades = Array.from(new Set(mappedData.map(d => d.unidad).filter(Boolean))).sort();



  unidadFilter.innerHTML = `<option value="">Unidad Responsable</option>`;



  unidades.forEach(u => {

    const opt = document.createElement("option");

    opt.value = u; opt.textContent = u;

    unidadFilter.appendChild(opt);

  });



  unidadFilter.onchange = () => { currentPage = 1; applyAllFilters(); };

}



// Apply search + filters + monto + ordering and then pagination

function applyAllFilters(){

  const q = (searchInput.value || "").trim();

  const unidad = unidadFilter.value;

  const minV = Math.min(Number(minMontoInput.value), Number(maxMontoInput.value));

  const maxV = Math.max(Number(minMontoInput.value), Number(maxMontoInput.value));



  let results = mappedData.slice();



  // fuzzy search

  if(q.length >= 2 \&\& fuse){

    const res = fuse.search(q);

    results = res.map(r => r.item);

  } else if(q.length >= 2){

    const ql = q.toLowerCase();

    results = results.filter(r =>

      (r.proceso || "").toLowerCase().includes(ql) ||

      (r.tarifa || "").toLowerCase().includes(ql) ||

      (r.unidad || "").toLowerCase().includes(ql) ||

      (r.area || "").toLowerCase().includes(ql)

    );

  }



  // unidad filter

  if(unidad) results = results.filter(r => r.unidad === unidad);



  // monto filter

  results = results.filter(r => (r.monto || 0) >= minV \&\& (r.monto || 0) <= maxV);



  // Order TUPA first

  results.sort((a,b) => {

    const ao = (a.origen || "").toString().toLowerCase();

    const bo = (b.origen || "").toString().toLowerCase();

    if(ao === "tupa" \&\& bo !== "tupa") return -1;

    if(ao !== "tupa" \&\& bo === "tupa") return 1;

    return 0;

  });



  filteredData = results;

  renderPage(1);

}



// RENDER pagination \& page

function renderPage(page){

  currentPage = page;

  const total = filteredData.length;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if(page < 1) page = 1;

  if(page > totalPages) page = totalPages;



  const start = (page - 1) \* pageSize;

  const end = start + pageSize;

  const pageItems = filteredData.slice(start, end);



  renderCards(pageItems);

  renderPagination(totalPages, page);

  // scroll to top of container

  window.scrollTo({ top: document.querySelector(".container").offsetTop - 10, behavior: "smooth" });

}



function renderCards(items){

  cardsContainer.innerHTML = "";

  if(!items || items.length === 0){

    cardsContainer.innerHTML = `<div class="status">No se encontraron resultados.</div>`;

    return;

  }



  items.forEach(item => {

    const div = document.createElement("div");

    div.className = "card";



    const montoDisplay = item.monto ? item.monto.toString() : (item.montoRaw || "0");



    div.innerHTML = `

      <div class="tag-origen">Origen: ${escapeHTML(item.origen || "")}</div>

      <div class="card-title">${escapeHTML(item.proceso || "—")}</div>



      <div class="meta"><strong>Tarifa:</strong> ${escapeHTML(item.tarifa || "—")}</div>

      <div class="meta"><strong>Monto:</strong> S/ ${escapeHTML(montoDisplay)}</div>

      <div class="meta"><strong>Unidad:</strong> ${escapeHTML(item.unidad || "—")}</div>

      <div class="meta"><strong>Responsable:</strong> ${escapeHTML(item.area || "—")}</div>



      <div class="actions">

        <button class="btn btn-requisitos" data-item='${encodeURIComponent(JSON.stringify(item))}'><i class="bi bi-list-check"> Requisitos</button>

        <a class="btn btn-mail" href="https://mail.google.com/mail/?view=cm\&fs=1\&to=${encodeURIComponent(item.correo||"")}" target="\_blank" rel="noopener noreferrer"><i class="bi bi-envelope-fill"> Correo</a>

        <a class="btn btn-ws" href="https://wa.me/51${encodeURIComponent((item.celular||"").replace(/\\D/g,""))}" target="\_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp"> WhatsApp</a>

      </div>

    `;



    // attach listener for modal

    const reqBtn = div.querySelector(".btn-requisitos");

    reqBtn.addEventListener("click", () => {

      const it = JSON.parse(decodeURIComponent(reqBtn.getAttribute("data-item")));

      openModal(it);

    });



    cardsContainer.appendChild(div);

  });

}



// Pagination UI

function renderPagination(totalPages, current){

  paginationEl.innerHTML = "";

  if(totalPages <= 1) return;



  const createBtn = (txt, cls, onClick) => {

    const b = document.createElement("button");

    b.className = cls || "page-btn";

    b.textContent = txt;

    b.addEventListener("click", onClick);

    return b;

  };



  // First / Prev

  paginationEl.appendChild(createBtn("«", "page-btn", () => renderPage(1)));

  paginationEl.appendChild(createBtn("‹", "page-btn", () => renderPage(Math.max(1, current-1))));



  // Pages

  const maxButtons = 7;

  let start = Math.max(1, current - Math.floor(maxButtons/2));

  let end = Math.min(totalPages, start + maxButtons - 1);

  if(end - start < maxButtons -1){

    start = Math.max(1, end - maxButtons + 1);

  }



  for(let p = start; p<=end; p++){

    const cls = p === current ? "page-btn active" : "page-btn";

    paginationEl.appendChild(createBtn(p, cls, () => renderPage(p)));

  }



  // Next / Last

  paginationEl.appendChild(createBtn("›", "page-btn", () => renderPage(Math.min(totalPages, current+1))));

  paginationEl.appendChild(createBtn("»", "page-btn", () => renderPage(totalPages)));

}



// Open modal: show details + parse requisitos + setup calc

function openModal(item){

  modalTitle.textContent = item.proceso || item.tarifa || "Detalle";



  // Unidad/Area/correo/telefono separated (no extra bullet)

  modalUnidad.textContent = item.unidad || "—";

  modalArea.textContent = item.area || "—";



  if(item.correo){

    modalCorreo.textContent = item.correo;

    modalCorreoLink.href = `mailto:${item.correo}`;

  } else {

    modalCorreo.textContent = "—";

    modalCorreoLink.href = "#";

  }



  const cel = (item.celular || "").replace(/\\D/g,"");

  if(cel){

    modalTelefono.textContent = cel;

    modalTelefonoLink.href = `https://wa.me/51${cel}`;

  } else {

    modalTelefono.textContent = "—";

    modalTelefonoLink.href = "#";

  }



  // Requisitos => bullets

  let text = item.requisitos || "No especificado";

  let parts = \[];



  if(text.includes("\\n")) parts = text.split(/\\n+/);

  else if(text.includes(";")) parts = text.split(/\\s\*;\\s\*/);

  else if(text.includes(".") \&\& text.length > 40) parts = text.split(/\\.\\s+/).filter(Boolean);

  else parts = \[text];



  modalRequisitos.innerHTML = "";

  const ul = document.createElement("ul");

  parts.forEach(p => {

    const li = document.createElement("li");

    li.textContent = p.trim();

    ul.appendChild(li);

  });

  modalRequisitos.appendChild(ul);



  // Reset calc selection \& result

  canalSelect.value = "";

  estimationResult.textContent = "";



  // store current item for calc usage

  modalOverlay.dataset.currentItem = encodeURIComponent(JSON.stringify(item));



  // show modal

  modalOverlay.classList.remove("hidden");

  modalOverlay.setAttribute("aria-hidden","false");

  document.body.style.overflow = "hidden";

}



// Close modal

function closeModal(){

  modalOverlay.classList.add("hidden");

  modalOverlay.setAttribute("aria-hidden","true");

  document.body.style.overflow = "";

}



// Calculation logic for channels

function calculateEstimate(item, canalKey){

  const base = Number(item.monto || 0);

  let commission = 0;

  let note = "";



  switch(canalKey){

    case "caja\_unh":

      // Caja UNH: S/1.00 for amounts >= 20

      if(base >= 20) commission = 1.00;

      else commission = 0;

      note = (base >= 20) ? "Caja UNH (aplica S/1.00 por montos ≥ S/20)" : "Caja UNH (no aplica para montos < S/20)";

      break;

    case "bn\_fijo":

      // Banco de la Nación: S/1.80 for amounts 0.10 - 144

      if(base > 0 \&\& base <= 144) commission = 1.80;

      else commission = 0;

      note = "Banco de la Nación (fijo S/1.80 para montos hasta S/144)";

      break;

    case "bn\_pct":

      // Banco de la Nación: 1.25% for > 144

      if(base > 144) commission = base \* 0.0125;

      else commission = 0;

      note = "Banco de la Nación (1.25% para montos > S/144)";

      break;

    case "caja\_huancayo":

      commission = 1.00;

      note = "Caja Huancayo (S/1.00)";

      break;

    case "niubiz":

      commission = base \* 0.058; // 5.8%

      note = "Niubiz (5.8% sobre monto)";

      break;

    default:

      commission = 0;

      note = "Sin canal seleccionado";

  }



  const total = base + commission;

  return { base, commission, total, note };

}



// modal canal change handler

canalSelect.addEventListener("change", () => {

  const enc = modalOverlay.dataset.currentItem;

  if(!enc) return;

  const item = JSON.parse(decodeURIComponent(enc));

  const canal = canalSelect.value;

  if(!canal){

    estimationResult.textContent = "";

    return;

  }

  const res = calculateEstimate(item, canal);

  const formatted = `Base: S/ ${res.base.toFixed(2)} — Comisión: S/ ${res.commission.toFixed(2)} — Total estimado: S/ ${res.total.toFixed(2)} (${res.note}).`;

  estimationResult.textContent = formatted;

});



// close handlers

if(modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);

modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay) closeModal(); });



// Escape HTML helper already defined earlier (escapeHTML)



// UI handlers

searchInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

minMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

maxMontoInput.addEventListener("input", () => { currentPage = 1; applyAllFilters(); });

unidadFilter.addEventListener("change", () => { currentPage = 1; applyAllFilters(); });



// Export PDF button

exportPdfBtn.addEventListener("click", () => {

  // Determine data to export: if unidad selected, use filteredData filtered by unidad; else export filteredData

  const unidad = unidadFilter.value;

  let toExport = filteredData.slice();

  if(unidad) toExport = toExport.filter(r => r.unidad === unidad);



  if(!toExport || toExport.length === 0){

    alert("No hay registros para exportar según los filtros seleccionados.");

    return;

  }



  // Build table rows

  const rows = toExport.map(r => \[

    r.proceso || "",

    r.tarifa || "",

    (r.monto || 0).toFixed(2),

    r.cxc || "",

    r.origen || "",

    r.requisitos || ""

  ]);



  // Header text

  const unidadLabel = unidad || "General";

  const headerText1 = "UNIVERSIDAD NACIONAL DE HUANCAVELICA - Tarifario (Reporte)";

  const headerText2 = `Unidad Responsable: ${unidadLabel}`;

  const headerText3 = "El monto mostrado es referencial. El total a pagar puede incluir comisiones según el canal de pago (Caja UNH, Banco de la Nación, Caja Huancayo, Niubiz, etc.). Cotejar el monto final en la entidad recaudadora.";



  // Create jsPDF (landscape)

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });



  // Add title on first page top

  const pageWidth = doc.internal.pageSize.getWidth();

  const marginLeft = 40;

  const marginTop = 40;



  // Use autoTable with didDrawPage to draw header \& footer

  doc.autoTable({

    head: \[\['Proceso', 'Tarifa', 'Monto (S/)', 'Unidad de Organización', 'Origen', 'Requisitos']],

    body: rows,

    startY: marginTop + 60,

    styles: { fontSize: 10, cellPadding: 6, halign: 'center' },

    headStyles: { fillColor: \[0, 56, 102], textColor: 255, fontStyle: 'bold' },

    columnStyles: {

      0: { cellWidth: 120 }, // proceso

      1: { cellWidth: 150 }, // tarifa

      2: { cellWidth: 60 },  // monto

      3: { cellWidth: 120 }, // area

      4: { cellWidth: 80 },  // origen

      5: { cellWidth: 260 }  // requisitos (ancha)

    },

  didDrawPage: function (data) {



  // 👉 Dibujar encabezado SOLO en la primera página

  if (data.pageNumber === 1) {



    doc.setFontSize(12);

    doc.setTextColor(0, 40, 80);

    doc.text(headerText1, marginLeft, 30);



    doc.setFontSize(10);

    doc.text(headerText2, marginLeft, 46);



    doc.setFontSize(9);

    doc.setTextColor(60, 60, 60);

    doc.text(headerText3, marginLeft, 62, {

      maxWidth: pageWidth - marginLeft \* 2

    });

  }



  // 👉 El footer NO se dibuja aquí.

},

    margin: { left: marginLeft, right: 40, top: marginTop }

  });



  // Add generated timestamp on last page bottom-left

  const now = new Date();

  const ts = now.toLocaleString('es-PE', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

  const pageCount = doc.getNumberOfPages();

  doc.setPage(pageCount);

  doc.setFontSize(9);

  doc.setTextColor(100);

  doc.text(`Reporte generado: ${ts}`, marginLeft, doc.internal.pageSize.getHeight() - 30);



  // Save file

  const unidadSafe = unidadLabel.replace(/\\s+/g, '\_').replace(/\[^\\w\_-]/g, '');

  doc.save(`Tarifario\\\_${unidadSafe || 'General'}.pdf`);

});



// initialize

if(!CSV\_URL){

  statusEl.textContent = "No se ha configurado la URL del CSV.";

} else {

  loadCSV(CSV\_URL);

}
