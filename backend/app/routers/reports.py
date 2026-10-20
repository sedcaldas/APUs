from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.database import get_db
from backend.app.models import (
    Presupuesto, ProyectoObra, ProyectoSede, SedeEducativa, Municipio, Subregion
)
from backend.app.services.exporter import export_budget_excel, export_budget_pdf

router = APIRouter(prefix="/reports", tags=["Reportes, Consolidados y Exportaciones"])

@router.get("/dashboard")
def get_dashboard_metrics(db: Session = Depends(get_db)):
    """Métricas ejecutivas para el tablero de control de Caldas."""
    total_proy = db.query(func.count(ProyectoObra.id)).scalar() or 0
    total_sedes_beneficiadas = db.query(func.count(func.distinct(ProyectoSede.sede_id))).scalar() or 0
    
    totales_pres = db.query(
        func.sum(Presupuesto.costo_directo),
        func.sum(Presupuesto.costo_indirecto),
        func.sum(Presupuesto.valor_total)
    ).first()

    directo = float(totales_pres[0] or 0)
    indirecto = float(totales_pres[1] or 0)
    total = float(totales_pres[2] or 0)

    # Subregions distribution
    subregiones_data = []
    subregiones = db.query(Subregion).all()
    for sub in subregiones:
        muni_ids = [m.id for m in sub.municipios]
        # Find projects covering these municipalities
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

    return {
        "total_proyectos": total_proy,
        "total_sedes_beneficiadas": total_sedes_beneficiadas,
        "costo_directo_total": directo,
        "costo_indirecto_total": indirecto,
        "presupuesto_total": total,
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
