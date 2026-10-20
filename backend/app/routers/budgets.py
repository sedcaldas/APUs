from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import (
    Presupuesto, PresupuestoItem, Capitulo, Actividad, ProyectoObra, APU
)
from backend.app.schemas import (
    PresupuestoRead, PresupuestoItemRead, PresupuestoItemCreate, PresupuestoItemUpdate
)
from backend.app.services.calculation import recalculate_budget, freeze_budget_snapshot
from backend.app.services.audit import log_change

router = APIRouter(prefix="/budgets", tags=["Presupuestos y Partidas de Obra"])

@router.get("/{budget_id}")
def get_budget_detail(budget_id: int, db: Session = Depends(get_db)):
    pres = db.query(Presupuesto).filter(Presupuesto.id == budget_id).first()
    if not pres:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    # Group items by chapter
    items_by_chapter = {}
    sorted_items = sorted(pres.items, key=lambda x: (x.capitulo.orden, x.orden))
    
    for it in sorted_items:
        cap_id = it.capitulo_id
        if cap_id not in items_by_chapter:
            items_by_chapter[cap_id] = {
                "capitulo_id": cap_id,
                "codigo": it.capitulo.codigo,
                "descripcion": it.capitulo.descripcion,
                "subtotal_capitulo": 0.0,
                "items": []
            }
        
        sub = float(it.subtotal)
        items_by_chapter[cap_id]["subtotal_capitulo"] += sub
        items_by_chapter[cap_id]["items"].append({
            "id": it.id,
            "item_num": it.item_num or f"{it.capitulo.codigo}.{it.orden}",
            "actividad_id": it.actividad_id,
            "actividad_codigo": it.actividad.codigo,
            "actividad_desc": it.actividad.descripcion,
            "unidad": it.actividad.unidad,
            "cantidad": float(it.cantidad),
            "precio_unitario": float(it.precio_unitario),
            "subtotal": sub,
            "orden": it.orden,
            "observaciones": it.observaciones
        })

    return {
        "id": pres.id,
        "proyecto_id": pres.proyecto_id,
        "proyecto_codigo": pres.proyecto.codigo,
        "proyecto_nombre": pres.proyecto.nombre,
        "version": pres.version,
        "vigencia": pres.vigencia,
        "estado": pres.estado,
        "costo_directo": float(pres.costo_directo),
        "costo_indirecto": float(pres.costo_indirecto),
        "porcentaje_aiu": float(pres.porcentaje_aiu or 0.25),
        "valor_total": float(pres.valor_total),
        "moneda": pres.moneda,
        "observaciones": pres.observaciones,
        "aprobado_por": pres.aprobado_por,
        "fecha_aprobacion": pres.fecha_aprobacion.isoformat() if pres.fecha_aprobacion else None,
        "capitulos": list(items_by_chapter.values())
    }

@router.post("/{budget_id}/items")
def add_item_to_budget(
    budget_id: int,
    data: PresupuestoItemCreate,
    usuario: str = "Formulador",
    rol: str = "Formulador",
    db: Session = Depends(get_db)
):
    pres = db.query(Presupuesto).filter(Presupuesto.id == budget_id).first()
    if not pres:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    if pres.estado == "Aprobado":
        raise HTTPException(status_code=400, detail="El presupuesto está Aprobado y Congelado. No se pueden agregar ítems.")

    actividad = db.query(Actividad).filter(Actividad.id == data.actividad_id).first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    capitulo = db.query(Capitulo).filter(Capitulo.id == data.capitulo_id).first()
    if not capitulo:
        raise HTTPException(status_code=404, detail="Capítulo no encontrado")

    precio = data.precio_unitario if data.precio_unitario is not None else actividad.precio_referencia

    item = PresupuestoItem(
        presupuesto_id=budget_id,
        capitulo_id=data.capitulo_id,
        actividad_id=data.actividad_id,
        item_num=data.item_num,
        cantidad=data.cantidad,
        precio_unitario=precio or Decimal("0.00"),
        subtotal=Decimal("0.00"),
        orden=data.orden or 1,
        observaciones=data.observaciones
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # Recalculate
    pres = recalculate_budget(budget_id, db)

    log_change(
        db, usuario, rol, "PresupuestoItem",
        str(item.id), "creacion", None, f"Cant: {item.cantidad}, Act: {actividad.codigo}",
        "Adición de actividad al presupuesto"
    )

    return {"message": "Ítem agregado exitosamente", "item_id": item.id, "valor_total": float(pres.valor_total)}

@router.put("/items/{item_id}")
def update_item(
    item_id: int,
    data: PresupuestoItemUpdate,
    usuario: str = "Formulador",
    rol: str = "Formulador",
    db: Session = Depends(get_db)
):
    item = db.query(PresupuestoItem).filter(PresupuestoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")

    if item.presupuesto.estado == "Aprobado":
        raise HTTPException(status_code=400, detail="El presupuesto está Aprobado y Congelado. No se pueden editar cantidades ni precios.")

    cambios = []
    if data.cantidad is not None and data.cantidad != item.cantidad:
        cambios.append(("cantidad", str(item.cantidad), str(data.cantidad)))
        item.cantidad = data.cantidad

    if data.precio_unitario is not None and data.precio_unitario != item.precio_unitario:
        cambios.append(("precio_unitario", str(item.precio_unitario), str(data.precio_unitario)))
        item.precio_unitario = data.precio_unitario

    if data.orden is not None:
        item.orden = data.orden
    if data.observaciones is not None:
        item.observaciones = data.observaciones

    db.commit()
    pres = recalculate_budget(item.presupuesto_id, db)

    for campo, val_ant, val_nvo in cambios:
        log_change(
            db, usuario, rol, "PresupuestoItem",
            str(item.id), campo, val_ant, val_nvo,
            data.motivo_cambio or "Edición directa de partida"
        )

    return {
        "message": "Ítem actualizado exitosamente",
        "item_id": item.id,
        "subtotal": float(item.subtotal),
        "costo_directo": float(pres.costo_directo),
        "valor_total": float(pres.valor_total)
    }

@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    usuario: str = "Formulador",
    rol: str = "Formulador",
    db: Session = Depends(get_db)
):
    item = db.query(PresupuestoItem).filter(PresupuestoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")

    if item.presupuesto.estado == "Aprobado":
        raise HTTPException(status_code=400, detail="El presupuesto está Aprobado y Congelado. No se pueden eliminar ítems.")

    pid = item.presupuesto_id
    desc = f"{item.actividad.codigo} - Cant: {item.cantidad}"
    db.delete(item)
    db.commit()

    pres = recalculate_budget(pid, db)

    log_change(
        db, usuario, rol, "PresupuestoItem",
        str(item_id), "eliminacion", desc, None, "Eliminación de ítem de presupuesto"
    )

    return {"message": "Ítem eliminado", "valor_total": float(pres.valor_total)}

@router.post("/{budget_id}/approve")
def approve_budget(
    budget_id: int,
    aprobado_por: str = "Ing. Revisor Secretaría de Educación",
    rol: str = "Aprobador",
    db: Session = Depends(get_db)
):
    if rol not in ("Aprobador", "Administrador"):
        raise HTTPException(status_code=403, detail="Permisos insuficientes: Solo un Aprobador o Administrador puede congelar presupuestos.")

    try:
        pres = freeze_budget_snapshot(budget_id, aprobado_por, db)
        log_change(
            db, aprobado_por, rol, "Presupuesto",
            str(pres.id), "estado", "Borrador/En Revisión", "Aprobado",
            "Aprobación oficial y congelación inmutable de instantánea de presupuesto"
        )
        return {
            "message": f"Presupuesto v{pres.version} aprobado y congelado exitosamente.",
            "presupuesto_id": pres.id,
            "estado": pres.estado,
            "valor_total": float(pres.valor_total),
            "aprobado_por": pres.aprobado_por,
            "fecha_aprobacion": pres.fecha_aprobacion.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{budget_id}/clone_version")
def clone_budget_version(
    budget_id: int,
    usuario: str = "Formulador",
    rol: str = "Formulador",
    db: Session = Depends(get_db)
):
    """Crea una nueva versión (escenario alternativo) a partir de una existente."""
    base_pres = db.query(Presupuesto).filter(Presupuesto.id == budget_id).first()
    if not base_pres:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")

    # Find highest version for this project
    max_ver = db.query(Presupuesto).filter(Presupuesto.proyecto_id == base_pres.proyecto_id).count()
    new_version_num = max_ver + 1

    new_pres = Presupuesto(
        proyecto_id=base_pres.proyecto_id,
        version=new_version_num,
        vigencia=base_pres.vigencia,
        estado="Borrador",
        porcentaje_aiu=base_pres.porcentaje_aiu,
        moneda=base_pres.moneda,
        observaciones=f"Copia creada a partir de v{base_pres.version} para evaluación de escenario"
    )
    db.add(new_pres)
    db.commit()
    db.refresh(new_pres)

    # Clone items
    for it in base_pres.items:
        db.add(PresupuestoItem(
            presupuesto_id=new_pres.id,
            capitulo_id=it.capitulo_id,
            actividad_id=it.actividad_id,
            item_num=it.item_num,
            cantidad=it.cantidad,
            precio_unitario=it.precio_unitario,
            subtotal=it.subtotal,
            orden=it.orden,
            observaciones=it.observaciones
        ))
    db.commit()

    new_pres = recalculate_budget(new_pres.id, db)

    log_change(
        db, usuario, rol, "Presupuesto",
        str(new_pres.id), "clonacion", f"v{base_pres.version}", f"v{new_version_num}",
        "Creación de nueva versión presupuestal para análisis de escenarios"
    )

    return {
        "message": f"Nueva versión v{new_version_num} generada exitosamente",
        "new_budget_id": new_pres.id,
        "version": new_version_num,
        "valor_total": float(new_pres.valor_total)
    }

@router.get("/compare/{budget_id_1}/{budget_id_2}")
def compare_budget_versions(budget_id_1: int, budget_id_2: int, db: Session = Depends(get_db)):
    """Compara exhaustivamente dos presupuestos o versiones."""
    b1 = db.query(Presupuesto).filter(Presupuesto.id == budget_id_1).first()
    b2 = db.query(Presupuesto).filter(Presupuesto.id == budget_id_2).first()
    if not b1 or not b2:
        raise HTTPException(status_code=404, detail="Uno o ambos presupuestos no existen")

    dict1 = {it.actividad.codigo: it for it in b1.items}
    dict2 = {it.actividad.codigo: it for it in b2.items}

    all_keys = set(dict1.keys()) | set(dict2.keys())
    differences = []

    for k in sorted(all_keys):
        it1 = dict1.get(k)
        it2 = dict2.get(k)

        if it1 and not it2:
            differences.append({
                "codigo": k,
                "descripcion": it1.actividad.descripcion,
                "tipo_cambio": "Eliminado en v2",
                "v1_cant": float(it1.cantidad),
                "v2_cant": 0.0,
                "v1_subtotal": float(it1.subtotal),
                "v2_subtotal": 0.0,
                "delta_subtotal": -float(it1.subtotal)
            })
        elif not it1 and it2:
            differences.append({
                "codigo": k,
                "descripcion": it2.actividad.descripcion,
                "tipo_cambio": "Agregado en v2",
                "v1_cant": 0.0,
                "v2_cant": float(it2.cantidad),
                "v1_subtotal": 0.0,
                "v2_subtotal": float(it2.subtotal),
                "delta_subtotal": float(it2.subtotal)
            })
        else:
            diff_sub = float(it2.subtotal - it1.subtotal)
            diff_cant = float(it2.cantidad - it1.cantidad)
            diff_p = float(it2.precio_unitario - it1.precio_unitario)
            if abs(diff_sub) > 0.001 or abs(diff_cant) > 0.001 or abs(diff_p) > 0.001:
                tipo = "Cantidad modificada" if abs(diff_cant) > 0.001 else "Precio unitario modificado"
                differences.append({
                    "codigo": k,
                    "descripcion": it1.actividad.descripcion,
                    "tipo_cambio": tipo,
                    "v1_cant": float(it1.cantidad),
                    "v2_cant": float(it2.cantidad),
                    "v1_subtotal": float(it1.subtotal),
                    "v2_subtotal": float(it2.subtotal),
                    "delta_subtotal": diff_sub
                })

    return {
        "presupuesto_1": {
            "id": b1.id,
            "version": b1.version,
            "estado": b1.estado,
            "costo_directo": float(b1.costo_directo),
            "costo_indirecto": float(b1.costo_indirecto),
            "valor_total": float(b1.valor_total)
        },
        "presupuesto_2": {
            "id": b2.id,
            "version": b2.version,
            "estado": b2.estado,
            "costo_directo": float(b2.costo_directo),
            "costo_indirecto": float(b2.costo_indirecto),
            "valor_total": float(b2.valor_total)
        },
        "delta_total": float(b2.valor_total - b1.valor_total),
        "delta_costo_directo": float(b2.costo_directo - b1.costo_directo),
        "items_con_diferencias": differences
    }
