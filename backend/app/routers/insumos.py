from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from backend.app.database import get_db
from backend.app.models import Insumo, PrecioInsumo, Presupuesto, PresupuestoItem, APUComponente
from backend.app.schemas import InsumoRead, InsumoPriceUpdate
from backend.app.services.audit import log_change

router = APIRouter(prefix="/insumos", tags=["Insumos, Materiales y Cuadrillas"])

@router.get("")
def list_insumos(
    search: Optional[str] = Query(None, description="Buscar por código o descripción"),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo (Insumos, Cuadrilla, Herramienta)"),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Insumo)
    if search:
        s = f"%{search}%"
        query = query.filter(or_(Insumo.codigo.ilike(s), Insumo.descripcion.ilike(s)))
    if tipo:
        query = query.filter(Insumo.tipo == tipo)

    total = query.count()
    insumos = query.order_by(Insumo.codigo).offset(offset).limit(limit).all()

    results = []
    for ins in insumos:
        p2026 = next((p.precio_unitario for p in ins.precios if p.vigencia == 2026), None)
        p2025 = next((p.precio_unitario for p in ins.precios if p.vigencia == 2025), None)
        results.append({
            "id": ins.id,
            "codigo": ins.codigo,
            "descripcion": ins.descripcion,
            "tipo": ins.tipo,
            "unidad": ins.unidad,
            "fuente": ins.fuente,
            "precio_2026": float(p2026) if p2026 is not None else 0.0,
            "precio_2025": float(p2025) if p2025 is not None else 0.0,
            "observaciones": ins.observaciones
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": results
    }

@router.get("/{insumo_id}")
def get_insumo_detail(insumo_id: int, db: Session = Depends(get_db)):
    ins = db.query(Insumo).filter(Insumo.id == insumo_id).first()
    if not ins:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    precios_list = [
        {
            "vigencia": p.vigencia,
            "precio_unitario": float(p.precio_unitario),
            "fuente": p.fuente,
            "fecha": p.fecha_precio.isoformat() if p.fecha_precio else None
        }
        for p in ins.precios
    ]

    # Check APUs using this insumo
    apus_using = len(ins.componentes_usados)

    return {
        "id": ins.id,
        "codigo": ins.codigo,
        "descripcion": ins.descripcion,
        "tipo": ins.tipo,
        "unidad": ins.unidad,
        "fuente": ins.fuente,
        "observaciones": ins.observaciones,
        "precios": precios_list,
        "apus_asociados_count": apus_using
    }

@router.put("/{insumo_id}/price")
def update_insumo_price(
    insumo_id: int,
    data: InsumoPriceUpdate,
    usuario: str = "Administrador de Costos",
    rol: str = "Administrador de Costos",
    db: Session = Depends(get_db)
):
    ins = db.query(Insumo).filter(Insumo.id == insumo_id).first()
    if not ins:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    precio = db.query(PrecioInsumo).filter(
        PrecioInsumo.insumo_id == insumo_id,
        PrecioInsumo.vigencia == data.vigencia
    ).first()

    old_price = "0.00"
    if precio:
        old_price = str(precio.precio_unitario)
        precio.precio_unitario = data.precio_unitario
        if data.fuente:
            precio.fuente = data.fuente
    else:
        precio = PrecioInsumo(
            insumo_id=insumo_id,
            vigencia=data.vigencia,
            precio_unitario=data.precio_unitario,
            fuente=data.fuente or "Actualización Directa"
        )
        db.add(precio)

    db.commit()

    # Log audit
    log_change(
        db, usuario, rol, "PrecioInsumo",
        str(insumo_id), f"precio_{data.vigencia}", old_price, str(data.precio_unitario),
        data.motivo or "Actualización individual de precio de insumo"
    )

    return {
        "message": f"Precio de insumo {ins.codigo} actualizado a ${float(data.precio_unitario):,.2f}",
        "insumo_id": ins.id,
        "codigo": ins.codigo,
        "vigencia": data.vigencia,
        "nuevo_precio": float(data.precio_unitario)
    }
