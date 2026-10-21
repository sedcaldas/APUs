// Main Application Controller — Caldas Educational Infrastructure Budget System
import { api } from './api.js';

// Application State
const state = {
  currentTab: 'dashboard',
  currentRole: 'Formulador',
  theme: localStorage.getItem('caldas_theme') || 'light',
  activeProjectId: null,
  activeBudgetId: 1, // Default initial budget
  analyticsFilters: {
    projectId: null,
    subregionId: null,
    estado: null,
    periodo: 'ultimos_6_meses'
  },
  territoryCache: {
    subregiones: [],
    municipios: [],
    instituciones: [],
    sedes: []
  }
};

let activeDashboardCharts = {};
function destroyDashboardCharts() {
  Object.keys(activeDashboardCharts).forEach(key => {
    try {
      if (activeDashboardCharts[key] && typeof activeDashboardCharts[key].destroy === 'function') {
        activeDashboardCharts[key].destroy();
      }
    } catch (e) {}
  });
  activeDashboardCharts = {};
}

// DOM Elements
const viewport = document.getElementById('content-viewport');
const pageTitle = document.getElementById('page-current-title');
const roleSelector = document.getElementById('user-role-selector');
const themeBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');

// Modal Elements
const modalOverlay = document.getElementById('app-modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
let modalConfirmCallback = null;

// Currency Formatter
const formatCOP = (val) => {
  if (val === null || val === undefined) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(val);
};

// Toast Notifications
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal Helpers
function openModal(title, bodyHtml, onConfirm, confirmText = 'Confirmar') {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalConfirmBtn.textContent = confirmText;
  modalConfirmCallback = onConfirm;
  modalOverlay.classList.add('active');
}

function closeModal() {
  modalOverlay.classList.remove('active');
  modalConfirmCallback = null;
}

modalCloseBtn.addEventListener('click', closeModal);
modalCancelBtn.addEventListener('click', closeModal);
modalConfirmBtn.addEventListener('click', () => {
  if (modalConfirmCallback) modalConfirmCallback();
});

// Theme Management
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  localStorage.setItem('caldas_theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

themeBtn.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// Role Management
roleSelector.addEventListener('change', (e) => {
  state.currentRole = e.target.value;
  showToast(`Rol cambiado a: ${state.currentRole}`, 'info');
  // Re-render current view to apply role restrictions
  renderCurrentView();
});

// Tab Navigation
document.querySelectorAll('.app-sidebar .nav-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = item.dataset.tab;
    switchTab(tab);
  });
});

export function switchTab(tab, extraState = {}) {
  state.currentTab = tab;
  Object.assign(state, extraState);

  document.querySelectorAll('.app-sidebar .nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  const titles = {
    dashboard: 'Dashboard de Analytics & Control Presupuestal',
    territory: 'Navegación Territorial e Infraestructura Educativa',
    projects: 'Gestión de Proyectos de Obra',
    budget_editor: 'Editor de Presupuesto en Línea',
    apus: 'Catálogo y Análisis de Precios Unitarios (APU)',
    insumos: 'Catálogo de Insumos, Cuadrillas y Precios',
    parameters: 'Parámetros Globales, AIU y Pólizas',
    bulk_import: 'Centro de Operaciones Masivas (Excel / CSV)',
    compare: 'Comparador de Versiones y Escenarios',
    reports: 'Reportes Consolidados y Exportaciones',
    audit: 'Bitácora Inmutable de Auditoría'
  };

  pageTitle.textContent = titles[tab] || 'Presupuestos Caldas';
  renderCurrentView();
}

// View Routing Dispatcher
function renderCurrentView() {
  viewport.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Cargando módulo...</div>';
  
  switch (state.currentTab) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'territory':
      renderTerritory();
      break;
    case 'projects':
      renderProjects();
      break;
    case 'budget_editor':
      renderBudgetEditor();
      break;
    case 'apus':
      renderApus();
      break;
    case 'insumos':
      renderInsumos();
      break;
    case 'parameters':
      renderParameters();
      break;
    case 'bulk_import':
      renderBulkImport();
      break;
    case 'compare':
      renderCompare();
      break;
    case 'reports':
      renderReports();
      break;
    case 'audit':
      renderAudit();
      break;
    default:
      renderDashboard();
  }
}

// -------------------------------------------------------------
// MODULE 1: DASHBOARD & ANALYTICS (PRESUCOSTO COMPLIANT)
// -------------------------------------------------------------
async function renderDashboard() {
  destroyDashboardCharts();
  viewport.innerHTML = '<div style="text-align:center; padding: 60px; color: var(--text-muted);"><div class="spinner" style="margin-bottom:12px;">⏳</div>Cargando Dashboard de Analytics & Reportes PresuCosto...</div>';

  try {
    const allProjects = await api.listProjects();
    const subregiones = await api.getSubregiones();
    const data = await api.getDashboardMetrics(state.analyticsFilters);

    const isProjectScope = !!state.analyticsFilters.projectId;
    const selectedProject = isProjectScope ? allProjects.find(p => p.id == state.analyticsFilters.projectId) : null;

    viewport.innerHTML = `
      <!-- PresuCosto Analytics Toolbar -->
      <div class="analytics-toolbar">
        <div class="analytics-toolbar-left">
          <div class="analytics-control-group">
            <span class="analytics-control-label">Alcance / Presupuesto:</span>
            <select id="analytics-scope-select" class="analytics-select scope-select" title="Seleccionar presupuesto específico o consolidado global">
              <option value="" ${!isProjectScope ? 'selected' : ''}>📊 Consolidado Global (Todos los Presupuestos)</option>
              ${allProjects.map(p => `
                <option value="${p.id}" ${state.analyticsFilters.projectId == p.id ? 'selected' : ''}>
                  📁 ${p.codigo} — ${p.nombre.length > 45 ? p.nombre.substring(0, 45) + '...' : p.nombre}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="analytics-control-group">
            <span class="analytics-control-label">Periodo Temporal:</span>
            <select id="analytics-periodo-select" class="analytics-select">
              <option value="ultimos_6_meses" ${state.analyticsFilters.periodo === 'ultimos_6_meses' ? 'selected' : ''}>Últimos 6 Meses</option>
              <option value="vigencia_2026" ${state.analyticsFilters.periodo === 'vigencia_2026' ? 'selected' : ''}>Vigencia Fiscal 2026</option>
              <option value="historico" ${state.analyticsFilters.periodo === 'historico' ? 'selected' : ''}>Todo el Periodo</option>
            </select>
          </div>

          <div class="analytics-control-group">
            <span class="analytics-control-label">Subregión Caldas:</span>
            <select id="analytics-subregion-select" class="analytics-select">
              <option value="">Todas las Subregiones (${subregiones.length})</option>
              ${subregiones.map(s => `<option value="${s.id}" ${state.analyticsFilters.subregionId == s.id ? 'selected' : ''}>${s.nombre}</option>`).join('')}
            </select>
          </div>

          <div class="analytics-control-group">
            <span class="analytics-control-label">Estado Presupuesto:</span>
            <select id="analytics-estado-select" class="analytics-select">
              <option value="">Todos los Estados</option>
              <option value="Aprobado" ${state.analyticsFilters.estado === 'Aprobado' ? 'selected' : ''}>Aprobado Oficial</option>
              <option value="En Revisión" ${state.analyticsFilters.estado === 'En Revisión' ? 'selected' : ''}>En Revisión</option>
              <option value="Borrador" ${state.analyticsFilters.estado === 'Borrador' ? 'selected' : ''}>Borrador</option>
            </select>
          </div>
        </div>

        <div class="analytics-toolbar-right">
          <button class="btn btn-secondary btn-sm" id="btn-analytics-excel" title="Descargar libro de trabajo Excel con KPIs, Insumos y Rentabilidad">
            <span>📥</span> Exportar Excel
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-analytics-pdf" title="Generar reporte ejecutivo imprimible en PDF">
            <span>📄</span> Imprimir / PDF
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-analytics-refresh" title="Recalcular métricas de la cartera">
            <span>🔄</span> Recalcular
          </button>
        </div>
      </div>

      ${isProjectScope && selectedProject ? `
        <!-- Project Scope Banner -->
        <div class="visual-report-hero" style="margin-bottom: 24px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
            <div>
              <span class="badge badge-success" style="margin-bottom: 6px;">Reporte Visual Activo: ${selectedProject.codigo}</span>
              <h2>${selectedProject.nombre}</h2>
              <div class="visual-report-hero-meta">
                <span>📍 Municipio: <strong>${selectedProject.sedes && selectedProject.sedes[0] ? selectedProject.sedes[0].municipio : 'Caldas'}</strong></span>
                <span>🏫 Sede: <strong>${selectedProject.sedes && selectedProject.sedes[0] ? selectedProject.sedes[0].nombre : 'Principal'}</strong></span>
                <span>🏷️ Tipo: <strong>${selectedProject.tipo_intervencion}</strong></span>
                <span>👤 Responsable: <strong>${selectedProject.responsable || 'Secretaría de Educación'}</strong></span>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-emerald btn-sm" id="btn-scope-to-editor">📝 Editar Presupuesto</button>
              <button class="btn btn-secondary btn-sm" style="background: rgba(255,255,255,0.15); color: #fff; border:none;" id="btn-scope-reset">🌐 Ver Consolidado Global</button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Top Executive Metrics Strip (PresuCosto KPIs) -->
      <div class="metrics-grid" style="margin-bottom: 24px;">
        <!-- KPI 1: Presupuesto Total -->
        <div class="metric-card accent-navy">
          <div class="metric-header">
            <span class="metric-title">Presupuesto Total de Obra</span>
            <span class="metric-icon-wrap">💰</span>
          </div>
          <div class="metric-value">${formatCOP(data.presupuesto_total)}</div>
          <div class="metric-subtitle">Costo Directo + Indirectos AIU (25.00%)</div>
          <div class="metric-pills-row">
            <span class="micro-pill micro-pill-blue">Vigencia 2026</span>
            <span class="micro-pill micro-pill-slate">${data.total_proyectos} ${data.total_proyectos === 1 ? 'obra' : 'obras'}</span>
          </div>
        </div>

        <!-- KPI 2: Costo Directo -->
        <div class="metric-card accent-emerald">
          <div class="metric-header">
            <span class="metric-title">Costo Directo Obra</span>
            <span class="metric-icon-wrap">🏗️</span>
          </div>
          <div class="metric-value">${formatCOP(data.costo_directo_total)}</div>
          <div class="metric-subtitle">Total partidas y actividades ejecutadas</div>
          <div class="metric-pills-row">
            <span class="micro-pill micro-pill-emerald" title="Materiales e Insumos">🧱 Mat: ${data.costos_desglose.materiales_pct}%</span>
            <span class="micro-pill micro-pill-blue" title="Mano de Obra y Cuadrillas">👷 MO: ${data.costos_desglose.mano_obra_pct}%</span>
            <span class="micro-pill micro-pill-amber" title="Equipos y Herramientas">🚜 Eq: ${data.costos_desglose.herramientas_pct}%</span>
          </div>
        </div>

        <!-- KPI 3: Costos Indirectos AIU -->
        <div class="metric-card accent-amber">
          <div class="metric-header">
            <span class="metric-title">Costos Indirectos (AIU)</span>
            <span class="metric-icon-wrap">📐</span>
          </div>
          <div class="metric-value">${formatCOP(data.costo_indirecto_total)}</div>
          <div class="metric-subtitle">Administración, Imprevistos y Utilidad Legal</div>
          <div class="metric-pills-row">
            <span class="micro-pill micro-pill-slate" title="Administración 15%">Adm 15% (${formatCOP(data.aiu_desglose.administracion)})</span>
            <span class="micro-pill micro-pill-slate" title="Imprevistos 5%">Imp 5%</span>
            <span class="micro-pill micro-pill-slate" title="Utilidad 5%">Utl 5%</span>
          </div>
        </div>

        <!-- KPI 4: Rentabilidad Estimada -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Rentabilidad Proyectada</span>
            <span class="metric-icon-wrap">📈</span>
          </div>
          <div class="metric-value" style="color: var(--emerald-600);">${formatCOP(data.rentabilidad.utilidad_estimada)}</div>
          <div class="metric-subtitle">Margen contractual neto del ${data.rentabilidad.margen_pct.toFixed(2)}%</div>
          <div class="metric-pills-row">
            <span class="micro-pill micro-pill-emerald">✨ ${data.rentabilidad.estado_rentabilidad}</span>
          </div>
        </div>

        <!-- KPI 5: Tiempo de Labor Estimado (Horas-Hombre) -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Tiempo Estimado de Labor</span>
            <span class="metric-icon-wrap">⏱️</span>
          </div>
          <div class="metric-value">${data.tiempo_labor.horas_total.toLocaleString('es-CO')} <span style="font-size: 15px; font-weight: 500; color: var(--text-muted);">Horas-Hombre</span></div>
          <div class="labor-time-grid">
            <div class="labor-time-item" title="Jornadas de 8 horas">
              <span class="labor-time-val">${data.tiempo_labor.dias_estimados}</span>
              <span class="labor-time-lbl">Días</span>
            </div>
            <div class="labor-time-item" title="Semanas de 40 horas laborales">
              <span class="labor-time-val">${data.tiempo_labor.semanas_estimadas}</span>
              <span class="labor-time-lbl">Semanas</span>
            </div>
            <div class="labor-time-item" title="Meses promedio de cuadrilla (160h)">
              <span class="labor-time-val">${data.tiempo_labor.meses_estimados}</span>
              <span class="labor-time-lbl">Meses</span>
            </div>
          </div>
        </div>

        <!-- KPI 6: Cobertura de Cartera -->
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Cartera de Infraestructura</span>
            <span class="metric-icon-wrap">🏫</span>
          </div>
          <div class="metric-value">${data.total_sedes_beneficiadas} Sedes</div>
          <div class="metric-subtitle">${data.total_proyectos} Obras activas en Caldas</div>
          <div class="metric-pills-row">
            <span class="micro-pill micro-pill-purple">${data.distribucion_subregiones.length} Subregiones</span>
            <span class="micro-pill micro-pill-emerald">100% Auditado</span>
          </div>
        </div>
      </div>

      <!-- PresuCosto Interactive Charts Section -->
      <div class="charts-grid-2col">
        <!-- Chart 1: Donut Chart - Distribución de Costos Directos -->
        <div class="chart-card">
          <div class="chart-card-header">
            <div class="chart-card-title">
              <h3>🍩 Distribución de Costos Directos</h3>
              <p>Desglose por componente: Materiales, Mano de Obra, Equipos y Transporte</p>
            </div>
            <span class="badge badge-success">Directo Total</span>
          </div>
          <div class="chart-card-body">
            <div class="chart-canvas-container" id="container-donut-directos">
              <canvas id="chart-donut-directos"></canvas>
            </div>
            <div class="chart-legend-wrap">
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #059669;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Materiales (${data.costos_desglose.materiales_pct}%)</strong>
                  <span>${formatCOP(data.costos_desglose.materiales)}</span>
                </div>
              </div>
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #2563eb;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Mano de Obra (${data.costos_desglose.mano_obra_pct}%)</strong>
                  <span>${formatCOP(data.costos_desglose.mano_obra)}</span>
                </div>
              </div>
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #d97706;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Herramientas / Eq (${data.costos_desglose.herramientas_pct}%)</strong>
                  <span>${formatCOP(data.costos_desglose.herramientas)}</span>
                </div>
              </div>
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #7c3aed;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Transporte (${data.costos_desglose.transporte_pct}%)</strong>
                  <span>${formatCOP(data.costos_desglose.transporte)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chart 2: Bar Chart - Costo Directo vs AIU (Indirectos) -->
        <div class="chart-card">
          <div class="chart-card-header">
            <div class="chart-card-title">
              <h3>📊 Costos Directos vs Indirectos (AIU)</h3>
              <p>Estructura contractual: Directo frente a Administración, Imprevistos y Utilidad</p>
            </div>
            <span class="badge badge-neutral">AIU 25%</span>
          </div>
          <div class="chart-card-body">
            <div class="chart-canvas-container" id="container-bar-aiu">
              <canvas id="chart-bar-aiu"></canvas>
            </div>
            <div class="chart-legend-wrap">
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #1b365d;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Directo (80%)</strong>
                  <span>${formatCOP(data.costo_directo_total)}</span>
                </div>
              </div>
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #3b82f6;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Administración (15%)</strong>
                  <span>${formatCOP(data.aiu_desglose.administracion)}</span>
                </div>
              </div>
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #f59e0b;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Imprevistos (5%)</strong>
                  <span>${formatCOP(data.aiu_desglose.imprevistos)}</span>
                </div>
              </div>
              <div class="chart-legend-badge">
                <span class="chart-color-dot" style="background: #10b981;"></span>
                <div class="chart-legend-badge-text">
                  <strong>Utilidad (5%)</strong>
                  <span>${formatCOP(data.aiu_desglose.utilidad)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chart 3: Area/Line Chart - Evolución Temporal de Costos (Últimos 6 meses) -->
        <div class="chart-card">
          <div class="chart-card-header">
            <div class="chart-card-title">
              <h3>📈 Evolución Temporal de Costos</h3>
              <p>Historial y proyección de desembolso presupuestal en los últimos 6 meses</p>
            </div>
            <span class="badge badge-success">Flujo de Obra</span>
          </div>
          <div class="chart-card-body">
            <div class="chart-canvas-container" id="container-timeline-costos">
              <canvas id="chart-timeline-costos"></canvas>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 14px; text-align: right;">
              Acumulado proyectado al periodo: <strong>${formatCOP(data.presupuesto_total)}</strong>
            </div>
          </div>
        </div>

        <!-- Chart 4: Horizontal Bar Chart - Inversión por Capítulos de Obra -->
        <div class="chart-card">
          <div class="chart-card-header">
            <div class="chart-card-title">
              <h3>📑 Distribución por Capítulos de Obra</h3>
              <p>Principales capítulos presupuestales y su peso en la inversión total</p>
            </div>
            <span class="badge badge-neutral">${data.capitulos_inversion.length} Capítulos</span>
          </div>
          <div class="chart-card-body">
            <div class="chart-canvas-container" id="container-bar-capitulos">
              <canvas id="chart-bar-capitulos"></canvas>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 14px; text-align: right;">
              Capítulo con mayor impacto: <strong>${data.capitulos_inversion[0] ? data.capitulos_inversion[0].descripcion : 'Sin datos'}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- PresuCosto Top 10 Insumos Más Utilizados (Pareto Matrix) -->
      <div class="panel-card" style="margin-bottom: 24px;">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>📦 Top 10 de Insumos Más Utilizados e Impacto Presupuestal</h2>
            <p>Análisis de Pareto: Materiales, cuadrillas y equipos con mayor volumen de gasto en los presupuestos</p>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-goto-insumos-catalog">Ver Catálogo Completo</button>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 50px; text-align: center;">#</th>
                  <th style="width: 100px;">Código</th>
                  <th>Descripción del Insumo / Recurso</th>
                  <th style="text-align: center;">Tipo</th>
                  <th style="text-align: center;">Unidad</th>
                  <th style="text-align: right;">Cantidad Acum.</th>
                  <th style="text-align: right;">Precio Unitario</th>
                  <th style="text-align: right;">Gasto Total</th>
                  <th style="width: 180px;">Incidencia (% Gasto)</th>
                  <th style="text-align: center;">Acción</th>
                </tr>
              </thead>
              <tbody>
                ${data.top_insumos.length === 0 ? `
                  <tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">No hay insumos registrados para el filtro actual.</td></tr>
                ` : data.top_insumos.map((ins, i) => {
                  let rankClass = 'rank-other';
                  if (ins.ranking === 1) rankClass = 'rank-1';
                  else if (ins.ranking === 2) rankClass = 'rank-2';
                  else if (ins.ranking === 3) rankClass = 'rank-3';

                  let tipoBadge = 'badge-neutral';
                  let icon = '📦';
                  if (ins.tipo.includes('Cuadrilla') || ins.tipo.includes('Mano')) {
                    tipoBadge = 'badge-info';
                    icon = '👷';
                  } else if (ins.tipo.includes('Herramienta') || ins.tipo.includes('Equipo')) {
                    tipoBadge = 'badge-warning';
                    icon = '🚜';
                  } else if (ins.tipo.includes('Material') || ins.tipo.includes('Insumo')) {
                    tipoBadge = 'badge-success';
                    icon = '🧱';
                  }

                  let barColorClass = '';
                  if (ins.porcentaje_incidencia > 20) barColorClass = 'emerald';
                  else if (ins.porcentaje_incidencia > 10) barColorClass = 'blue';
                  else barColorClass = 'amber';

                  return `
                    <tr>
                      <td style="text-align: center;">
                        <span class="rank-badge ${rankClass}">${ins.ranking}</span>
                      </td>
                      <td><span class="table-code">${ins.codigo}</span></td>
                      <td style="font-weight: 600;">${ins.descripcion}</td>
                      <td style="text-align: center;">
                        <span class="badge ${tipoBadge}">${icon} ${ins.tipo}</span>
                      </td>
                      <td style="text-align: center; font-weight: 600;">${ins.unidad}</td>
                      <td style="text-align: right;">${ins.cantidad.toLocaleString('es-CO')}</td>
                      <td style="text-align: right;">${formatCOP(ins.precio_unitario)}</td>
                      <td style="text-align: right; font-weight: 700; color: var(--primary-700);">${formatCOP(ins.costo_total)}</td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <div class="pareto-progress-wrap">
                            <div class="pareto-progress-fill ${barColorClass}" style="width: ${Math.min(100, ins.porcentaje_incidencia * 2)}%;"></div>
                          </div>
                          <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); min-width: 38px;">${ins.porcentaje_incidencia}%</span>
                        </div>
                      </td>
                      <td style="text-align: center;">
                        <button class="btn btn-secondary btn-sm" onclick="window.exploreInsumo('${ins.codigo}')">🔍 Ver</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- PresuCosto Cartera y Rentabilidad por Proyecto (Ranking de Obras) -->
      <div class="panel-card" style="margin-bottom: 24px;">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>🏗️ Cartera de Presupuestos y Rentabilidad por Proyecto</h2>
            <p>Supervisión ejecutiva de costos directos, indirectos, margen proyectado y tiempos de labor por obra</p>
          </div>
          <button class="btn btn-emerald btn-sm" id="btn-create-project-from-dashboard">➕ Formular Nueva Obra</button>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Proyecto / Institución Educativa</th>
                  <th>Municipio</th>
                  <th style="text-align: right;">Costo Directo</th>
                  <th style="text-align: right;">AIU (25%)</th>
                  <th style="text-align: right;">Presupuesto Total</th>
                  <th style="text-align: right;">Rentabilidad (5%)</th>
                  <th style="text-align: center;">Tiempo Labor</th>
                  <th style="text-align: center;">Estado</th>
                  <th style="text-align: center;">Acciones PresuCosto</th>
                </tr>
              </thead>
              <tbody>
                ${data.proyectos_analytics.length === 0 ? `
                  <tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">No hay proyectos que coincidan con los filtros seleccionados.</td></tr>
                ` : data.proyectos_analytics.map(p => `
                  <tr class="project-row-interactive">
                    <td><span class="table-code">${p.codigo}</span></td>
                    <td>
                      <div style="font-weight: 600; color: var(--text-main);">${p.nombre}</div>
                      <div style="font-size: 11px; color: var(--text-muted);">${p.institucion || p.sede || ''}</div>
                    </td>
                    <td><span class="badge badge-neutral">📍 ${p.municipio}</span></td>
                    <td style="text-align: right; font-weight: 600;">${formatCOP(p.costo_directo)}</td>
                    <td style="text-align: right; color: var(--text-muted);">${formatCOP(p.costo_indirecto)}</td>
                    <td style="text-align: right; font-weight: 700; color: var(--primary-700);">${formatCOP(p.valor_total)}</td>
                    <td style="text-align: right; font-weight: 600; color: var(--emerald-600);">${formatCOP(p.utilidad_estimada)}</td>
                    <td style="text-align: center;">
                      <span class="badge badge-info" title="${p.horas_labor} horas">${p.dias_labor} Días</span>
                    </td>
                    <td style="text-align: center;">
                      <span class="badge ${p.estado === 'Aprobado' ? 'badge-success' : p.estado === 'En Revisión' ? 'badge-warning' : 'badge-neutral'}">${p.estado}</span>
                    </td>
                    <td style="text-align: center;">
                      <div style="display: inline-flex; gap: 6px;">
                        <button class="btn btn-secondary btn-sm" onclick="window.openProjectVisualReport(${p.id})" title="Ver Reporte Visual PresuCosto">
                          👁️ Reporte
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="window.openProjectEditor(${p.id})" title="Abrir en Editor de Presupuesto">
                          📝 Presupuesto
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // ------------------------------------------------------------------------
    // RENDER INTERACTIVE CHARTS (Chart.js or Graceful SVG Fallbacks)
    // ------------------------------------------------------------------------
    renderDashboardCharts(data);

    // ------------------------------------------------------------------------
    // EVENT LISTENERS: FILTERS AND ACTIONS
    // ------------------------------------------------------------------------
    const scopeSelect = document.getElementById('analytics-scope-select');
    const periodoSelect = document.getElementById('analytics-periodo-select');
    const subregionSelect = document.getElementById('analytics-subregion-select');
    const estadoSelect = document.getElementById('analytics-estado-select');

    scopeSelect.addEventListener('change', (e) => {
      state.analyticsFilters.projectId = e.target.value ? parseInt(e.target.value, 10) : null;
      renderDashboard();
    });

    periodoSelect.addEventListener('change', (e) => {
      state.analyticsFilters.periodo = e.target.value;
      renderDashboard();
    });

    subregionSelect.addEventListener('change', (e) => {
      state.analyticsFilters.subregionId = e.target.value ? parseInt(e.target.value, 10) : null;
      renderDashboard();
    });

    estadoSelect.addEventListener('change', (e) => {
      state.analyticsFilters.estado = e.target.value || null;
      renderDashboard();
    });

    document.getElementById('btn-analytics-refresh').addEventListener('click', () => {
      showToast('Recalculando analítica y explosión de APUs...', 'info');
      renderDashboard();
    });

    document.getElementById('btn-analytics-excel').addEventListener('click', () => {
      exportAnalyticsToExcel(data);
    });

    document.getElementById('btn-analytics-pdf').addEventListener('click', () => {
      window.print();
    });

    document.getElementById('btn-goto-insumos-catalog').addEventListener('click', () => {
      switchTab('insumos');
    });

    document.getElementById('btn-create-project-from-dashboard').addEventListener('click', () => {
      switchTab('projects');
    });

    if (isProjectScope) {
      const btnToEditor = document.getElementById('btn-scope-to-editor');
      if (btnToEditor) {
        btnToEditor.addEventListener('click', () => {
          switchTab('budget_editor', { activeProjectId: state.analyticsFilters.projectId });
        });
      }
      const btnReset = document.getElementById('btn-scope-reset');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          state.analyticsFilters.projectId = null;
          renderDashboard();
        });
      }
    }

    // Global helper methods for inline buttons
    window.exploreInsumo = (insumoCode) => {
      switchTab('insumos', { filterSearch: insumoCode });
    };

    window.openProjectEditor = (projectId) => {
      switchTab('budget_editor', { activeProjectId: projectId });
    };

    window.openProjectVisualReport = async (projectId) => {
      await showProjectVisualReportModal(projectId);
    };

  } catch (err) {
    console.error('Error rendering PresuCosto analytics dashboard:', err);
    viewport.innerHTML = `
      <div class="panel-card" style="padding: 40px; text-align: center; color: var(--rose-600);">
        <h3>Error al cargar el Dashboard de Analytics</h3>
        <p style="margin-top: 8px; color: var(--text-muted);">${err.message}</p>
        <button class="btn btn-secondary" style="margin-top: 16px;" onclick="renderDashboard()">Reintentar</button>
      </div>
    `;
  }
}

// -------------------------------------------------------------
// CHARTS RENDER ENGINE: Chart.js with Resilient SVG Fallbacks
// -------------------------------------------------------------
function renderDashboardCharts(data) {
  const hasChartJs = typeof window.Chart !== 'undefined';

  // 1. Donut Chart: Distribución de Costos Directos
  const donutCanvas = document.getElementById('chart-donut-directos');
  if (donutCanvas) {
    if (hasChartJs) {
      activeDashboardCharts.donut = new window.Chart(donutCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Materiales', 'Mano de Obra', 'Herramientas y Eq', 'Transporte y Básicos'],
          datasets: [{
            data: [
              data.costos_desglose.materiales,
              data.costos_desglose.mano_obra,
              data.costos_desglose.herramientas,
              data.costos_desglose.transporte
            ],
            backgroundColor: ['#059669', '#2563eb', '#d97706', '#7c3aed'],
            hoverOffset: 6,
            borderWidth: 2,
            borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#131c31' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.raw || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return ` ${context.label}: ${formatCOP(val)} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    } else {
      // SVG Fallback for Donut
      renderSvgDonut(donutCanvas.parentElement, [
        { label: 'Materiales', val: data.costos_desglose.materiales, color: '#059669' },
        { label: 'Mano de Obra', val: data.costos_desglose.mano_obra, color: '#2563eb' },
        { label: 'Herramientas', val: data.costos_desglose.herramientas, color: '#d97706' },
        { label: 'Transporte', val: data.costos_desglose.transporte, color: '#7c3aed' }
      ], formatCOP(data.costo_directo_total));
    }
  }

  // 2. Bar Chart: Costo Directo vs Indirecto AIU
  const barAiuCanvas = document.getElementById('chart-bar-aiu');
  if (barAiuCanvas) {
    if (hasChartJs) {
      activeDashboardCharts.barAiu = new window.Chart(barAiuCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['Costo Directo', 'Administración (15%)', 'Imprevistos (5%)', 'Utilidad (5%)'],
          datasets: [{
            label: 'Valor COP',
            data: [
              data.costo_directo_total,
              data.aiu_desglose.administracion,
              data.aiu_desglose.imprevistos,
              data.aiu_desglose.utilidad
            ],
            backgroundColor: ['#1b365d', '#3b82f6', '#f59e0b', '#10b981'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => ` ${formatCOP(c.raw)}`
              }
            }
          },
          scales: {
            y: {
              ticks: {
                callback: (v) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v.toLocaleString())
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: { grid: { display: false } }
          }
        }
      });
    }
  }

  // 3. Line/Area Chart: Evolución Temporal de Costos
  const timelineCanvas = document.getElementById('chart-timeline-costos');
  if (timelineCanvas) {
    if (hasChartJs) {
      activeDashboardCharts.timeline = new window.Chart(timelineCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: data.evolucion_mensual.map(m => m.mes),
          datasets: [
            {
              label: 'Desembolso Mensual',
              data: data.evolucion_mensual.map(m => m.valor_total),
              borderColor: '#059669',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              fill: true,
              tension: 0.35,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: '#059669'
            },
            {
              label: 'Costo Directo Mensual',
              data: data.evolucion_mensual.map(m => m.costo_directo),
              borderColor: '#1b365d',
              borderDash: [5, 5],
              tension: 0.35,
              borderWidth: 2,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', align: 'end', labels: { boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (c) => ` ${c.dataset.label}: ${formatCOP(c.raw)}`
              }
            }
          },
          scales: {
            y: {
              ticks: {
                callback: (v) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v.toLocaleString())
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: { grid: { display: false } }
          }
        }
      });
    }
  }

  // 4. Horizontal Bar Chart: Capítulos de Obra
  const capitulosCanvas = document.getElementById('chart-bar-capitulos');
  if (capitulosCanvas) {
    const topCaps = data.capitulos_inversion.slice(0, 6);
    if (hasChartJs) {
      activeDashboardCharts.capitulos = new window.Chart(capitulosCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: topCaps.map(c => c.descripcion.length > 25 ? c.descripcion.substring(0, 25) + '...' : c.descripcion),
          datasets: [{
            label: 'Inversión',
            data: topCaps.map(c => c.subtotal),
            backgroundColor: '#335d9c',
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => ` ${formatCOP(c.raw)} (${topCaps[c.dataIndex] ? topCaps[c.dataIndex].porcentaje : 0}%)`
              }
            }
          },
          scales: {
            x: {
              ticks: {
                callback: (v) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v.toLocaleString())
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            y: { grid: { display: false } }
          }
        }
      });
    }
  }
}

// Fallback SVG Donut Renderer for Offline Environments
function renderSvgDonut(container, items, centerText) {
  const total = items.reduce((a, b) => a + b.val, 0) || 1;
  let accumulatedAngle = 0;
  const radius = 80;
  const cx = 100;
  const cy = 100;
  const strokeWidth = 28;

  const svgPaths = items.map(item => {
    const fraction = item.val / total;
    if (fraction <= 0) return '';
    const angle = fraction * 360;
    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + angle;
    accumulatedAngle += angle;

    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;
    const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

    return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="${strokeWidth}" />`;
  }).join('');

  container.innerHTML = `
    <div class="svg-donut-wrap">
      <svg viewBox="0 0 200 200" style="width: 220px; height: 220px;">
        ${svgPaths}
        <text x="100" y="98" class="svg-donut-center-text" font-size="14">${centerText}</text>
        <text x="100" y="118" class="svg-donut-sub-text">Costo Directo</text>
      </svg>
    </div>
  `;
}

// -------------------------------------------------------------
// EXCEL EXPORT (PresuCosto Multi-Sheet Workbook via SheetJS)
// -------------------------------------------------------------
function exportAnalyticsToExcel(data) {
  if (typeof XLSX === 'undefined') {
    showToast('Biblioteca SheetJS no disponible para exportar Excel.', 'error');
    return;
  }

  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumen KPIs
    const kpiRows = [
      ['SISTEMA DE PRESUPUESTOS DE OBRA PÚBLICA — CALDAS 2026'],
      ['TABLERO DE ANALYTICS & RESUMEN EJECUTIVO (PRESUCOSTO COMPLIANT)'],
      ['Fecha de Emisión:', new Date().toLocaleString('es-CO')],
      [],
      ['MÉTRICA / INDICADOR', 'VALOR', 'DETALLE / FÓRMULA'],
      ['Presupuesto Total de Obra', data.presupuesto_total, 'Costo Directo + AIU Oficial (25.00%)'],
      ['Costo Directo Total', data.costo_directo_total, 'Total actividades contractuales'],
      ['  - Materiales e Insumos', data.costos_desglose.materiales, `${data.costos_desglose.materiales_pct}% del costo directo`],
      ['  - Mano de Obra y Cuadrillas', data.costos_desglose.mano_obra, `${data.costos_desglose.mano_obra_pct}% del costo directo`],
      ['  - Herramientas y Equipos', data.costos_desglose.herramientas, `${data.costos_desglose.herramientas_pct}% del costo directo`],
      ['  - Transportes y Básicos', data.costos_desglose.transporte, `${data.costos_desglose.transporte_pct}% del costo directo`],
      ['Costos Indirectos (AIU 25%)', data.costo_indirecto_total, 'Administración (15%) + Imprevistos (5%) + Utilidad (5%)'],
      ['  - Administración (15%)', data.aiu_desglose.administracion, 'Gastos de personal directivo, campamento, SST'],
      ['  - Imprevistos (5%)', data.aiu_desglose.imprevistos, 'Contingencias contractuales'],
      ['  - Utilidad (5%)', data.aiu_desglose.utilidad, 'Rentabilidad antes de impuestos'],
      ['Tiempo de Labor Estimado (Horas-Hombre)', data.tiempo_labor.horas_total, 'Suma ponderada de rendimientos de cuadrilla'],
      ['Tiempo de Labor en Días (8h)', data.tiempo_labor.dias_estimados, 'Jornadas ordinarias de 8 horas'],
      ['Tiempo de Labor en Semanas (40h)', data.tiempo_labor.semanas_estimadas, 'Semanas de trabajo continuo'],
      ['Obras en Gestión', data.total_proyectos, 'Proyectos analizados en el periodo'],
      ['Sedes Educativas Beneficiadas', data.total_sedes_beneficiadas, 'Infraestructura educativa intervenida']
    ];
    const wsKpis = XLSX.utils.aoa_to_sheet(kpiRows);
    XLSX.utils.book_append_sheet(wb, wsKpis, 'Resumen_KPIs');

    // Sheet 2: Top 10 Insumos Más Utilizados
    const insRows = [
      ['RANKING', 'CÓDIGO', 'DESCRIPCIÓN DEL INSUMO', 'TIPO RECURSO', 'UNIDAD', 'CANTIDAD ACUMULADA', 'PRECIO UNITARIO (COP)', 'GASTO TOTAL (COP)', 'INCIDENCIA (%)']
    ];
    data.top_insumos.forEach(item => {
      insRows.push([
        item.ranking,
        item.codigo,
        item.descripcion,
        item.tipo,
        item.unidad,
        item.cantidad,
        item.precio_unitario,
        item.costo_total,
        item.porcentaje_incidencia
      ]);
    });
    const wsIns = XLSX.utils.aoa_to_sheet(insRows);
    XLSX.utils.book_append_sheet(wb, wsIns, 'Top_10_Insumos');

    // Sheet 3: Cartera de Proyectos y Rentabilidad
    const proyRows = [
      ['CÓDIGO', 'PROYECTO DE OBRA', 'MUNICIPIO', 'SEDE', 'TIPO INTERVENCIÓN', 'COSTO DIRECTO (COP)', 'AIU 25% (COP)', 'PRESUPUESTO TOTAL (COP)', 'UTILIDAD 5% (COP)', 'HORAS LABOR (HH)', 'DÍAS LABOR', 'ESTADO']
    ];
    data.proyectos_analytics.forEach(p => {
      proyRows.push([
        p.codigo,
        p.nombre,
        p.municipio,
        p.sede,
        p.tipo_intervencion,
        p.costo_directo,
        p.costo_indirecto,
        p.valor_total,
        p.utilidad_estimada,
        p.horas_labor,
        p.dias_labor,
        p.estado
      ]);
    });
    const wsProy = XLSX.utils.aoa_to_sheet(proyRows);
    XLSX.utils.book_append_sheet(wb, wsProy, 'Cartera_Proyectos');

    const fileName = `PresuCosto_Analytics_Caldas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Archivo ${fileName} generado y descargado exitosamente.`, 'success');
  } catch (err) {
    console.error('Error exporting Excel:', err);
    showToast('Error generando archivo Excel: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// VISUAL REPORT MODAL (PRESUCOSTO "VER REPORTE")
// -------------------------------------------------------------
async function showProjectVisualReportModal(projectId) {
  try {
    const projDetail = await api.getProjectDetail(projectId);
    const data = await api.getProjectVisualReport(projectId);

    const b = projDetail.presupuestos && projDetail.presupuestos[0] ? projDetail.presupuestos[0] : {};
    const sede = projDetail.sedes && projDetail.sedes[0] ? projDetail.sedes[0] : {};

    const modalHtml = `
      <div style="max-height: 75vh; overflow-y: auto; padding: 4px;">
        <!-- Hero Header -->
        <div class="visual-report-hero">
          <span class="badge badge-success" style="margin-bottom: 6px;">Presupuesto v${b.version || 1} — Vigencia ${b.vigencia || 2026}</span>
          <h2>${projDetail.nombre}</h2>
          <div class="visual-report-hero-meta">
            <span>🏛️ <strong>${sede.institucion || 'Institución Educativa'}</strong></span>
            <span>📍 Municipio: <strong>${sede.municipio || 'Caldas'}</strong></span>
            <span>🏫 Sede: <strong>${sede.nombre || 'Principal'}</strong></span>
            <span>🔒 Estado: <strong>${b.estado || projDetail.estado}</strong></span>
          </div>
        </div>

        <!-- 4 Key PresuCosto Metrics -->
        <div class="visual-report-kpis-strip">
          <div class="visual-report-kpi-card">
            <div class="vr-title">Costo Directo</div>
            <div class="vr-value">${formatCOP(data.costo_directo_total)}</div>
            <div class="vr-sub">${b.capitulos ? b.capitulos.length : 0} Capítulos de obra</div>
          </div>
          <div class="visual-report-kpi-card">
            <div class="vr-title">Costos Indirectos (AIU)</div>
            <div class="vr-value">${formatCOP(data.costo_indirecto_total)}</div>
            <div class="vr-sub">AIU Oficial ${( (b.porcentaje_aiu || 0.25) * 100 ).toFixed(0)}%</div>
          </div>
          <div class="visual-report-kpi-card">
            <div class="vr-title">Valor Total Presupuesto</div>
            <div class="vr-value" style="color: var(--primary-700);">${formatCOP(data.presupuesto_total)}</div>
            <div class="vr-sub">Moneda: COP oficial</div>
          </div>
          <div class="visual-report-kpi-card">
            <div class="vr-title">Tiempo Estimado de Labor</div>
            <div class="vr-value">${data.tiempo_labor.horas_total} HH</div>
            <div class="vr-sub">${data.tiempo_labor.dias_estimados} Días (~${data.tiempo_labor.semanas_estimadas} Semanas)</div>
          </div>
        </div>

        <!-- Charts Grid for this Project -->
        <div class="charts-grid-2col" style="margin-bottom: 20px;">
          <!-- Project Donut -->
          <div class="chart-card">
            <div class="chart-card-header">
              <div class="chart-card-title">
                <h3>🍩 Distribución de Costos Directos</h3>
              </div>
            </div>
            <div class="chart-card-body">
              <div class="chart-canvas-container" style="height: 220px;">
                <canvas id="modal-chart-donut"></canvas>
              </div>
              <div class="chart-legend-wrap" style="grid-template-columns: repeat(2, 1fr);">
                <div class="chart-legend-badge">
                  <span class="chart-color-dot" style="background: #059669;"></span>
                  <div class="chart-legend-badge-text">
                    <strong>Materiales (${data.costos_desglose.materiales_pct}%)</strong>
                    <span>${formatCOP(data.costos_desglose.materiales)}</span>
                  </div>
                </div>
                <div class="chart-legend-badge">
                  <span class="chart-color-dot" style="background: #2563eb;"></span>
                  <div class="chart-legend-badge-text">
                    <strong>Mano de Obra (${data.costos_desglose.mano_obra_pct}%)</strong>
                    <span>${formatCOP(data.costos_desglose.mano_obra)}</span>
                  </div>
                </div>
                <div class="chart-legend-badge">
                  <span class="chart-color-dot" style="background: #d97706;"></span>
                  <div class="chart-legend-badge-text">
                    <strong>Equipos (${data.costos_desglose.herramientas_pct}%)</strong>
                    <span>${formatCOP(data.costos_desglose.herramientas)}</span>
                  </div>
                </div>
                <div class="chart-legend-badge">
                  <span class="chart-color-dot" style="background: #7c3aed;"></span>
                  <div class="chart-legend-badge-text">
                    <strong>Transporte (${data.costos_desglose.transporte_pct}%)</strong>
                    <span>${formatCOP(data.costos_desglose.transporte)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Project Chapters -->
          <div class="chart-card">
            <div class="chart-card-header">
              <div class="chart-card-title">
                <h3>📑 Inversión por Capítulos</h3>
              </div>
            </div>
            <div class="chart-card-body">
              <div class="chart-canvas-container" style="height: 220px;">
                <canvas id="modal-chart-capitulos"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- Top 5 Insumos of Project -->
        <div class="panel-card" style="margin-bottom: 0;">
          <div class="panel-header">
            <div class="panel-header-title">
              <h2>Top 5 Insumos Críticos de esta Obra</h2>
            </div>
          </div>
          <div class="panel-body">
            <div class="data-table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Insumo</th>
                    <th style="text-align: center;">Tipo</th>
                    <th style="text-align: right;">Cantidad</th>
                    <th style="text-align: right;">Precio Ref.</th>
                    <th style="text-align: right;">Subtotal</th>
                    <th style="text-align: right;">Incidencia</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.top_insumos.slice(0, 5).map(ins => `
                    <tr>
                      <td style="font-weight: 700;">#${ins.ranking}</td>
                      <td style="font-weight: 600;">${ins.descripcion}</td>
                      <td style="text-align: center;"><span class="badge badge-neutral">${ins.tipo}</span></td>
                      <td style="text-align: right;">${ins.cantidad} ${ins.unidad}</td>
                      <td style="text-align: right;">${formatCOP(ins.precio_unitario)}</td>
                      <td style="text-align: right; font-weight: 700;">${formatCOP(ins.costo_total)}</td>
                      <td style="text-align: right; font-weight: 600; color: var(--emerald-600);">${ins.porcentaje_incidencia}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    openModal(`Reporte Visual de Presupuesto — ${projDetail.codigo}`, modalHtml, () => {
      closeModal();
      switchTab('budget_editor', { activeBudgetId: b.id, activeProjectId: projectId });
    }, 'Abrir en Editor');

    // Render Modal Charts
    setTimeout(() => {
      const modalDonut = document.getElementById('modal-chart-donut');
      if (modalDonut && typeof window.Chart !== 'undefined') {
        new window.Chart(modalDonut.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['Materiales', 'Mano de Obra', 'Equipos', 'Transporte'],
            datasets: [{
              data: [
                data.costos_desglose.materiales,
                data.costos_desglose.mano_obra,
                data.costos_desglose.herramientas,
                data.costos_desglose.transporte
              ],
              backgroundColor: ['#059669', '#2563eb', '#d97706', '#7c3aed'],
              cutout: '65%'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (c) => ` ${c.label}: ${formatCOP(c.raw)}`
                }
              }
            }
          }
        });
      }

      const modalCaps = document.getElementById('modal-chart-capitulos');
      if (modalCaps && typeof window.Chart !== 'undefined') {
        const topC = data.capitulos_inversion.slice(0, 5);
        new window.Chart(modalCaps.getContext('2d'), {
          type: 'bar',
          data: {
            labels: topC.map(c => c.descripcion.length > 20 ? c.descripcion.substring(0, 20) + '...' : c.descripcion),
            datasets: [{
              data: topC.map(c => c.subtotal),
              backgroundColor: '#335d9c',
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (c) => ` ${formatCOP(c.raw)}`
                }
              }
            },
            scales: {
              x: {
                ticks: { callback: (v) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v) },
                grid: { color: 'rgba(0,0,0,0.05)' }
              },
              y: { grid: { display: false } }
            }
          }
        });
      }
    }, 100);

  } catch (e) {
    showToast('Error abriendo reporte visual: ' + e.message, 'error');
  }
}


// -------------------------------------------------------------
// MODULE 2: TERRITORIO (Departamentos, Subregiones, Municipios, I.E., Sedes)
// -------------------------------------------------------------
async function renderTerritory() {
  try {
    const subregiones = await api.getSubregiones();
    const filterSub = state.filterSubregionId || '';

    viewport.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Estructura Territorial y Educativa de Caldas</h2>
            <p>Filtro en cascada: Subregión → Municipio → Institución Educativa → Sede</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="filter-bar">
            <div class="form-group" style="min-width: 220px; margin-bottom: 0;">
              <label class="form-label">Subregión:</label>
              <select class="form-select" id="territory-subregion-select">
                <option value="">Todas las Subregiones (6)</option>
                ${subregiones.map(s => `<option value="${s.id}" ${s.id == filterSub ? 'selected' : ''}>${s.nombre} (${s.codigo})</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="min-width: 220px; margin-bottom: 0;">
              <label class="form-label">Municipio:</label>
              <select class="form-select" id="territory-municipio-select">
                <option value="">Todos los Municipios</option>
              </select>
            </div>

            <div class="form-group" style="min-width: 220px; margin-bottom: 0;">
              <label class="form-label">Institución Educativa:</label>
              <select class="form-select" id="territory-ie-select">
                <option value="">Todas las Instituciones</option>
              </select>
            </div>
          </div>

          <div style="margin-top: 24px;" id="sedes-list-container">
            <div style="text-align: center; padding: 30px; color: var(--text-muted);">Cargando sedes educativas...</div>
          </div>
        </div>
      </div>
    `;

    const subSelect = document.getElementById('territory-subregion-select');
    const muniSelect = document.getElementById('territory-municipio-select');
    const ieSelect = document.getElementById('territory-ie-select');

    async function loadMunicipios() {
      const subId = subSelect.value;
      const municipios = await api.getMunicipios(subId || null);
      muniSelect.innerHTML = '<option value="">Todos los Municipios</option>' + 
        municipios.map(m => `<option value="${m.id}">${m.nombre} (${m.codigo_dane})</option>`).join('');
      loadInstituciones();
    }

    async function loadInstituciones() {
      const mId = muniSelect.value;
      const ies = await api.getInstituciones(mId || null);
      ieSelect.innerHTML = '<option value="">Todas las Instituciones</option>' +
        ies.map(ie => `<option value="${ie.id}">${ie.nombre}</option>`).join('');
      loadSedes();
    }

    async function loadSedes() {
      const container = document.getElementById('sedes-list-container');
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Buscando sedes...</div>';
      
      const sedes = await api.getSedes(ieSelect.value || null, muniSelect.value || null);
      
      if (!sedes || sedes.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">No se encontraron sedes para los filtros seleccionados.</div>';
        return;
      }

      container.innerHTML = `
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Código DANE Sede</th>
                <th>Nombre de la Sede</th>
                <th>Zona</th>
                <th>Dirección / Vereda</th>
                <th>Estado</th>
                <th style="text-align: center;">Acción</th>
              </tr>
            </thead>
            <tbody>
              ${sedes.map(s => `
                <tr>
                  <td style="font-family: monospace; font-weight: 600;">${s.codigo_dane}</td>
                  <td style="font-weight: 600; color: var(--primary-700);">${s.nombre}</td>
                  <td><span class="badge ${s.zona === 'Rural' ? 'badge-warning' : 'badge-neutral'}">${s.zona}</span></td>
                  <td>${s.direccion_vereda || 'No informada'}</td>
                  <td><span class="badge badge-success">${s.estado}</span></td>
                  <td style="text-align: center;">
                    <button class="btn btn-secondary btn-sm" onclick="window.formulateForSede(${s.id}, '${s.nombre.replace(/'/g, "\\'")}')">Presupuestar Obra</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    subSelect.addEventListener('change', loadMunicipios);
    muniSelect.addEventListener('change', loadInstituciones);
    ieSelect.addEventListener('change', loadSedes);

    // Initial load
    await loadMunicipios();

    window.formulateForSede = (sedeId, sedeNombre) => {
      switchTab('projects', { selectedSedeId: sedeId, selectedSedeNombre: sedeNombre });
    };

  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando territorio: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// MODULE 3: PROYECTOS
// -------------------------------------------------------------
async function renderProjects() {
  try {
    const projects = await api.getProjects();

    viewport.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Proyectos de Infraestructura Educativa</h2>
            <p>Formulación, asociación multi-sede y control presupuestal</p>
          </div>
          <div class="panel-actions">
            ${['Formulador', 'Administrador'].includes(state.currentRole) ? 
              `<button class="btn btn-primary" id="btn-create-project">➕ Nuevo Proyecto</button>` : ''}
          </div>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre del Proyecto</th>
                  <th>Intervención</th>
                  <th style="text-align: center;">Sedes</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                  <th style="text-align: center;">Presupuesto</th>
                </tr>
              </thead>
              <tbody>
                ${projects.map(p => {
                  let badgeClass = 'badge-neutral';
                  if (p.estado === 'Aprobado') badgeClass = 'badge-success';
                  if (p.estado === 'En Revisión') badgeClass = 'badge-warning';

                  return `
                    <tr>
                      <td style="font-family: monospace; font-weight: 700;">${p.codigo}</td>
                      <td>
                        <div style="font-weight: 600; color: var(--text-main);">${p.nombre}</div>
                        <div style="font-size: 12px; color: var(--text-muted);">${p.fuente_financiacion || 'Sin fuente definida'}</div>
                      </td>
                      <td><span class="badge badge-neutral">${p.tipo_intervencion}</span></td>
                      <td style="text-align: center;"><span class="badge badge-neutral">${p.sedes_count} sede(s)</span></td>
                      <td style="font-size: 13px;">${p.responsable || 'No asignado'}</td>
                      <td><span class="badge ${badgeClass}">${p.estado}</span></td>
                      <td style="text-align: center;">
                        <button class="btn btn-emerald btn-sm" onclick="window.openProjectBudgets(${p.id})">Ver Presupuesto</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const createBtn = document.getElementById('btn-create-project');
    if (createBtn) {
      createBtn.addEventListener('click', showCreateProjectModal);
    }

    window.openProjectBudgets = async (projectId) => {
      const pDetail = await api.getProjectDetail(projectId);
      if (pDetail.presupuestos && pDetail.presupuestos.length > 0) {
        state.activeBudgetId = pDetail.presupuestos[0].id;
        state.activeProjectId = projectId;
        switchTab('budget_editor');
      } else {
        showToast('El proyecto no tiene presupuestos creados.', 'error');
      }
    };

  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando proyectos: ${err.message}</div>`;
  }
}

async function showCreateProjectModal() {
  const sedes = await api.getSedes();
  const nextCode = `CALDAS-EDU-2026-00${Math.floor(Math.random() * 900 + 100)}`;

  const bodyHtml = `
    <form id="create-project-form">
      <div class="form-group">
        <label class="form-label">Código del Proyecto (Único):</label>
        <input type="text" class="form-input" id="p-code" value="${nextCode}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Nombre del Proyecto / Obra:</label>
        <input type="text" class="form-input" id="p-name" placeholder="Ej: Construcción de Cubierta y Baterías Sanitarias" required>
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de Intervención:</label>
        <select class="form-select" id="p-type">
          <option value="Construcción">Construcción</option>
          <option value="Adecuación">Adecuación</option>
          <option value="Mejoramiento">Mejoramiento</option>
          <option value="Mantenimiento">Mantenimiento</option>
          <option value="Restauración">Restauración</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Sede Educativa Beneficiaria:</label>
        <select class="form-select" id="p-sede">
          ${sedes.map(s => `<option value="${s.id}">${s.nombre} (${s.municipio_id})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fuente de Financiación:</label>
        <select class="form-select" id="p-funding">
          <option value="Sistema General de Regalías (SGR)">Sistema General de Regalías (SGR)</option>
          <option value="Sistema General de Participaciones (SGP)">Sistema General de Participaciones (SGP)</option>
          <option value="Recursos Propios Departamento de Caldas">Recursos Propios Departamento de Caldas</option>
          <option value="Ministerio de Educación Nacional (MEN)">Ministerio de Educación Nacional (MEN)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Objeto Contractual:</label>
        <textarea class="form-textarea" id="p-object" rows="3" placeholder="Descripción detallada del alcance de la obra..."></textarea>
      </div>
    </form>
  `;

  openModal('Registrar Nuevo Proyecto de Infraestructura', bodyHtml, async () => {
    const code = document.getElementById('p-code').value.trim();
    const name = document.getElementById('p-name').value.trim();
    const type = document.getElementById('p-type').value;
    const sedeId = parseInt(document.getElementById('p-sede').value);
    const funding = document.getElementById('p-funding').value;
    const object = document.getElementById('p-object').value.trim();

    if (!code || !name) {
      showToast('Código y Nombre son requeridos.', 'error');
      return;
    }

    try {
      const res = await api.createProject({
        codigo: code,
        nombre: name,
        tipo_intervencion: type,
        objeto: object,
        responsable: state.currentRole === 'Formulador' ? 'Arq. Marcela Cárdenas' : 'Funcionario Caldas',
        fuente_financiacion: funding,
        sedes: [{ sede_id: sedeId, alcance_sede: 'Intervención principal' }]
      });

      closeModal();
      showToast('Proyecto y versión 1 creados exitosamente.', 'success');
      renderProjects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, 'Crear Proyecto');
}

// -------------------------------------------------------------
// MODULE 4: EDITOR DE PRESUPUESTO EN LÍNEA
// -------------------------------------------------------------
async function renderBudgetEditor() {
  try {
    const budgetId = state.activeBudgetId || 1;
    const budget = await api.getBudgetDetail(budgetId);
    const projects = await api.getProjects();

    const isApproved = budget.estado === 'Aprobado';
    const canEdit = !isApproved && ['Formulador', 'Administrador'].includes(state.currentRole);
    const canApprove = !isApproved && ['Aprobador', 'Administrador'].includes(state.currentRole);

    let badgeClass = 'badge-neutral';
    if (budget.estado === 'Aprobado') badgeClass = 'badge-success';
    if (budget.estado === 'En Revisión') badgeClass = 'badge-warning';

    viewport.innerHTML = `
      <!-- Budget Header Information Card -->
      <div class="panel-card" style="border-left: 5px solid ${isApproved ? 'var(--emerald-500)' : 'var(--primary-700)'};">
        <div class="panel-header">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
              <span class="badge ${badgeClass}">${budget.estado.toUpperCase()} ${isApproved ? '🔒 CONGELADO' : ''}</span>
              <span class="badge badge-neutral">Vigencia ${budget.vigencia}</span>
              <span class="badge badge-neutral">Versión v${budget.version}</span>
            </div>
            <h2 style="font-family: var(--font-heading); font-size: 19px; color: var(--text-main);">${budget.proyecto_nombre}</h2>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 3px;">Código: <strong>${budget.proyecto_codigo}</strong></div>
          </div>

          <div class="panel-actions">
            <!-- Project / Budget Selector -->
            <select class="form-select" id="editor-budget-select" style="min-width: 200px;">
              ${projects.map(p => `
                <option value="${p.id}" ${p.id == budget.proyecto_id ? 'selected' : ''}>${p.codigo} - ${p.nombre.substring(0, 30)}...</option>
              `).join('')}
            </select>

            <button class="btn btn-secondary btn-sm" id="btn-export-excel" title="Descargar Presupuesto Oficial XLSX">📥 Excel</button>
            <button class="btn btn-secondary btn-sm" id="btn-export-pdf" title="Descargar Resumen Ejecutivo PDF">📄 PDF</button>
            
            ${canEdit ? `<button class="btn btn-secondary btn-sm" id="btn-clone-version" title="Clonar a nueva versión de escenario">📑 Nueva Versión</button>` : ''}
            ${canApprove ? `<button class="btn btn-emerald btn-sm" id="btn-approve-freeze">🔒 Aprobar y Congelar</button>` : ''}
          </div>
        </div>

        <div class="panel-body" style="padding-top: 16px; padding-bottom: 16px; background: var(--bg-subtle);">
          <div style="display: flex; gap: 32px; flex-wrap: wrap;">
            <div>
              <div style="font-size: 11.5px; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Costo Directo</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--text-main);">${formatCOP(budget.costo_directo)}</div>
            </div>
            <div>
              <div style="font-size: 11.5px; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Indirectos (AIU ${(budget.porcentaje_aiu * 100).toFixed(1)}%)</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--text-main);">${formatCOP(budget.costo_indirecto)}</div>
            </div>
            <div>
              <div style="font-size: 11.5px; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">VALOR TOTAL PRESUPUESTO</div>
              <div style="font-size: 22px; font-weight: 800; color: var(--emerald-600);">${formatCOP(budget.valor_total)}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Bar -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div style="font-size: 14px; font-weight: 600;">Estructura de Capítulos y Partidas de Obra</div>
        ${canEdit ? `<button class="btn btn-primary btn-sm" id="btn-add-item">➕ Agregar Partida de Obra</button>` : ''}
      </div>

      <!-- Items Table Grouped by Chapter -->
      <div class="panel-card">
        <div class="data-table-container">
          <table class="data-table" id="budget-items-table">
            <thead>
              <tr>
                <th style="width: 70px;">Ítem</th>
                <th style="width: 100px;">Código</th>
                <th>Descripción de la Actividad</th>
                <th style="width: 70px; text-align: center;">Unidad</th>
                <th style="width: 130px; text-align: right;">Cantidad</th>
                <th style="width: 150px; text-align: right;">Precio Unitario</th>
                <th style="width: 160px; text-align: right;">Subtotal</th>
                ${canEdit ? '<th style="width: 80px; text-align: center;">Acción</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${budget.capitulos.map(cap => `
                <tr class="chapter-row">
                  <td colspan="${canEdit ? '8' : '7'}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span>CAPÍTULO ${cap.codigo}: ${cap.descripcion}</span>
                      <span style="font-size: 13px; font-weight: 700;">Subtotal: ${formatCOP(cap.subtotal_capitulo)}</span>
                    </div>
                  </td>
                </tr>
                ${cap.items.map(it => `
                  <tr data-item-id="${it.id}">
                    <td style="font-weight: 600; text-align: center;">${it.item_num}</td>
                    <td style="font-family: monospace; font-weight: 600;">${it.actividad_codigo}</td>
                    <td>
                      <div style="font-weight: 500;">${it.actividad_desc}</div>
                      ${it.observaciones ? `<div style="font-size: 11.5px; color: var(--text-muted);">${it.observaciones}</div>` : ''}
                    </td>
                    <td style="text-align: center;"><span class="badge badge-neutral">${it.unidad || 'UND'}</span></td>
                    <td style="text-align: right;">
                      ${canEdit ? `
                        <input type="number" step="0.01" class="form-input item-cant-input" style="text-align: right; width: 110px; padding: 4px 8px; font-weight: 600;" value="${it.cantidad}" data-item-id="${it.id}">
                      ` : `<strong>${it.cantidad.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</strong>`}
                    </td>
                    <td style="text-align: right;">
                      ${canEdit ? `
                        <input type="number" step="0.01" class="form-input item-price-input" style="text-align: right; width: 130px; padding: 4px 8px; font-weight: 600;" value="${it.precio_unitario}" data-item-id="${it.id}">
                      ` : `<span>${formatCOP(it.precio_unitario)}</span>`}
                    </td>
                    <td style="text-align: right; font-weight: 700; color: var(--primary-700);">
                      ${formatCOP(it.subtotal)}
                    </td>
                    ${canEdit ? `
                      <td style="text-align: center;">
                        <button class="btn btn-secondary btn-sm" onclick="window.removeItemFromBudget(${it.id})" title="Eliminar ítem" style="color: var(--rose-600); padding: 4px 8px;">🗑️</button>
                      </td>
                    ` : ''}
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Event Listeners
    document.getElementById('editor-budget-select').addEventListener('change', async (e) => {
      const pId = e.target.value;
      const pDetail = await api.getProjectDetail(pId);
      if (pDetail.presupuestos && pDetail.presupuestos.length > 0) {
        state.activeBudgetId = pDetail.presupuestos[0].id;
        state.activeProjectId = pId;
        renderBudgetEditor();
      }
    });

    document.getElementById('btn-export-excel').addEventListener('click', () => {
      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const wsData = [
          ["GOBERNACIÓN DE CALDAS — SECRETARÍA DE EDUCACIÓN"],
          ["PRESUPUESTO OFICIAL DE OBRA PÚBLICA — INFRAESTRUCTURA EDUCATIVA"],
          [""],
          ["Proyecto:", budget.proyecto_nombre, "", "", "Código:", budget.proyecto_codigo],
          ["Versión:", `v${budget.version}`, "", "", "Vigencia:", budget.vigencia],
          ["Estado:", budget.estado.toUpperCase(), "", "", "Moneda:", budget.moneda],
          [""],
          ["ÍTEM", "CÓDIGO", "DESCRIPCIÓN DE LA ACTIVIDAD", "UNIDAD", "CANTIDAD", "VALOR UNITARIO", "VALOR TOTAL"]
        ];

        for (const cap of budget.capitulos) {
          wsData.push([`CAPÍTULO ${cap.codigo}: ${cap.descripcion}`, "", "", "", "", "", cap.subtotal_capitulo]);
          for (const it of cap.items) {
            wsData.push([it.item_num, it.actividad_codigo, it.actividad_desc, it.unidad || 'UND', it.cantidad, it.precio_unitario, it.subtotal]);
          }
        }
        wsData.push([""]);
        wsData.push(["", "", "", "", "", "COSTO DIRECTO TOTAL:", budget.costo_directo]);
        wsData.push(["", "", "", "", "", `COSTOS INDIRECTOS (AIU ${(budget.porcentaje_aiu * 100).toFixed(1)}%):`, budget.costo_indirecto]);
        wsData.push(["", "", "", "", "", "VALOR TOTAL PRESUPUESTO:", budget.valor_total]);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Presupuesto_Detallado");
        XLSX.writeFile(wb, `Presupuesto_Caldas_${budget.proyecto_codigo}_v${budget.version}.xlsx`);
        showToast("Presupuesto Excel exportado exitosamente.", "success");
      } else {
        window.open(`/api/reports/budget/${budget.id}/excel`, '_blank');
      }
    });

    document.getElementById('btn-export-pdf').addEventListener('click', () => {
      window.print();
    });

    if (canEdit) {
      document.getElementById('btn-add-item').addEventListener('click', () => showAddItemModal(budget.id));
      
      const cloneBtn = document.getElementById('btn-clone-version');
      if (cloneBtn) {
        cloneBtn.addEventListener('click', async () => {
          try {
            const res = await api.cloneBudgetVersion(budget.id, 'Formulador', state.currentRole);
            state.activeBudgetId = res.new_budget_id;
            showToast(res.message, 'success');
            renderBudgetEditor();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      // Inline edits
      document.querySelectorAll('.item-cant-input, .item-price-input').forEach(input => {
        input.addEventListener('change', async (e) => {
          const itemId = e.target.dataset.itemId;
          const tr = document.querySelector(`tr[data-item-id="${itemId}"]`);
          const cant = parseFloat(tr.querySelector('.item-cant-input').value);
          const price = parseFloat(tr.querySelector('.item-price-input').value);

          try {
            await api.updateItem(itemId, { cantidad: cant, precio_unitario: price, motivo_cambio: 'Edición en línea de cantidades' }, 'Formulador', state.currentRole);
            showToast('Partida actualizada y presupuesto recalculado.', 'success');
            renderBudgetEditor();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });

      window.removeItemFromBudget = async (itemId) => {
        if (!confirm('¿Confirma que desea eliminar este ítem del presupuesto?')) return;
        try {
          await api.deleteItem(itemId, 'Formulador', state.currentRole);
          showToast('Ítem eliminado.', 'info');
          renderBudgetEditor();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }

    if (canApprove) {
      document.getElementById('btn-approve-freeze').addEventListener('click', () => {
        openModal(
          'Aprobación y Congelación Oficial de Presupuesto',
          `
            <div style="font-size: 14px; line-height: 1.6;">
              <p style="margin-bottom: 12px;">Está a punto de <strong>APROBAR Y CONGELAR</strong> la versión <strong>v${budget.version}</strong> de este presupuesto por un valor total de <strong>${formatCOP(budget.valor_total)}</strong>.</p>
              <div style="background: var(--amber-100); color: #92400e; padding: 12px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 13px;">
                ⚠️ <strong>Aviso de Inmutabilidad Legal:</strong> Al aprobar, se guardará una instantánea íntegra e inmodificable de todos los ítems, APUs, precios unitarios y parámetros AIU. Si los precios del catálogo cambian en el futuro, este presupuesto <strong>NO</strong> sufrirá alteraciones.
              </div>
              <div class="form-group">
                <label class="form-label">Nombre del Funcionario Aprobador:</label>
                <input type="text" class="form-input" id="approve-author" value="Dr. Luis Fernando Patiño (Secretario Aprobador)">
              </div>
            </div>
          `,
          async () => {
            const author = document.getElementById('approve-author').value.trim();
            try {
              const res = await api.approveBudget(budget.id, author, state.currentRole);
              closeModal();
              showToast(res.message, 'success');
              renderBudgetEditor();
            } catch (err) {
              showToast(err.message, 'error');
            }
          },
          'Aprobar y Congelar Inmutablemente'
        );
      });
    }

  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando editor: ${err.message}</div>`;
  }
}

async function showAddItemModal(budgetId) {
  const apusData = await api.listApus({ limit: 100 });
  const subregiones = await api.getSubregiones();

  const bodyHtml = `
    <div class="form-group">
      <label class="form-label">Buscar Actividad de Obra:</label>
      <input type="text" class="form-input" id="modal-search-act" placeholder="Filtrar por código o descripción...">
    </div>
    <div class="form-group">
      <label class="form-label">Seleccione la Actividad del Catálogo:</label>
      <select class="form-select" id="modal-act-select" size="6" style="height: 160px;">
        ${apusData.items.map(a => `
          <option value="${a.actividad_id}" data-price="${a.precio_referencia}">
            [${a.codigo}] ${a.descripcion} (${a.unidad || 'UND'}) — Ref: ${formatCOP(a.precio_referencia)}
          </option>
        `).join('')}
      </select>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
      <div class="form-group">
        <label class="form-label">Cantidad:</label>
        <input type="number" step="0.01" class="form-input" id="modal-act-cant" value="1.00" required>
      </div>
      <div class="form-group">
        <label class="form-label">Precio Unitario Aplicado:</label>
        <input type="number" step="0.01" class="form-input" id="modal-act-price" value="0.00" required>
      </div>
    </div>
  `;

  openModal('Agregar Partida al Presupuesto', bodyHtml, async () => {
    const actId = parseInt(document.getElementById('modal-act-select').value);
    const cant = parseFloat(document.getElementById('modal-act-cant').value);
    const price = parseFloat(document.getElementById('modal-act-price').value);

    if (!actId || isNaN(cant) || cant <= 0) {
      showToast('Seleccione una actividad y especifique una cantidad válida.', 'error');
      return;
    }

    try {
      await api.addItemToBudget(budgetId, {
        capitulo_id: 1, // Preliminares por defecto
        actividad_id: actId,
        cantidad: cant,
        precio_unitario: price
      }, 'Formulador', state.currentRole);

      closeModal();
      showToast('Partida agregada exitosamente.', 'success');
      renderBudgetEditor();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, 'Agregar Partida');

  // Reactivity in modal
  const sel = document.getElementById('modal-act-select');
  const priceInput = document.getElementById('modal-act-price');
  sel.addEventListener('change', () => {
    const opt = sel.options[sel.selectedIndex];
    if (opt) priceInput.value = opt.dataset.price || '0.00';
  });

  const searchInput = document.getElementById('modal-search-act');
  searchInput.addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    if (q.length >= 2 || q.length === 0) {
      const filtered = await api.listApus({ search: q, limit: 100 });
      sel.innerHTML = filtered.items.map(a => `
        <option value="${a.actividad_id}" data-price="${a.precio_referencia}">
          [${a.codigo}] ${a.descripcion} (${a.unidad || 'UND'}) — Ref: ${formatCOP(a.precio_referencia)}
        </option>
      `).join('');
    }
  });
}

// -------------------------------------------------------------
// MODULE 5: ANALISIS DE PRECIOS UNITARIOS (APU)
// -------------------------------------------------------------
async function renderApus() {
  try {
    const apusData = await api.listApus({ limit: 40 });

    viewport.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Catálogo y Análisis de Precios Unitarios (APU)</h2>
            <p>Desglose de recursos: Insumos, Mano de Obra, Equipos y Básicos Anidados</p>
          </div>
          <div class="panel-actions">
            <span class="badge badge-success">3,309 APUs Oficiales Caldas</span>
          </div>
        </div>
        <div class="panel-body">
          <div class="filter-bar">
            <div class="filter-input-wrap">
              <input type="text" class="form-input" id="apu-search-input" placeholder="Buscar por código (ej: AB1, 00101) o descripción...">
            </div>
          </div>

          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 100px;">Código</th>
                  <th>Descripción de la Actividad</th>
                  <th>Categoría</th>
                  <th style="text-align: center;">Unidad</th>
                  <th style="text-align: right;">Costo Directo APU</th>
                  <th style="text-align: center;">Componentes</th>
                  <th style="text-align: center;">Acción</th>
                </tr>
              </thead>
              <tbody id="apu-table-body">
                ${renderApuRows(apusData.items)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('apu-search-input').addEventListener('input', async (e) => {
      const q = e.target.value.trim();
      const res = await api.listApus({ search: q, limit: 40 });
      document.getElementById('apu-table-body').innerHTML = renderApuRows(res.items);
    });

    window.viewApuBreakdown = async (apuId) => {
      const apu = await api.getApuDetail(apuId);
      
      const bodyHtml = `
        <div style="margin-bottom: 16px;">
          <h4 style="font-family: var(--font-heading); font-size: 16px; color: var(--primary-700);">[${apu.codigo}] ${apu.descripcion}</h4>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Unidad: <strong>${apu.unidad || 'UND'}</strong> | Costo Directo Unitario: <strong style="color: var(--emerald-600);">${formatCOP(apu.costo_directo_total)}</strong></div>
        </div>

        <div class="data-table-container">
          <table class="data-table" style="font-size: 12.5px;">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Código</th>
                <th>Descripción Recurso</th>
                <th style="text-align: center;">Und</th>
                <th style="text-align: right;">Rendimiento</th>
                <th style="text-align: right;">Vr. Unitario</th>
                <th style="text-align: right;">Vr. Parcial</th>
              </tr>
            </thead>
            <tbody>
              ${apu.componentes.map(c => `
                <tr>
                  <td><span class="badge badge-neutral">${c.tipo_componente}</span></td>
                  <td style="font-family: monospace; font-weight: 600;">${c.codigo}</td>
                  <td>${c.descripcion}</td>
                  <td style="text-align: center;">${c.unidad || 'UND'}</td>
                  <td style="text-align: right; font-weight: 600;">${c.rendimiento.toFixed(4)}</td>
                  <td style="text-align: right;">${formatCOP(c.precio_aplicado)}</td>
                  <td style="text-align: right; font-weight: 700; color: var(--primary-700);">${formatCOP(c.costo_parcial)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      openModal(`Análisis de Precios Unitarios (APU) — ${apu.codigo}`, bodyHtml, async () => {
        try {
          const res = await api.recalculateApu(apuId);
          showToast(res.message, 'success');
          closeModal();
          renderApus();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }, 'Verificar y Recalcular APU');
    };

  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando APUs: ${err.message}</div>`;
  }
}

function renderApuRows(items) {
  if (!items || items.length === 0) {
    return `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No se encontraron actividades.</td></tr>`;
  }

  return items.map(a => `
    <tr>
      <td style="font-family: monospace; font-weight: 700;">${a.codigo}</td>
      <td style="font-weight: 500;">${a.descripcion}</td>
      <td><span class="badge badge-neutral">${a.categoria}</span></td>
      <td style="text-align: center;"><span class="badge badge-neutral">${a.unidad || 'UND'}</span></td>
      <td style="text-align: right; font-weight: 700; color: var(--primary-700);">${formatCOP(a.apu_costo_directo)}</td>
      <td style="text-align: center;"><span class="badge badge-success">${a.componentes_count} recursos</span></td>
      <td style="text-align: center;">
        <button class="btn btn-secondary btn-sm" onclick="window.viewApuBreakdown(${a.apu_id})">Ver APU</button>
      </td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// MODULE 6: INSUMOS Y PRECIOS
// -------------------------------------------------------------
async function renderInsumos() {
  try {
    const insumosData = await api.listInsumos({ limit: 40 });

    viewport.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Catálogo de Insumos, Equipos y Cuadrillas</h2>
            <p>Precios de referencia vigencias 2025 vs 2026 con trazabilidad de fuentes</p>
          </div>
          <div class="panel-actions">
            <span class="badge badge-success">3,249 Insumos Oficiales Caldas</span>
          </div>
        </div>
        <div class="panel-body">
          <div class="filter-bar">
            <div class="filter-input-wrap">
              <input type="text" class="form-input" id="insumo-search-input" placeholder="Buscar por código (ej: I1, C1) o nombre del material...">
            </div>
            <select class="form-select" id="insumo-tipo-filter" style="width: 200px;">
              <option value="">Todos los Tipos</option>
              <option value="Insumos">Insumos (Materiales)</option>
              <option value="Cuadrilla">Cuadrilla (Mano de Obra)</option>
              <option value="Herramienta">Herramienta Menor</option>
              <option value="Equipo">Equipos y Maquinaria</option>
            </select>
          </div>

          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 80px;">Código</th>
                  <th>Descripción del Insumo / Recurso</th>
                  <th>Tipo</th>
                  <th style="text-align: center;">Und</th>
                  <th style="text-align: right;">Precio 2026</th>
                  <th style="text-align: right;">Precio 2025</th>
                  <th style="text-align: center;">Incremento</th>
                  <th>Fuente</th>
                  ${['Administrador de Costos', 'Administrador'].includes(state.currentRole) ? '<th style="text-align: center;">Acción</th>' : ''}
                </tr>
              </thead>
              <tbody id="insumos-table-body">
                ${renderInsumoRows(insumosData.items)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const searchInput = document.getElementById('insumo-search-input');
    const tipoFilter = document.getElementById('insumo-tipo-filter');

    async function updateInsumosList() {
      const q = searchInput.value.trim();
      const t = tipoFilter.value;
      const res = await api.listInsumos({ search: q, tipo: t, limit: 40 });
      document.getElementById('insumos-table-body').innerHTML = renderInsumoRows(res.items);
    }

    searchInput.addEventListener('input', updateInsumosList);
    tipoFilter.addEventListener('change', updateInsumosList);

    window.editInsumoPrice = async (insumoId, codigo, desc, currentPrice) => {
      const bodyHtml = `
        <div style="font-size: 14px; margin-bottom: 14px;">
          <div>Insumo: <strong>[${codigo}] ${desc}</strong></div>
          <div style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">Precio actual vigente 2026: <strong>${formatCOP(currentPrice)}</strong></div>
        </div>

        <div class="form-group">
          <label class="form-label">Nuevo Precio Unitario (COP):</label>
          <input type="number" step="0.01" class="form-input" id="edit-ins-price" value="${currentPrice}" required>
        </div>

        <div class="form-group">
          <label class="form-label">Fuente / Soporte de Cotización:</label>
          <input type="text" class="form-input" id="edit-ins-source" placeholder="Ej: Ferretería Central Manizales Cotización #4582" required>
        </div>

        <div class="form-group">
          <label class="form-label">Motivo del Ajuste de Precio:</label>
          <textarea class="form-textarea" id="edit-ins-reason" rows="2" placeholder="Explicación para la bitácora de auditoría..."></textarea>
        </div>
      `;

      openModal(`Actualizar Precio de Insumo — ${codigo}`, bodyHtml, async () => {
        const newP = parseFloat(document.getElementById('edit-ins-price').value);
        const source = document.getElementById('edit-ins-source').value.trim();
        const reason = document.getElementById('edit-ins-reason').value.trim();

        if (isNaN(newP) || newP < 0) {
          showToast('Precio inválido.', 'error');
          return;
        }

        try {
          await api.updateInsumoPrice(insumoId, {
            precio_unitario: newP,
            vigencia: 2026,
            fuente: source,
            motivo: reason
          }, 'Administrador de Costos', state.currentRole);

          closeModal();
          showToast(`Precio de ${codigo} actualizado correctamente.`, 'success');
          updateInsumosList();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }, 'Guardar Precio');
    };

  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando insumos: ${err.message}</div>`;
  }
}

function renderInsumoRows(items) {
  if (!items || items.length === 0) {
    return `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">No se encontraron insumos.</td></tr>`;
  }

  const canEdit = ['Administrador de Costos', 'Administrador'].includes(state.currentRole);

  return items.map(ins => {
    let incBadge = '<span class="badge badge-neutral">0%</span>';
    if (ins.precio_2025 > 0 && ins.precio_2026 > 0) {
      const inc = ((ins.precio_2026 - ins.precio_2025) / ins.precio_2025) * 100;
      incBadge = `<span class="badge ${inc > 0 ? 'badge-warning' : 'badge-neutral'}">${inc > 0 ? '+' : ''}${inc.toFixed(1)}%</span>`;
    }

    return `
      <tr>
        <td style="font-family: monospace; font-weight: 700;">${ins.codigo}</td>
        <td style="font-weight: 500;">${ins.descripcion}</td>
        <td><span class="badge badge-neutral">${ins.tipo}</span></td>
        <td style="text-align: center;"><span class="badge badge-neutral">${ins.unidad}</span></td>
        <td style="text-align: right; font-weight: 700; color: var(--emerald-600);">${formatCOP(ins.precio_2026)}</td>
        <td style="text-align: right; color: var(--text-muted);">${formatCOP(ins.precio_2025)}</td>
        <td style="text-align: center;">${incBadge}</td>
        <td style="font-size: 12px; color: var(--text-muted);">${ins.fuente || 'Sin fuente'}</td>
        ${canEdit ? `
          <td style="text-align: center;">
            <button class="btn btn-secondary btn-sm" onclick="window.editInsumoPrice(${ins.id}, '${ins.codigo}', '${ins.descripcion.replace(/'/g, "\\'")}', ${ins.precio_2026})">Editar</button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// MODULE 7: PARÁMETROS, AIU Y PÓLIZAS
// -------------------------------------------------------------
async function renderParameters() {
  try {
    const aiu = await api.getAiuParameters();
    const prest = await api.getPrestacionales();
    const polizas = await api.getPolizas();

    viewport.innerHTML = `
      <!-- AIU Parameters -->
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Estructura de Gastos Generales e Indirectos (AIU)</h2>
            <p>Personal técnico de obra, campamento, gestión ambiental, pólizas e impuestos</p>
          </div>
          <div class="panel-actions">
            <span class="badge badge-neutral">AIU Institucional: 25.0%</span>
          </div>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Capítulo Indirecto</th>
                  <th>Concepto de Gasto</th>
                  <th style="text-align: center;">Unidad</th>
                  <th style="text-align: right;">Cantidad</th>
                  <th style="text-align: right;">Dedicación</th>
                  <th style="text-align: right;">Valor Unitario</th>
                  <th style="text-align: right;">Factor Prestacional</th>
                  <th style="text-align: right;">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${aiu.map(it => `
                  <tr>
                    <td><span class="badge badge-neutral">${it.capitulo_indirecto}</span></td>
                    <td style="font-weight: 600;">${it.concepto}</td>
                    <td style="text-align: center;">${it.unidad}</td>
                    <td style="text-align: right;">${it.cantidad.toFixed(1)}</td>
                    <td style="text-align: right;">${(it.dedicacion * 100).toFixed(0)}%</td>
                    <td style="text-align: right;">${formatCOP(it.valor_unitario)}</td>
                    <td style="text-align: right;">${it.factor_prestacional_aiu > 0 ? `${(it.factor_prestacional_aiu * 100).toFixed(2)}%` : '—'}</td>
                    <td style="text-align: right; font-weight: 700; color: var(--primary-700);">${formatCOP(it.valor_total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Legal Prestational Factors -->
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Factores Prestacionales y Nómina Legal Vigente</h2>
            <p>Porcentajes de prestaciones sociales, seguridad social y parafiscales para Caldas</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Riesgo Laboral</th>
                  <th>Rango Salarial</th>
                  <th style="text-align: right;">Factor / Porcentaje</th>
                  <th>Vigencia</th>
                </tr>
              </thead>
              <tbody>
                ${prest.map(p => `
                  <tr>
                    <td style="font-weight: 600;">${p.concepto}</td>
                    <td><span class="badge badge-neutral">${p.categoria}</span></td>
                    <td>${p.riesgo}</td>
                    <td>${p.rango_salarial}</td>
                    <td style="text-align: right; font-weight: 700; color: var(--emerald-600);">${(p.valor * 100).toFixed(2)}%</td>
                    <td>${p.vigencia}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando parámetros: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// MODULE 8: CENTRO DE IMPORTACIÓN MASIVA
// -------------------------------------------------------------
async function renderBulkImport() {
  try {
    const batches = await api.getImportBatches();

    viewport.innerHTML = `
      <!-- Templates Download Row -->
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Descarga de Plantillas Oficiales</h2>
            <p>Descargue las plantillas Excel normalizadas con encabezados y datos de muestra</p>
          </div>
        </div>
        <div class="panel-body" style="display: flex; gap: 14px; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="window.downloadTemplateClient('cantidades')">
            📥 Plantilla de Cantidades de Obra (.xlsx)
          </button>
          <button class="btn btn-secondary" onclick="window.downloadTemplateClient('precios_insumos')">
            📥 Plantilla de Precios de Insumos (.xlsx)
          </button>
          <button class="btn btn-secondary" onclick="window.downloadTemplateClient('insumos')">
            📥 Plantilla Catálogo de Insumos (.xlsx)
          </button>
        </div>
      </div>

      <!-- Upload and Dry-Run Panel -->
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Carga y Validación de Archivo Masivo</h2>
            <p>Inspección previa transaccional (Dry-Run) con desglose de inconsistencias por fila</p>
          </div>
        </div>
        <div class="panel-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 20px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Tipo de Importación:</label>
              <select class="form-select" id="bulk-type-select">
                <option value="cantidades">Cantidades de Obra (Ítems)</option>
                <option value="precios_insumos">Precios de Insumos</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Modo de Operación:</label>
              <select class="form-select" id="bulk-mode-select">
                <option value="actualizar">Actualizar o Crear (Upsert)</option>
                <option value="validar">Solo Validar (Simulación)</option>
                <option value="sincronizar">Sincronizar Estricto</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Seleccionar Archivo (XLSX / CSV):</label>
              <input type="file" class="form-input" id="bulk-file-input" accept=".xlsx,.csv">
            </div>
          </div>

          <div style="display: flex; gap: 12px;">
            <button class="btn btn-primary" id="btn-bulk-preview">🔍 Validar Archivo (Previsualizar)</button>
            <button class="btn btn-emerald" id="btn-bulk-apply" disabled>💾 Aplicar Transacción Masiva</button>
          </div>

          <!-- Preview Results Box -->
          <div id="bulk-preview-results" style="margin-top: 24px; display: none;"></div>
        </div>
      </div>

      <!-- History of Batches -->
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Historial de Lotes de Importación</h2>
            <p>Registro de cargas masivas procesadas con auditoría de usuario y hash de archivo</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Lote ID</th>
                  <th>Archivo</th>
                  <th>Tipo</th>
                  <th>Modo</th>
                  <th style="text-align: center;">Filas Totales</th>
                  <th style="text-align: center;">Válidas</th>
                  <th style="text-align: center;">Errores</th>
                  <th>Usuario</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                ${batches.map(b => `
                  <tr>
                    <td style="font-weight: 700;">#${b.id}</td>
                    <td>${b.archivo_nombre}</td>
                    <td><span class="badge badge-neutral">${b.tipo}</span></td>
                    <td><span class="badge badge-neutral">${b.modo}</span></td>
                    <td style="text-align: center;">${b.total_filas}</td>
                    <td style="text-align: center; color: var(--emerald-600); font-weight: 600;">${b.filas_validas}</td>
                    <td style="text-align: center; color: ${b.filas_errores > 0 ? 'var(--rose-600)' : 'inherit'}; font-weight: 600;">${b.filas_errores}</td>
                    <td>${b.usuario_nombre}</td>
                    <td style="font-size: 12px; color: var(--text-muted);">${new Date(b.fecha).toLocaleString('es-CO')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const fileInput = document.getElementById('bulk-file-input');
    const typeSelect = document.getElementById('bulk-type-select');
    const modeSelect = document.getElementById('bulk-mode-select');
    const previewBtn = document.getElementById('btn-bulk-preview');
    const applyBtn = document.getElementById('btn-bulk-apply');
    const resultsContainer = document.getElementById('bulk-preview-results');

    let validatedFile = null;

    previewBtn.addEventListener('click', async () => {
      const file = fileInput.files[0];
      if (!file) {
        showToast('Seleccione un archivo Excel para validar.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', typeSelect.value);
      formData.append('modo', modeSelect.value);

      resultsContainer.style.display = 'block';
      resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Analizando estructura, fórmulas y registros...</div>';

      try {
        const preview = await api.bulkPreview(formData);
        validatedFile = file;
        applyBtn.disabled = false;

        resultsContainer.innerHTML = `
          <div style="background: var(--bg-subtle); padding: 20px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 20px;">
            <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Resumen de Validación Previa:</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px;">
              <div>Total Filas: <strong>${preview.total_filas}</strong></div>
              <div style="color: var(--emerald-600);">Válidas: <strong>${preview.validas}</strong></div>
              <div style="color: var(--rose-600);">Inconsistencias: <strong>${preview.errores_count}</strong></div>
              <div>Nuevos: <strong>${preview.nuevos}</strong></div>
              <div>Actualizados: <strong>${preview.actualizados}</strong></div>
              <div>Sin Cambios: <strong>${preview.sin_cambios}</strong></div>
            </div>
          </div>

          ${preview.errores_muestra && preview.errores_muestra.length > 0 ? `
            <div style="margin-top: 14px;">
              <h4 style="font-size: 14px; font-weight: 700; color: var(--rose-600); margin-bottom: 8px;">Detalle de Errores Encontrados:</h4>
              <div class="data-table-container">
                <table class="data-table" style="font-size: 12.5px;">
                  <thead>
                    <tr>
                      <th style="width: 70px;">Fila</th>
                      <th>Campo</th>
                      <th>Valor Recibido</th>
                      <th>Motivo de Inconsistencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${preview.errores_muestra.map(err => `
                      <tr>
                        <td style="font-weight: 700; text-align: center;">${err.fila}</td>
                        <td><strong>${err.campo}</strong></td>
                        <td style="font-family: monospace;">${err.valor}</td>
                        <td style="color: var(--rose-600);">${err.motivo}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : `
            <div style="background: var(--emerald-100); color: var(--emerald-600); padding: 12px 16px; border-radius: var(--radius-sm); font-weight: 600;">
              ✅ Todas las filas cumplen las reglas de integridad referencial. El archivo está listo para ser aplicado transaccionalmente.
            </div>
          `}
        `;

        showToast('Validación previa completada.', 'success');
      } catch (err) {
        resultsContainer.innerHTML = `<div style="color: var(--rose-600); font-weight: 600;">${err.message}</div>`;
        showToast(err.message, 'error');
      }
    });

    applyBtn.addEventListener('click', async () => {
      if (!validatedFile) return;
      if (!confirm('¿Confirma que desea ejecutar la importación transaccional? Esta acción actualizará la base de datos y quedará registrada en auditoría.')) return;

      const formData = new FormData();
      formData.append('file', validatedFile);
      formData.append('tipo', typeSelect.value);
      formData.append('modo', modeSelect.value);
      formData.append('usuario', state.currentRole === 'Formulador' ? 'Arq. Marcela Cárdenas' : 'Administrador Caldas');

      try {
        const result = await api.bulkApply(formData);
        showToast(`Lote #${result.lote_id} aplicado exitosamente.`, 'success');
        renderBulkImport();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando módulo de importación: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// MODULE 9: COMPARADOR DE VERSIONES / ESCENARIOS
// -------------------------------------------------------------
async function renderCompare() {
  try {
    const projects = await api.getProjects();

    viewport.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Comparador de Versiones y Escenarios Presupuestales</h2>
            <p>Análisis diferencial de cantidades, precios unitarios, inclusiones, exclusiones e impacto financiero total</p>
          </div>
        </div>
        <div class="panel-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 16px; align-items: flex-end; margin-bottom: 24px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Presupuesto Base (Versión A):</label>
              <select class="form-select" id="compare-p1-select">
                <option value="1">Proyecto 001 - v1 (Aprobado y Congelado)</option>
                <option value="2">Proyecto 002 - v1 (En Revisión)</option>
                <option value="3">Proyecto 003 - v1 (Borrador)</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Presupuesto Comparado (Versión B):</label>
              <select class="form-select" id="compare-p2-select">
                <option value="2">Proyecto 002 - v1 (En Revisión)</option>
                <option value="1">Proyecto 001 - v1 (Aprobado y Congelado)</option>
                <option value="3">Proyecto 003 - v1 (Borrador)</option>
              </select>
            </div>

            <button class="btn btn-primary" id="btn-run-compare">⚖️ Comparar Escenarios</button>
          </div>

          <div id="compare-results-container"></div>
        </div>
      </div>
    `;

    document.getElementById('btn-run-compare').addEventListener('click', async () => {
      const b1 = document.getElementById('compare-p1-select').value;
      const b2 = document.getElementById('compare-p2-select').value;
      const container = document.getElementById('compare-results-container');

      container.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">Comparando matrices presupuestales...</div>';

      try {
        const diff = await api.compareBudgets(b1, b2);

        container.innerHTML = `
          <!-- Summary Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div style="background: var(--bg-subtle); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">PRESUPUESTO A (v${diff.presupuesto_1.version})</div>
              <div style="font-size: 20px; font-weight: 800; color: var(--text-main); margin-top: 4px;">${formatCOP(diff.presupuesto_1.valor_total)}</div>
              <div style="font-size: 12px; color: var(--text-muted);">Estado: ${diff.presupuesto_1.estado}</div>
            </div>

            <div style="background: var(--bg-subtle); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">PRESUPUESTO B (v${diff.presupuesto_2.version})</div>
              <div style="font-size: 20px; font-weight: 800; color: var(--text-main); margin-top: 4px;">${formatCOP(diff.presupuesto_2.valor_total)}</div>
              <div style="font-size: 12px; color: var(--text-muted);">Estado: ${diff.presupuesto_2.estado}</div>
            </div>

            <div style="background: ${diff.delta_total >= 0 ? 'var(--amber-100)' : 'var(--emerald-100)'}; padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 12px; color: ${diff.delta_total >= 0 ? 'var(--amber-600)' : 'var(--emerald-600)'}; font-weight: 700;">VARIACIÓN PRESUPUESTAL TOTAL</div>
              <div style="font-size: 22px; font-weight: 800; color: ${diff.delta_total >= 0 ? 'var(--amber-600)' : 'var(--emerald-600)'}; margin-top: 4px;">
                ${diff.delta_total > 0 ? '+' : ''}${formatCOP(diff.delta_total)}
              </div>
              <div style="font-size: 12px;">Variación Costo Directo: ${formatCOP(diff.delta_costo_directo)}</div>
            </div>
          </div>

          <!-- Differences Table -->
          <div style="font-size: 14px; font-weight: 700; margin-bottom: 10px;">Partidas con Variaciones Detectadas (${diff.items_con_diferencias.length})</div>
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Tipo de Cambio</th>
                  <th style="text-align: right;">Cant. A</th>
                  <th style="text-align: right;">Cant. B</th>
                  <th style="text-align: right;">Subtotal A</th>
                  <th style="text-align: right;">Subtotal B</th>
                  <th style="text-align: right;">Delta (B - A)</th>
                </tr>
              </thead>
              <tbody>
                ${diff.items_con_diferencias.map(it => `
                  <tr>
                    <td style="font-family: monospace; font-weight: 700;">${it.codigo}</td>
                    <td>${it.descripcion}</td>
                    <td><span class="badge ${it.tipo_cambio.includes('Agregado') ? 'badge-success' : (it.tipo_cambio.includes('Eliminado') ? 'badge-danger' : 'badge-warning')}">${it.tipo_cambio}</span></td>
                    <td style="text-align: right;">${it.v1_cant.toFixed(2)}</td>
                    <td style="text-align: right;">${it.v2_cant.toFixed(2)}</td>
                    <td style="text-align: right;">${formatCOP(it.v1_subtotal)}</td>
                    <td style="text-align: right;">${formatCOP(it.v2_subtotal)}</td>
                    <td style="text-align: right; font-weight: 700; color: ${it.delta_subtotal > 0 ? 'var(--rose-600)' : 'var(--emerald-600)'};">
                      ${it.delta_subtotal > 0 ? '+' : ''}${formatCOP(it.delta_subtotal)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        container.innerHTML = `<div style="color: var(--rose-600);">${err.message}</div>`;
      }
    });

  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando comparador: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// MODULE 10: REPORTES Y CONSOLIDADOS
// -------------------------------------------------------------
async function renderReports() {
  try {
    const tree = await api.getTerritoryConsolidation();

    viewport.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Consolidado Territorial de Inversión en Caldas</h2>
            <p>Agrupación jerárquica de recursos públicos de infraestructura por Subregión y Municipio</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Subregión / Municipio</th>
                  <th>Código DANE</th>
                  <th style="text-align: center;">Proyectos</th>
                  <th style="text-align: right;">Inversión Total Asignada</th>
                </tr>
              </thead>
              <tbody>
                ${tree.map(sub => `
                  <tr class="chapter-row">
                    <td colspan="3">${sub.nombre.toUpperCase()}</td>
                    <td style="text-align: right; font-weight: 800;">${formatCOP(sub.subtotal_inversion)}</td>
                  </tr>
                  ${sub.municipios.map(m => `
                    <tr>
                      <td style="padding-left: 36px; font-weight: 500;">${m.nombre}</td>
                      <td style="font-family: monospace;">${m.codigo_dane}</td>
                      <td style="text-align: center;"><span class="badge badge-neutral">${m.proyectos_count} obras</span></td>
                      <td style="text-align: right; font-weight: 600; color: var(--primary-700);">${formatCOP(m.inversion_total)}</td>
                    </tr>
                  `).join('')}
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando reportes: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// MODULE 11: AUDITORÍA Y TRAZABILIDAD
// -------------------------------------------------------------
async function renderAudit() {
  try {
    const logs = await api.listAuditLogs({ limit: 100 });

    viewport.innerHTML = `
      <div class="panel-card">
        <div class="panel-header">
          <div class="panel-header-title">
            <h2>Bitácora Inmutable de Auditoría y Trazabilidad</h2>
            <p>Registro cronológico de modificaciones presupuestales, aprobaciones y operaciones masivas</p>
          </div>
          <div class="panel-actions">
            <span class="badge badge-neutral">${logs.length} registros</span>
          </div>
        </div>
        <div class="panel-body">
          <div class="data-table-container">
            <table class="data-table" style="font-size: 13px;">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Entidad</th>
                  <th>ID Registro</th>
                  <th>Campo Modificado</th>
                  <th>Valor Anterior</th>
                  <th>Valor Nuevo</th>
                  <th>Motivo / Justificación</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr>
                    <td style="white-space: nowrap; font-size: 12px; color: var(--text-muted);">${new Date(l.fecha).toLocaleString('es-CO')}</td>
                    <td style="font-weight: 600;">${l.usuario}</td>
                    <td><span class="badge badge-neutral">${l.rol}</span></td>
                    <td><strong>${l.entidad}</strong></td>
                    <td style="font-family: monospace;">#${l.registro_id}</td>
                    <td><code>${l.campo || 'General'}</code></td>
                    <td style="color: var(--rose-600);">${l.valor_anterior || '—'}</td>
                    <td style="color: var(--emerald-600); font-weight: 600;">${l.valor_nuevo || '—'}</td>
                    <td style="font-size: 12px; color: var(--text-muted);">${l.motivo || 'Sin motivo registrado'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    viewport.innerHTML = `<div class="panel-card" style="padding: 30px; text-align: center; color: var(--rose-600);">Error cargando auditoría: ${err.message}</div>`;
  }
}

window.downloadTemplateClient = (tipo) => {
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    let data = [];
    if (tipo === 'cantidades') {
      data = [
        ["PRESUPUESTO_ID", "ACTIVIDAD_CODIGO", "CANTIDAD", "OBSERVACIONES"],
        [1, "00101", 150.50, "Replanteo y localización de bloque de aulas"],
        [1, "00201", 85.00, "Excavación manual en material común"],
        [1, "00501", 45.20, "Concreto 3000 PSI para zapatas y vigas"]
      ];
    } else if (tipo === 'precios_insumos') {
      data = [
        ["CODIGO_INSUMO", "PRECIO_UNITARIO", "VIGENCIA", "FUENTE"],
        ["I1", 4750.00, 2026, "Ferretería Central Caldas Cotización 2026"],
        ["I2", 4450.00, 2026, "Distribuidora Aceros Manizales"]
      ];
    } else {
      data = [
        ["CODIGO", "DESCRIPCION", "TIPO", "UNIDAD", "PRECIO_2026", "FUENTE"],
        ["I9999", "CEMENTO GRIS TIPO UG 50KG", "Insumos", "UND", 34500.00, "Argos Caldas"]
      ];
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, tipo.toUpperCase());
    XLSX.writeFile(wb, `Plantilla_Caldas_${tipo.toUpperCase()}.xlsx`);
    showToast(`Plantilla ${tipo} descargada en Excel (.xlsx).`, "success");
  } else {
    window.open(`/api/bulk/template/${tipo}`, '_blank');
  }
};

// Check Environment
if (window.location.hostname.endsWith('github.io')) {
  const badge = document.getElementById('env-badge');
  if (badge) {
    badge.textContent = 'GitHub Pages';
    badge.className = 'badge badge-success';
  }
}

// Initialize Application
applyTheme(state.theme);
renderCurrentView();
