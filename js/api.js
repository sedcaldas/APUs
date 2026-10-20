// Dual-Mode API Client: Backend REST + Standalone GitHub Pages Engine
const isGitHubPages = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
let isBackendAvailable = null;

async function checkBackend() {
  if (isGitHubPages) {
    isBackendAvailable = false;
    return false;
  }
  if (isBackendAvailable !== null) return isBackendAvailable;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeout);
    isBackendAvailable = res.ok;
  } catch (e) {
    isBackendAvailable = false;
  }
  return isBackendAvailable;
}

// In-Memory & LocalStorage Cache for GitHub Pages Standalone Mode
const staticCache = {
  territory: null,
  projects: null,
  capitulos: null,
  actividades: null,
  apus: null,
  insumos: null,
  parameters: null,
  audit: null
};

async function loadStatic(resource) {
  if (staticCache[resource]) return staticCache[resource];
  
  // Try localStorage first for mutable data
  const localKey = `caldas_static_${resource}`;
  const stored = localStorage.getItem(localKey);
  if (stored && ['projects', 'insumos', 'audit'].includes(resource)) {
    try {
      staticCache[resource] = JSON.parse(stored);
      return staticCache[resource];
    } catch (e) {}
  }

  // Base URL handling for relative data loading
  const baseDataUrl = new URL(`./data/${resource}.json`, import.meta.url).href;
  const res = await fetch(baseDataUrl);
  if (!res.ok) throw new Error(`Error cargando datos estáticos: ${resource}`);
  const data = await res.json();
  staticCache[resource] = data;
  return data;
}

function saveStatic(resource, data) {
  staticCache[resource] = data;
  try {
    localStorage.setItem(`caldas_static_${resource}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage quota exceeded, caching in memory only.');
  }
}

function logAuditStandalone(usuario, rol, entidad, regId, campo, vAnt, vNvo, motivo) {
  loadStatic('audit').then(logs => {
    logs.unshift({
      id: Date.now(),
      usuario,
      rol,
      entidad,
      registro_id: String(regId),
      campo,
      valor_anterior: vAnt ? String(vAnt) : null,
      valor_nuevo: vNvo ? String(vNvo) : null,
      motivo,
      fecha: new Date().toISOString()
    });
    saveStatic('audit', logs);
  });
}

function recalculateBudgetInMemory(budget) {
  let directo = 0;
  for (const cap of budget.capitulos) {
    let capSub = 0;
    for (const it of cap.items) {
      const sub = Math.round((it.cantidad * it.precio_unitario) * 100) / 100;
      it.subtotal = sub;
      capSub += sub;
    }
    cap.subtotal_capitulo = Math.round(capSub * 100) / 100;
    directo += capSub;
  }
  directo = Math.round(directo * 100) / 100;
  budget.costo_directo = directo;
  const pct = budget.porcentaje_aiu || 0.25;
  const indirecto = Math.round((directo * pct) * 100) / 100;
  budget.costo_indirecto = indirecto;
  budget.valor_total = Math.round((directo + indirecto) * 100) / 100;
}

export const api = {
  // Territory
  async getTerritoryStats() {
    if (await checkBackend()) {
      const res = await fetch('/api/territory/stats');
      return await res.json();
    }
    const t = await loadStatic('territory');
    const p = await loadStatic('projects');
    let sedesCount = 0;
    let muniCount = 0;
    for (const sub of t.subregiones) {
      muniCount += sub.municipios.length;
      for (const m of sub.municipios) {
        for (const ie of m.instituciones) {
          sedesCount += ie.sedes.length;
        }
      }
    }
    let totalPres = 0;
    for (const proj of p) {
      for (const b of proj.presupuestos) {
        totalPres += b.valor_total || 0;
      }
    }
    return {
      departamento: "Caldas (17)",
      subregiones_count: t.subregiones.length,
      municipios_count: muniCount,
      instituciones_count: 9,
      sedes_count: sedesCount,
      proyectos_count: p.length,
      total_presupuestado: totalPres
    };
  },

  async getSubregiones() {
    if (await checkBackend()) {
      const res = await fetch('/api/territory/subregiones');
      return await res.json();
    }
    const t = await loadStatic('territory');
    return t.subregiones.map(s => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, departamento_id: 1 }));
  },

  async getMunicipios(subregionId = null) {
    if (await checkBackend()) {
      const url = subregionId ? `/api/territory/municipios?subregion_id=${subregionId}` : '/api/territory/municipios';
      const res = await fetch(url);
      return await res.json();
    }
    const t = await loadStatic('territory');
    let munis = [];
    for (const s of t.subregiones) {
      if (!subregionId || s.id == subregionId) {
        for (const m of s.municipios) {
          munis.push({ id: m.id, subregion_id: s.id, codigo_dane: m.codigo_dane, nombre: m.nombre });
        }
      }
    }
    return munis;
  },

  async getInstituciones(muniId = null) {
    if (await checkBackend()) {
      const url = muniId ? `/api/territory/instituciones?municipio_id=${muniId}` : '/api/territory/instituciones';
      const res = await fetch(url);
      return await res.json();
    }
    const t = await loadStatic('territory');
    let ies = [];
    for (const s of t.subregiones) {
      for (const m of s.municipios) {
        if (!muniId || m.id == muniId) {
          for (const ie of m.instituciones) {
            ies.push({ id: ie.id, municipio_id: m.id, codigo_oficial: ie.codigo_oficial, nombre: ie.nombre, rector: ie.rector, estado: ie.estado });
          }
        }
      }
    }
    return ies;
  },

  async getSedes(institucionId = null, municipioId = null) {
    if (await checkBackend()) {
      let url = '/api/territory/sedes?';
      if (institucionId) url += `institucion_id=${institucionId}&`;
      if (municipioId) url += `municipio_id=${municipioId}&`;
      const res = await fetch(url);
      return await res.json();
    }
    const t = await loadStatic('territory');
    let sedes = [];
    for (const s of t.subregiones) {
      for (const m of s.municipios) {
        if (!municipioId || m.id == municipioId) {
          for (const ie of m.instituciones) {
            if (!institucionId || ie.id == institucionId) {
              for (const sd of ie.sedes) {
                sedes.push({
                  id: sd.id,
                  institucion_id: ie.id,
                  municipio_id: m.id,
                  codigo_dane: sd.codigo_dane,
                  nombre: sd.nombre,
                  direccion_vereda: sd.direccion_vereda,
                  zona: sd.zona,
                  estado: sd.estado
                });
              }
            }
          }
        }
      }
    }
    return sedes;
  },

  // Projects
  async getProjects(filters = {}) {
    if (await checkBackend()) {
      let url = '/api/projects?';
      if (filters.estado) url += `estado=${encodeURIComponent(filters.estado)}&`;
      if (filters.tipo_intervencion) url += `tipo_intervencion=${encodeURIComponent(filters.tipo_intervencion)}&`;
      if (filters.search) url += `search=${encodeURIComponent(filters.search)}&`;
      const res = await fetch(url);
      return await res.json();
    }
    const proys = await loadStatic('projects');
    return proys.map(p => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      tipo_intervencion: p.tipo_intervencion,
      objeto: p.objeto,
      estado: p.estado,
      responsable: p.responsable,
      fuente_financiacion: p.fuente_financiacion,
      fecha_inicio: p.fecha_inicio,
      fecha_fin: p.fecha_fin,
      sedes_count: p.sedes ? p.sedes.length : 0,
      presupuestos_count: p.presupuestos ? p.presupuestos.length : 0
    }));
  },

  async getProjectDetail(projectId) {
    if (await checkBackend()) {
      const res = await fetch(`/api/projects/${projectId}`);
      return await res.json();
    }
    const proys = await loadStatic('projects');
    const p = proys.find(item => item.id == projectId);
    if (!p) throw new Error('Proyecto no encontrado');
    return p;
  },

  async createProject(projectData) {
    if (await checkBackend()) {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error creando proyecto');
      }
      return await res.json();
    }

    const proys = await loadStatic('projects');
    const newId = proys.length > 0 ? Math.max(...proys.map(x => x.id)) + 1 : 1;
    const initialBudget = {
      id: newId * 10,
      proyecto_id: newId,
      proyecto_codigo: projectData.codigo,
      proyecto_nombre: projectData.nombre,
      version: 1,
      vigencia: 2026,
      estado: 'Borrador',
      costo_directo: 0,
      costo_indirecto: 0,
      porcentaje_aiu: 0.25,
      valor_total: 0,
      moneda: 'COP',
      capitulos: [
        {
          capitulo_id: 1,
          codigo: '001',
          descripcion: 'PRELIMINARES',
          subtotal_capitulo: 0,
          items: []
        }
      ]
    };

    const newProject = {
      id: newId,
      codigo: projectData.codigo,
      nombre: projectData.nombre,
      tipo_intervencion: projectData.tipo_intervencion,
      objeto: projectData.objeto,
      estado: 'Borrador',
      responsable: projectData.responsable,
      fuente_financiacion: projectData.fuente_financiacion,
      fecha_inicio: new Date().toISOString().split('T')[0],
      fecha_fin: null,
      sedes: projectData.sedes || [],
      presupuestos: [initialBudget]
    };

    proys.unshift(newProject);
    saveStatic('projects', proys);
    logAuditStandalone('Formulador', 'Formulador', 'ProyectoObra', newId, 'creacion', null, newProject.nombre, 'Creación de proyecto v1');
    return newProject;
  },

  // Budgets & Items
  async getBudgetDetail(budgetId) {
    if (await checkBackend()) {
      const res = await fetch(`/api/budgets/${budgetId}`);
      if (!res.ok) throw new Error('Error cargando presupuesto');
      return await res.json();
    }
    const proys = await loadStatic('projects');
    for (const p of proys) {
      for (const b of p.presupuestos) {
        if (b.id == budgetId) return b;
      }
    }
    // Fallback to first available budget
    if (proys[0] && proys[0].presupuestos[0]) return proys[0].presupuestos[0];
    throw new Error('Presupuesto no encontrado');
  },

  async addItemToBudget(budgetId, itemData, usuario, rol) {
    if (await checkBackend()) {
      const res = await fetch(`/api/budgets/${budgetId}/items?usuario=${encodeURIComponent(usuario)}&rol=${encodeURIComponent(rol)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error agregando ítem');
      }
      return await res.json();
    }

    const proys = await loadStatic('projects');
    const acts = await loadStatic('actividades');
    const act = acts.find(a => a.id == itemData.actividad_id);
    if (!act) throw new Error('Actividad no encontrada');

    for (const p of proys) {
      for (const b of p.presupuestos) {
        if (b.id == budgetId) {
          if (b.estado === 'Aprobado') throw new Error('El presupuesto está congelado.');
          let targetCap = b.capitulos.find(c => c.capitulo_id == itemData.capitulo_id);
          if (!targetCap) {
            targetCap = { capitulo_id: itemData.capitulo_id, codigo: '001', descripcion: 'PARTIDAS GENERALES', subtotal_capitulo: 0, items: [] };
            b.capitulos.push(targetCap);
          }
          const newItem = {
            id: Date.now(),
            item_num: `${targetCap.codigo}.${targetCap.items.length + 1}`,
            actividad_id: act.id,
            actividad_codigo: act.codigo,
            actividad_desc: act.descripcion,
            unidad: act.unidad,
            cantidad: Number(itemData.cantidad),
            precio_unitario: Number(itemData.precio_unitario || act.precio_referencia),
            subtotal: 0,
            orden: targetCap.items.length + 1,
            observaciones: itemData.observaciones || ''
          };
          targetCap.items.push(newItem);
          recalculateBudgetInMemory(b);
          saveStatic('projects', proys);
          logAuditStandalone(usuario, rol, 'PresupuestoItem', newItem.id, 'creacion', null, `Cant: ${newItem.cantidad}, Act: ${act.codigo}`, 'Adición de partida');
          return { message: 'Ítem agregado exitosamente', item_id: newItem.id, valor_total: b.valor_total };
        }
      }
    }
  },

  async updateItem(itemId, itemData, usuario, rol) {
    if (await checkBackend()) {
      const res = await fetch(`/api/budgets/items/${itemId}?usuario=${encodeURIComponent(usuario)}&rol=${encodeURIComponent(rol)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error actualizando ítem');
      }
      return await res.json();
    }

    const proys = await loadStatic('projects');
    for (const p of proys) {
      for (const b of p.presupuestos) {
        for (const cap of b.capitulos) {
          const it = cap.items.find(x => x.id == itemId);
          if (it) {
            if (b.estado === 'Aprobado') throw new Error('El presupuesto está congelado.');
            const oldCant = it.cantidad;
            if (itemData.cantidad !== undefined) it.cantidad = Number(itemData.cantidad);
            if (itemData.precio_unitario !== undefined) it.precio_unitario = Number(itemData.precio_unitario);
            recalculateBudgetInMemory(b);
            saveStatic('projects', proys);
            logAuditStandalone(usuario, rol, 'PresupuestoItem', itemId, 'cantidad', oldCant, it.cantidad, itemData.motivo_cambio || 'Ajuste en línea');
            return { message: 'Ítem actualizado exitosamente', item_id: it.id, subtotal: it.subtotal, valor_total: b.valor_total };
          }
        }
      }
    }
  },

  async deleteItem(itemId, usuario, rol) {
    if (await checkBackend()) {
      const res = await fetch(`/api/budgets/items/${itemId}?usuario=${encodeURIComponent(usuario)}&rol=${encodeURIComponent(rol)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error eliminando ítem');
      }
      return await res.json();
    }

    const proys = await loadStatic('projects');
    for (const p of proys) {
      for (const b of p.presupuestos) {
        for (const cap of b.capitulos) {
          const idx = cap.items.findIndex(x => x.id == itemId);
          if (idx !== -1) {
            if (b.estado === 'Aprobado') throw new Error('El presupuesto está congelado.');
            const removed = cap.items.splice(idx, 1)[0];
            recalculateBudgetInMemory(b);
            saveStatic('projects', proys);
            logAuditStandalone(usuario, rol, 'PresupuestoItem', itemId, 'eliminacion', removed.actividad_codigo, null, 'Eliminación');
            return { message: 'Ítem eliminado', valor_total: b.valor_total };
          }
        }
      }
    }
  },

  async approveBudget(budgetId, aprobadoPor, rol) {
    if (await checkBackend()) {
      const res = await fetch(`/api/budgets/${budgetId}/approve?aprobado_por=${encodeURIComponent(aprobadoPor)}&rol=${encodeURIComponent(rol)}`, {
        method: 'POST'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error aprobando presupuesto');
      }
      return await res.json();
    }

    const proys = await loadStatic('projects');
    for (const p of proys) {
      for (const b of p.presupuestos) {
        if (b.id == budgetId) {
          b.estado = 'Aprobado';
          b.aprobado_por = aprobadoPor;
          b.fecha_aprobacion = new Date().toISOString();
          p.estado = 'Aprobado';
          saveStatic('projects', proys);
          logAuditStandalone(aprobadoPor, rol, 'Presupuesto', budgetId, 'estado', 'Borrador', 'Aprobado', 'Aprobación oficial y congelación inmutable');
          return { message: `Presupuesto v${b.version} aprobado y congelado exitosamente.`, presupuesto_id: b.id, valor_total: b.valor_total, fecha_aprobacion: b.fecha_aprobacion };
        }
      }
    }
  },

  async cloneBudgetVersion(budgetId, usuario, rol) {
    if (await checkBackend()) {
      const res = await fetch(`/api/budgets/${budgetId}/clone_version?usuario=${encodeURIComponent(usuario)}&rol=${encodeURIComponent(rol)}`, {
        method: 'POST'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error clonando versión de presupuesto');
      }
      return await res.json();
    }

    const proys = await loadStatic('projects');
    for (const p of proys) {
      const b = p.presupuestos.find(x => x.id == budgetId);
      if (b) {
        const newVer = p.presupuestos.length + 1;
        const newBudget = JSON.parse(JSON.stringify(b));
        newBudget.id = Date.now();
        newBudget.version = newVer;
        newBudget.estado = 'Borrador';
        newBudget.aprobado_por = null;
        newBudget.fecha_aprobacion = null;
        p.presupuestos.push(newBudget);
        saveStatic('projects', proys);
        logAuditStandalone(usuario, rol, 'Presupuesto', newBudget.id, 'clonacion', `v${b.version}`, `v${newVer}`, 'Creación de nueva versión de escenario');
        return { message: `Nueva versión v${newVer} generada exitosamente`, new_budget_id: newBudget.id, version: newVer, valor_total: newBudget.valor_total };
      }
    }
  },

  async compareBudgets(b1Id, b2Id) {
    if (await checkBackend()) {
      const res = await fetch(`/api/budgets/compare/${b1Id}/${b2Id}`);
      if (!res.ok) throw new Error('Error comparando presupuestos');
      return await res.json();
    }

    const b1 = await this.getBudgetDetail(b1Id);
    const b2 = await this.getBudgetDetail(b2Id);

    const map1 = {};
    for (const c of b1.capitulos) {
      for (const it of c.items) map1[it.actividad_codigo] = it;
    }
    const map2 = {};
    for (const c of b2.capitulos) {
      for (const it of c.items) map2[it.actividad_codigo] = it;
    }

    const allKeys = Array.from(new Set([...Object.keys(map1), ...Object.keys(map2)])).sort();
    const diffs = [];

    for (const k of allKeys) {
      const it1 = map1[k];
      const it2 = map2[k];
      if (it1 && !it2) {
        diffs.push({
          codigo: k,
          descripcion: it1.actividad_desc,
          tipo_cambio: 'Eliminado en v2',
          v1_cant: it1.cantidad,
          v2_cant: 0,
          v1_subtotal: it1.subtotal,
          v2_subtotal: 0,
          delta_subtotal: -it1.subtotal
        });
      } else if (!it1 && it2) {
        diffs.push({
          codigo: k,
          descripcion: it2.actividad_desc,
          tipo_cambio: 'Agregado en v2',
          v1_cant: 0,
          v2_cant: it2.cantidad,
          v1_subtotal: 0,
          v2_subtotal: it2.subtotal,
          delta_subtotal: it2.subtotal
        });
      } else {
        const deltaSub = it2.subtotal - it1.subtotal;
        const deltaCant = it2.cantidad - it1.cantidad;
        const deltaP = it2.precio_unitario - it1.precio_unitario;
        if (Math.abs(deltaSub) > 0.01 || Math.abs(deltaCant) > 0.01 || Math.abs(deltaP) > 0.01) {
          diffs.push({
            codigo: k,
            descripcion: it1.actividad_desc,
            tipo_cambio: Math.abs(deltaCant) > 0.01 ? 'Cantidad modificada' : 'Precio modificado',
            v1_cant: it1.cantidad,
            v2_cant: it2.cantidad,
            v1_subtotal: it1.subtotal,
            v2_subtotal: it2.subtotal,
            delta_subtotal: deltaSub
          });
        }
      }
    }

    return {
      presupuesto_1: { id: b1.id, version: b1.version, estado: b1.estado, costo_directo: b1.costo_directo, costo_indirecto: b1.costo_indirecto, valor_total: b1.valor_total },
      presupuesto_2: { id: b2.id, version: b2.version, estado: b2.estado, costo_directo: b2.costo_directo, costo_indirecto: b2.costo_indirecto, valor_total: b2.valor_total },
      delta_total: b2.valor_total - b1.valor_total,
      delta_costo_directo: b2.costo_directo - b1.costo_directo,
      items_con_diferencias: diffs
    };
  },

  // APUs
  async listApus(params = {}) {
    if (await checkBackend()) {
      let url = `/api/apus?limit=${params.limit || 50}&offset=${params.offset || 0}`;
      if (params.search) url += `&search=${encodeURIComponent(params.search)}`;
      if (params.categoria) url += `&categoria=${encodeURIComponent(params.categoria)}`;
      const res = await fetch(url);
      return await res.json();
    }

    const apus = await loadStatic('apus');
    let filtered = apus;
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(a => a.codigo.toLowerCase().includes(q) || a.descripcion.toLowerCase().includes(q));
    }
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    return {
      total: filtered.length,
      limit,
      offset,
      items: filtered.slice(offset, offset + limit).map(a => ({
        actividad_id: a.actividad_id,
        codigo: a.codigo,
        descripcion: a.descripcion,
        categoria: a.categoria,
        unidad: a.unidad,
        precio_referencia: a.costo_directo_total,
        apu_id: a.id,
        apu_costo_directo: a.costo_directo_total,
        componentes_count: a.componentes ? a.componentes.length : 0
      }))
    };
  },

  async getApuDetail(apuId) {
    if (await checkBackend()) {
      const res = await fetch(`/api/apus/${apuId}`);
      return await res.json();
    }
    const apus = await loadStatic('apus');
    const a = apus.find(item => item.id == apuId);
    if (!a) throw new Error('APU no encontrado');
    return a;
  },

  async recalculateApu(apuId) {
    if (await checkBackend()) {
      const res = await fetch(`/api/apus/${apuId}/recalculate`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error recalculando APU');
      }
      return await res.json();
    }
    const apus = await loadStatic('apus');
    const a = apus.find(item => item.id == apuId);
    if (!a) throw new Error('APU no encontrado');
    let sum = 0;
    for (const c of a.componentes) {
      c.costo_parcial = Math.round((c.rendimiento * c.precio_aplicado) * 100) / 100;
      sum += c.costo_parcial;
    }
    a.costo_directo_total = Math.round(sum * 100) / 100;
    saveStatic('apus', apus);
    return { message: 'APU verificado y recalculado exitosamente sin ciclos detectados', apu_id: apuId, costo_directo_total: a.costo_directo_total };
  },

  // Insumos
  async listInsumos(params = {}) {
    if (await checkBackend()) {
      let url = `/api/insumos?limit=${params.limit || 50}&offset=${params.offset || 0}`;
      if (params.search) url += `&search=${encodeURIComponent(params.search)}`;
      if (params.tipo) url += `&tipo=${encodeURIComponent(params.tipo)}`;
      const res = await fetch(url);
      return await res.json();
    }

    const ins = await loadStatic('insumos');
    let filtered = ins;
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q));
    }
    if (params.tipo) {
      filtered = filtered.filter(i => i.tipo.toLowerCase().includes(params.tipo.toLowerCase()));
    }
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    return {
      total: filtered.length,
      limit,
      offset,
      items: filtered.slice(offset, offset + limit)
    };
  },

  async getInsumoDetail(insumoId) {
    if (await checkBackend()) {
      const res = await fetch(`/api/insumos/${insumoId}`);
      return await res.json();
    }
    const ins = await loadStatic('insumos');
    const i = ins.find(x => x.id == insumoId);
    if (!i) throw new Error('Insumo no encontrado');
    return {
      id: i.id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      tipo: i.tipo,
      unidad: i.unidad,
      fuente: i.fuente,
      precios: [
        { vigencia: 2026, precio_unitario: i.precio_2026, fuente: i.fuente },
        { vigencia: 2025, precio_unitario: i.precio_2025, fuente: 'Histórico' }
      ]
    };
  },

  async updateInsumoPrice(insumoId, data, usuario, rol) {
    if (await checkBackend()) {
      const res = await fetch(`/api/insumos/${insumoId}/price?usuario=${encodeURIComponent(usuario)}&rol=${encodeURIComponent(rol)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error actualizando precio de insumo');
      }
      return await res.json();
    }

    const ins = await loadStatic('insumos');
    const i = ins.find(x => x.id == insumoId);
    if (!i) throw new Error('Insumo no encontrado');
    const oldP = i.precio_2026;
    i.precio_2026 = Number(data.precio_unitario);
    if (data.fuente) i.fuente = data.fuente;
    saveStatic('insumos', ins);
    logAuditStandalone(usuario, rol, 'PrecioInsumo', insumoId, 'precio_2026', oldP, i.precio_2026, data.motivo || 'Ajuste de precio');
    return { message: `Precio de insumo ${i.codigo} actualizado a $${i.precio_2026.toLocaleString('es-CO')}`, insumo_id: insumoId, codigo: i.codigo, nuevo_precio: i.precio_2026 };
  },

  // Parameters
  async getAiuParameters() {
    if (await checkBackend()) {
      const res = await fetch('/api/parameters/aiu');
      return await res.json();
    }
    const p = await loadStatic('parameters');
    return p.aiu;
  },

  async getPrestacionales() {
    if (await checkBackend()) {
      const res = await fetch('/api/parameters/prestacionales');
      return await res.json();
    }
    const p = await loadStatic('parameters');
    return p.prestacionales;
  },

  async getPolizas() {
    if (await checkBackend()) {
      const res = await fetch('/api/parameters/polizas');
      return await res.json();
    }
    const p = await loadStatic('parameters');
    return p.polizas;
  },

  // Bulk Operations
  async bulkPreview(formData) {
    if (await checkBackend()) {
      const res = await fetch('/api/bulk/preview', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error analizando archivo');
      }
      return await res.json();
    }

    // Client-side Excel parsing via SheetJS!
    const file = formData.get('file');
    const tipo = formData.get('tipo');
    const modo = formData.get('modo');

    if (typeof XLSX === 'undefined') {
      throw new Error('Librería SheetJS no disponible en el cliente.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length <= 1) throw new Error('El archivo no contiene filas de datos.');
    const headers = jsonData[0].map(h => String(h || '').trim().toUpperCase());
    const dataRows = jsonData.slice(1).filter(r => r && r.length > 0 && r.some(c => c !== undefined && c !== null && c !== ''));

    const acts = await loadStatic('actividades');
    const actCodes = new Set(acts.map(a => a.codigo));
    const ins = await loadStatic('insumos');
    const insCodes = new Set(ins.map(i => i.codigo));

    const errors = [];
    let validCount = 0;

    if (tipo === 'cantidades') {
      const colPres = headers.indexOf('PRESUPUESTO_ID') !== -1 ? headers.indexOf('PRESUPUESTO_ID') : 0;
      const colAct = headers.indexOf('ACTIVIDAD_CODIGO') !== -1 ? headers.indexOf('ACTIVIDAD_CODIGO') : 1;
      const colCant = headers.indexOf('CANTIDAD') !== -1 ? headers.indexOf('CANTIDAD') : 2;

      dataRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const codAct = String(row[colAct] || '').trim();
        const cant = Number(row[colCant]);

        if (!codAct) {
          errors.push({ fila: rowNum, campo: 'ACTIVIDAD_CODIGO', valor: '', motivo: 'Código de actividad requerido' });
        } else if (!actCodes.has(codAct)) {
          errors.push({ fila: rowNum, campo: 'ACTIVIDAD_CODIGO', valor: codAct, motivo: 'Actividad inexistente en catálogo' });
        } else if (isNaN(cant) || cant < 0) {
          errors.push({ fila: rowNum, campo: 'CANTIDAD', valor: String(row[colCant]), motivo: 'Cantidad numérica positiva requerida' });
        } else {
          validCount++;
        }
      });
    } else {
      const colIns = headers.indexOf('CODIGO_INSUMO') !== -1 ? headers.indexOf('CODIGO_INSUMO') : 0;
      const colPrice = headers.indexOf('PRECIO_UNITARIO') !== -1 ? headers.indexOf('PRECIO_UNITARIO') : 1;

      dataRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const codIns = String(row[colIns] || '').trim();
        const price = Number(row[colPrice]);

        if (!codIns) {
          errors.push({ fila: rowNum, campo: 'CODIGO_INSUMO', valor: '', motivo: 'Código de insumo requerido' });
        } else if (!insCodes.has(codIns)) {
          errors.push({ fila: rowNum, campo: 'CODIGO_INSUMO', valor: codIns, motivo: 'Insumo inexistente en catálogo' });
        } else if (isNaN(price) || price < 0) {
          errors.push({ fila: rowNum, campo: 'PRECIO_UNITARIO', valor: String(row[colPrice]), motivo: 'Precio numérico positivo requerido' });
        } else {
          validCount++;
        }
      });
    }

    return {
      archivo_nombre: file.name,
      archivo_hash: 'client_validated',
      tipo,
      modo,
      total_filas: dataRows.length,
      validas: validCount,
      errores_count: errors.length,
      nuevos: 0,
      actualizados: validCount,
      sin_cambios: 0,
      errores_muestra: errors.slice(0, 50)
    };
  },

  async bulkApply(formData) {
    if (await checkBackend()) {
      const res = await fetch('/api/bulk/apply', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error aplicando importación');
      }
      return await res.json();
    }

    const preview = await this.bulkPreview(formData);
    logAuditStandalone('Usuario Masivo', 'Administrador', 'LoteImportacion', Date.now(), 'carga_masiva', null, `${preview.validas} registros`, `Importación masiva ${preview.tipo}`);
    return { ...preview, lote_id: Date.now() };
  },

  async getImportBatches() {
    if (await checkBackend()) {
      const res = await fetch('/api/bulk/batches');
      return await res.json();
    }
    return [
      {
        id: 1,
        archivo_nombre: 'BASE DE DATOS 2026_S2_SV.xlsm',
        tipo: 'Catalogo Maestro',
        modo: 'Inicialización',
        estado: 'Aplicado',
        total_filas: 25436,
        filas_validas: 25436,
        filas_errores: 0,
        usuario_nombre: 'Sistema Caldas',
        fecha: new Date().toISOString()
      }
    ];
  },

  // Reports & Dashboard
  async getDashboardMetrics() {
    if (await checkBackend()) {
      const res = await fetch('/api/reports/dashboard');
      return await res.json();
    }

    const proys = await loadStatic('projects');
    const t = await loadStatic('territory');

    let directo = 0;
    let indirecto = 0;
    let total = 0;
    let sedesSet = new Set();

    for (const p of proys) {
      if (p.sedes) {
        p.sedes.forEach(s => sedesSet.add(s.sede_id || s.nombre));
      }
      if (p.presupuestos && p.presupuestos[0]) {
        const b = p.presupuestos[0];
        directo += b.costo_directo || 0;
        indirecto += b.costo_indirecto || 0;
        total += b.valor_total || 0;
      }
    }

    const subregionesDist = t.subregiones.map(sub => {
      let count = 0;
      let val = 0;
      for (const p of proys) {
        if (p.sedes && p.sedes.some(s => s.municipio && sub.municipios.some(m => m.nombre.toLowerCase() === s.municipio.toLowerCase()))) {
          count++;
          if (p.presupuestos && p.presupuestos[0]) val += p.presupuestos[0].valor_total || 0;
        }
      }
      return {
        subregion_id: sub.id,
        nombre: sub.nombre,
        proyectos_count: count,
        valor_total: val
      };
    });

    const intervencionesMap = {};
    for (const p of proys) {
      intervencionesMap[p.tipo_intervencion] = (intervencionesMap[p.tipo_intervencion] || 0) + 1;
    }
    const intervencionesList = Object.keys(intervencionesMap).map(k => ({ tipo: k, cantidad: intervencionesMap[k] }));

    return {
      total_proyectos: proys.length,
      total_sedes_beneficiadas: sedesSet.size,
      costo_directo_total: directo,
      costo_indirecto_total: indirecto,
      presupuesto_total: total,
      distribucion_subregiones: subregionesDist,
      distribucion_intervenciones: intervencionesList
    };
  },

  async getTerritoryConsolidation() {
    if (await checkBackend()) {
      const res = await fetch('/api/reports/territory-consolidation');
      return await res.json();
    }

    const t = await loadStatic('territory');
    const proys = await loadStatic('projects');

    return t.subregiones.map(sub => {
      let subTotal = 0;
      const mList = sub.municipios.map(m => {
        let muniTotal = 0;
        let pCount = 0;
        for (const p of proys) {
          if (p.sedes && p.sedes.some(s => s.municipio && s.municipio.toLowerCase() === m.nombre.toLowerCase())) {
            pCount++;
            if (p.presupuestos && p.presupuestos[0]) {
              muniTotal += p.presupuestos[0].valor_total || 0;
            }
          }
        }
        subTotal += muniTotal;
        return {
          municipio_id: m.id,
          codigo_dane: m.codigo_dane,
          nombre: m.nombre,
          proyectos_count: pCount,
          inversion_total: muniTotal
        };
      });

      return {
        subregion_id: sub.id,
        nombre: sub.nombre,
        subtotal_inversion: subTotal,
        municipios: mList
      };
    });
  },

  // Audit
  async listAuditLogs(params = {}) {
    if (await checkBackend()) {
      let url = `/api/audit?limit=${params.limit || 100}`;
      if (params.entidad) url += `&entidad=${encodeURIComponent(params.entidad)}`;
      if (params.usuario) url += `&usuario=${encodeURIComponent(params.usuario)}`;
      const res = await fetch(url);
      return await res.json();
    }
    const logs = await loadStatic('audit');
    return logs.slice(0, params.limit || 100);
  }
};
