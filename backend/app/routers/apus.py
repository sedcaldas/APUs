from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from backend.app.database import get_db
from backend.app.models import APU, APUComponente, Actividad, Insumo
from backend.app.services.calculation import calculate_apu_cost, check_apu_cycles

router = APIRouter(prefix="/apus", tags=["Análisis de Precios Unitarios (APU)"])

@router.get("")
def list_apus(
    search: Optional[str] = Query(None, description="Buscar por código o descripción"),
    categoria: Optional[str] = Query(None),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Actividad).join(APU, APU.actividad_id == Actividad.id)
    if search:
        s = f"%{search}%"
        query = query.filter(or_(Actividad.codigo.ilike(s), Actividad.descripcion.ilike(s)))
    if categoria:
        query = query.filter(Actividad.categoria == categoria)

    total = query.count()
    activities = query.order_by(Actividad.codigo).offset(offset).limit(limit).all()

    items = []
    for act in activities:
        apu = act.apus[0] if act.apus else None
        items.append({
            "actividad_id": act.id,
            "codigo": act.codigo,
            "descripcion": act.descripcion,
            "categoria": act.categoria,
            "unidad": act.unidad,
            "precio_referencia": float(act.precio_referencia or 0),
            "apu_id": apu.id if apu else None,
            "apu_costo_directo": float(apu.costo_directo_total) if apu else float(act.precio_referencia or 0),
            "componentes_count": len(apu.componentes) if apu else 0
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items
    }

@router.get("/{apu_id}")
def get_apu_detail(apu_id: int, db: Session = Depends(get_db)):
    apu = db.query(APU).filter(APU.id == apu_id).first()
    if not apu:
        raise HTTPException(status_code=404, detail="APU no encontrado")

    components_list = []
    for c in apu.componentes:
        codigo_recurso = ""
        desc_recurso = ""
        unidad_recurso = ""

        if c.insumo:
            codigo_recurso = c.insumo.codigo
            desc_recurso = c.insumo.descripcion
            unidad_recurso = c.insumo.unidad
        elif c.apu_hijo:
            codigo_recurso = c.apu_hijo.actividad.codigo
            desc_recurso = c.apu_hijo.actividad.descripcion
            unidad_recurso = c.apu_hijo.actividad.unidad

        components_list.append({
            "id": c.id,
            "tipo_componente": c.tipo_componente,
            "codigo": codigo_recurso,
            "descripcion": desc_recurso,
            "unidad": unidad_recurso,
            "rendimiento": float(c.rendimiento),
            "precio_aplicado": float(c.precio_aplicado),
            "costo_parcial": float(c.costo_parcial)
        })

    return {
        "id": apu.id,
        "actividad_id": apu.actividad_id,
        "codigo": apu.actividad.codigo,
        "descripcion": apu.actividad.descripcion,
        "categoria": apu.actividad.categoria,
        "unidad": apu.actividad.unidad,
        "version": apu.version,
        "costo_directo_total": float(apu.costo_directo_total),
        "estado": apu.estado,
        "componentes": components_list
    }

@router.post("/{apu_id}/recalculate")
def recalculate_single_apu(apu_id: int, db: Session = Depends(get_db)):
    try:
        new_cost = calculate_apu_cost(apu_id, db)
        return {
            "message": "APU recalculado exitosamente sin ciclos detectados",
            "apu_id": apu_id,
            "costo_directo_total": float(new_cost)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
