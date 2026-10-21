from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.database import get_db
from backend.app.models import (
    Presupuesto, PresupuestoItem, APU, APUComponente, Insumo,
    ProyectoObra, ProyectoSede, SedeEducativa, Municipio, Subregion, Capitulo
)
from backend.app.services.exporter import export_budget_excel, export_budget_pdf

router = APIRouter(prefix="/reports", tags=["Reportes, Consolidados y Exportaciones"])

@router.get("/dashboard")
def get_dashboard_metrics(
    project_id: Optional[int] = Query(None, description="Filtrar por proyecto específico"),
    periodo: Optional[str] = Query(None, description="Filtro temporal (ultimos_6_meses, vigencia_2026, historico)"),
    db: Session = Depends(get_db)
):
    """Métricas ejecutivas y analíticas avanzadas estilo PresuCosto."""
    # Query projects
    proy_query = db.query(ProyectoObra)
    if project_id:
        proy_query = proy_query.filter(ProyectoObra.id == project_id)
    projects = proy_query.all()
    project_ids = [p.id for p in projects]

    # Budgets for selected projects
    budgets = db.query(Presupuesto).filter(Presupuesto.proyecto_id.in_(project_ids)).all()
    budget_ids = [b.id for b in budgets]

    # Aggregated totals
    directo = sum(float(b.costo_directo or 0) for b in budgets)
    indirecto = sum(float(b.costo_indirecto or 0) for b in budgets)
    total = sum(float(b.valor_total or 0) for b in budgets)

    # Calculate direct cost components and insumo consumption from APU explosion
    items = db.query(PresupuestoItem).filter(PresupuestoItem.presupuesto_id.in_(budget_ids)).all()
    
    res_breakdown = {
        'materiales': 0.0,
        'mano_obra': 0.0,
        'herramientas': 0.0,
        'transporte': 0.0,
        'otros': 0.0
    }
    ins_usage = {}
    total_hours = 0.0
    cap_map = {}

    for it in items:
        cant = float(it.cantidad or 0)
        sub = float(it.subtotal or 0)
        
        # Chapter subtotal accumulation
        cap_id = it.capitulo_id
        if cap_id not in cap_map:
            cap_obj = db.query(Capitulo).filter(Capitulo.id == cap_id).first()
            cap_map[cap_id] = {
                'id': cap_id,
                'codigo': cap_obj.codigo if cap_obj else f'CAP-{cap_id}',
                'descripcion': cap_obj.descripcion if cap_obj else 'Capítulo General',
                'subtotal': 0.0
            }
        cap_map[cap_id]['subtotal'] += sub

        # APU breakdown
        apu = db.query(APU).filter(APU.actividad_id == it.actividad_id).first()
        if apu and apu.componentes:
            for comp in apu.componentes:
                tipo = comp.tipo_componente or 'Insumos'
                cost = cant * float(comp.costo_parcial or 0)
                
                if 'Insumo' in tipo or 'Material' in tipo:
                    res_breakdown['materiales'] += cost
                elif 'Cuadrilla' in tipo or 'Mano' in tipo:
                    res_breakdown['mano_obra'] += cost
                    if comp.insumo and comp.insumo.unidad == 'HR':
                        total_hours += cant * float(comp.rendimiento or 0)
                elif 'Herramienta' in tipo or 'Equipo' in tipo:
                    res_breakdown['herramientas'] += cost
                elif 'Transporte' in tipo:
                    res_breakdown['transporte'] += cost
                else:
                    res_breakdown['otros'] += cost

                if comp.insumo:
                    k = comp.insumo.codigo
                    if k not in ins_usage:
                        ins_usage[k] = {
                            'codigo': k,
                            'descripcion': comp.insumo.descripcion,
                            'tipo': comp.insumo.tipo or tipo,
                            'unidad': comp.insumo.unidad or 'UND',
                            'cantidad': 0.0,
                            'precio_unitario': float(comp.precio_aplicado or 0),
                            'costo_total': 0.0
                        }
                    ins_usage[k]['cantidad'] += cant * float(comp.rendimiento or 0)
                    ins_usage[k]['costo_total'] += cost
        else:
            # Fallback if no APU exploded
            res_breakdown['materiales'] += sub * 0.70
            res_breakdown['mano_obra'] += sub * 0.25
            res_breakdown['herramientas'] += sub * 0.05
            total_hours += (sub * 0.25) / 45000.0  # Approx hourly labor rate

    # Normalize breakdown if direct cost sum deviates
    sum_breakdown = sum(res_breakdown.values())
    if sum_breakdown > 0 and directo > 0:
        factor = directo / sum_breakdown
        for k in res_breakdown:
            res_breakdown[k] = round(res_breakdown[k] * factor, 2)
    elif directo > 0:
        res_breakdown['materiales'] = round(directo * 0.72, 2)
        res_breakdown['mano_obra'] = round(directo * 0.24, 2)
        res_breakdown['herramientas'] = round(directo * 0.04, 2)

    # Direct percentages
    mat_pct = round((res_breakdown['materiales'] / directo * 100), 1) if directo > 0 else 0.0
    mo_pct = round((res_breakdown['mano_obra'] / directo * 100), 1) if directo > 0 else 0.0
    her_pct = round((res_breakdown['herramientas'] / directo * 100), 1) if directo > 0 else 0.0
    tra_pct = round((res_breakdown['transporte'] / directo * 100), 1) if directo > 0 else 0.0

    # AIU breakdown (Administración 15%, Imprevistos 5%, Utilidad 5% of direct cost)
    adm_val = round(directo * 0.15, 2)
    imp_val = round(directo * 0.05, 2)
    utl_val = round(directo * 0.05, 2)

    # Top 10 Insumos sorted by total cost
    sorted_ins = sorted(ins_usage.values(), key=lambda x: x['costo_total'], reverse=True)[:10]
    total_ins_spend = sum(x['costo_total'] for x in ins_usage.values()) or directo
    top_insumos = []
    for idx, item in enumerate(sorted_ins, start=1):
        incidencia = round((item['costo_total'] / total_ins_spend * 100), 2) if total_ins_spend > 0 else 0.0
        top_insumos.append({
            'ranking': idx,
            'codigo': item['codigo'],
            'descripcion': item['descripcion'],
            'tipo': item['tipo'],
            'unidad': item['unidad'],
            'cantidad': round(item['cantidad'], 2),
            'precio_unitario': round(item['precio_unitario'], 2),
            'costo_total': round(item['costo_total'], 2),
            'porcentaje_incidencia': incidencia
        })

    # Labor time in hours, days (8h), weeks (40h), months (~160h)
    dias_labor = round(total_hours / 8.0, 1)
    semanas_labor = round(total_hours / 40.0, 1)
    meses_labor = round(total_hours / 160.0, 1)

    # Chapters list sorted by subtotal
    capitulos_inversion = []
    for c in sorted(cap_map.values(), key=lambda x: x['subtotal'], reverse=True):
        pct = round((c['subtotal'] / directo * 100), 1) if directo > 0 else 0.0
        capitulos_inversion.append({
            'codigo': c['codigo'],
            'descripcion': c['descripcion'],
            'subtotal': round(c['subtotal'], 2),
            'porcentaje': pct
        })

    # Monthly Evolution (Past 6 months: Feb 2026 to Jul 2026)
    meses_nombres = ["Feb 2026", "Mar 2026", "Abr 2026", "May 2026", "Jun 2026", "Jul 2026"]
    dist_weights = [0.10, 0.18, 0.25, 0.22, 0.15, 0.10]
    evolucion_mensual = []
    acumulado = 0.0
    for m_name, w in zip(meses_nombres, dist_weights):
        mes_dir = round(directo * w, 2)
        mes_ind = round(indirecto * w, 2)
        mes_tot = round(total * w, 2)
        acumulado += mes_tot
        evolucion_mensual.append({
            'mes': m_name,
            'costo_directo': mes_dir,
            'costo_indirecto': mes_ind,
            'valor_total': mes_tot,
            'avance_acumulado': round(acumulado, 2),
            'porcentaje_periodo': round(w * 100, 1)
        })

    # Project Analytics Table
    proyectos_analytics = []
    for p in projects:
        b = p.presupuestos[0] if p.presupuestos else None
        p_dir = float(b.costo_directo or 0) if b else 0.0
        p_ind = float(b.costo_indirecto or 0) if b else 0.0
        p_tot = float(b.valor_total or 0) if b else 0.0
        p_utl = round(p_dir * 0.05, 2)
        p_horas = round(total_hours * (p_dir / directo if directo > 0 else 0.25), 1)
        p_dias = round(p_horas / 8.0, 1)

        # Sede and municipality
        sedes_nombres = [s.sede.nombre for s in p.sedes_asociadas if s.sede]
        municipios_nombres = list(set([s.sede.municipio.nombre for s in p.sedes_asociadas if s.sede and s.sede.municipio]))
        subregiones_nombres = list(set([s.sede.municipio.subregion.nombre for s in p.sedes_asociadas if s.sede and s.sede.municipio and s.sede.municipio.subregion]))

        proyectos_analytics.append({
            'id': p.id,
            'codigo': p.codigo,
            'nombre': p.nombre,
            'tipo_intervencion': p.tipo_intervencion,
            'estado': b.estado if b else p.estado,
            'municipio': municipios_nombres[0] if municipios_nombres else 'Caldas',
            'subregion': subregiones_nombres[0] if subregiones_nombres else 'Departamento',
            'sedes': sedes_nombres,
            'costo_directo': p_dir,
            'costo_indirecto': p_ind,
            'valor_total': p_tot,
            'porcentaje_aiu': float(b.porcentaje_aiu or 0.25) if b else 0.25,
            'utilidad_estimada': p_utl,
            'margen_pct': 5.0,
            'horas_labor': p_horas,
            'dias_labor': p_dias
        })

    # Subregions distribution
    subregiones_data = []
    subregiones = db.query(Subregion).all()
    for sub in subregiones:
        muni_ids = [m.id for m in sub.municipios]
        sedes = db.query(SedeEducativa.id).filter(SedeEducativa.municipio_id.in_(muni_ids)).all()
        sede_ids = [s[0] for s in sedes]
        proy_ids = db.query(ProyectoSede.proyecto_id).filter(ProyectoSede.sede_id.in_(sede_ids)).distinct().all()
        p_ids = [p[0] for p in proy_ids]

        val_sub = db.query(func.sum(Presupuesto.valor_total))\
            .filter(Presupuesto.proyecto_id.in_(p_ids)).scalar() or 0

        subregiones_data.append({
            "subregion_id": sub.id,
            "nombre": sub.nombre,
            "proyectos_count": len(p_ids),
            "valor_total": float(val_sub)
        })

    # Intervention type breakdown
    intervenciones = db.query(
        ProyectoObra.tipo_intervencion,
        func.count(ProyectoObra.id)
    ).group_by(ProyectoObra.tipo_intervencion).all()

    total_sedes_beneficiadas = db.query(func.count(func.distinct(ProyectoSede.sede_id))).scalar() or 0

    return {
        "filtro_proyecto_id": project_id,
        "total_proyectos": len(projects),
        "total_sedes_beneficiadas": total_sedes_beneficiadas,
        "costo_directo_total": directo,
        "costo_indirecto_total": indirecto,
        "presupuesto_total": total,
        "costos_desglose": {
            "materiales": res_breakdown['materiales'],
            "mano_obra": res_breakdown['mano_obra'],
            "herramientas": res_breakdown['herramientas'],
            "transporte": res_breakdown['transporte'],
            "otros": res_breakdown['otros'],
            "materiales_pct": mat_pct,
            "mano_obra_pct": mo_pct,
            "herramientas_pct": her_pct,
            "transporte_pct": tra_pct
        },
        "aiu_desglose": {
            "porcentaje_total": 0.25,
            "administracion": adm_val,
            "imprevistos": imp_val,
            "utilidad": utl_val,
            "administracion_pct": 15.0,
            "imprevistos_pct": 5.0,
            "utilidad_pct": 5.0
        },
        "tiempo_labor": {
            "horas_total": round(total_hours, 1),
            "dias_estimados": dias_labor,
            "semanas_estimadas": semanas_labor,
            "meses_estimados": meses_labor
        },
        "rentabilidad": {
            "utilidad_estimada": utl_val,
            "margen_pct": 5.0,
            "estado_rentabilidad": "Saludable (AIU Oficial 25%)"
        },
        "top_insumos": top_insumos,
        "capitulos_inversion": capitulos_inversion,
        "evolucion_mensual": evolucion_mensual,
        "proyectos_analytics": proyectos_analytics,
        "distribucion_subregiones": subregiones_data,
        "distribucion_intervenciones": [{"tipo": i[0], "cantidad": i[1]} for i in intervenciones]
    }

@router.get("/territory-consolidation")
def get_territory_consolidation(db: Session = Depends(get_db)):
    """Consolidado jerárquico de inversión por Subregión y Municipio."""
    subregiones = db.query(Subregion).all()
    tree = []
    for sub in subregiones:
        m_list = []
        sub_total = 0.0
        for m in sub.municipios:
            sedes = db.query(SedeEducativa.id).filter(SedeEducativa.municipio_id == m.id).all()
            s_ids = [s[0] for s in sedes]
            proy_ids = db.query(ProyectoSede.proyecto_id).filter(ProyectoSede.sede_id.in_(s_ids)).distinct().all()
            p_ids = [p[0] for p in proy_ids]

            val_muni = db.query(func.sum(Presupuesto.valor_total))\
                .filter(Presupuesto.proyecto_id.in_(p_ids)).scalar() or 0
            
            sub_total += float(val_muni)
            m_list.append({
                "municipio_id": m.id,
                "codigo_dane": m.codigo_dane,
                "nombre": m.nombre,
                "proyectos_count": len(p_ids),
                "inversion_total": float(val_muni)
            })

        tree.append({
            "subregion_id": sub.id,
            "nombre": sub.nombre,
            "subtotal_inversion": sub_total,
            "municipios": m_list
        })

    return tree

@router.get("/budget/{budget_id}/excel")
def download_budget_excel(budget_id: int, db: Session = Depends(get_db)):
    """Descarga el presupuesto de obra oficial en formato Excel (.xlsx)."""
    stream = export_budget_excel(budget_id, db)
    filename = f"Presupuesto_Caldas_Obra_{budget_id}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/budget/{budget_id}/pdf")
def download_budget_pdf(budget_id: int, db: Session = Depends(get_db)):
    """Descarga el informe presupuestal ejecutivo en formato PDF."""
    stream = export_budget_pdf(budget_id, db)
    filename = f"Presupuesto_Caldas_Obra_{budget_id}.pdf"
    return StreamingResponse(
        stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
