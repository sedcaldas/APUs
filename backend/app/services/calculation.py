from decimal import Decimal, ROUND_HALF_UP
import json
from sqlalchemy.orm import Session
from backend.app.models import Presupuesto, PresupuestoItem, APU, APUComponente, Insumo, PrecioInsumo, Actividad

def round_money(val: Decimal) -> Decimal:
    """Regla estándar de redondeo presupuestal a 2 decimales exactos."""
    if val is None:
        return Decimal("0.00")
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def round_rate(val: Decimal) -> Decimal:
    """Redondeo a 4 decimales para cantidades y precios unitarios."""
    if val is None:
        return Decimal("0.0000")
    return Decimal(str(val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

def check_apu_cycles(apu_id: int, db: Session, visited: set = None) -> bool:
    """Verifica si existe un ciclo en la jerarquía de APUs anidados."""
    if visited is None:
        visited = set()
    if apu_id in visited:
        return True # Ciclo detectado
    visited.add(apu_id)

    components = db.query(APUComponente).filter(APUComponente.apu_id == apu_id).all()
    for comp in components:
        if comp.apu_hijo_id:
            if check_apu_cycles(comp.apu_hijo_id, db, visited.copy()):
                return True
    return False

def calculate_apu_cost(apu_id: int, db: Session) -> Decimal:
    """Calcula el costo unitario de un APU sumando sus componentes recursivamente."""
    if check_apu_cycles(apu_id, db):
        raise ValueError(f"Ciclo detectado en la composición del APU {apu_id}")

    components = db.query(APUComponente).filter(APUComponente.apu_id == apu_id).all()
    total = Decimal("0.0000")

    for comp in components:
        # Si referencia otro APU básico
        if comp.apu_hijo_id:
            sub_cost = calculate_apu_cost(comp.apu_hijo_id, db)
            comp.precio_aplicado = round_rate(sub_cost)
        comp.costo_parcial = round_rate(Decimal(str(comp.rendimiento)) * Decimal(str(comp.precio_aplicado)))
        total += comp.costo_parcial

    apu = db.query(APU).filter(APU.id == apu_id).first()
    if apu:
        apu.costo_directo_total = round_rate(total)
        db.commit()

    return round_rate(total)

def recalculate_budget(budget_id: int, db: Session) -> Presupuesto:
    """
    Recalcula íntegramente los subtotales de los ítems, el costo directo,
    el AIU / indirectos y el gran total del presupuesto.
    Si el presupuesto está APROBADO, lanza un error impidiendo alteración.
    """
    presupuesto = db.query(Presupuesto).filter(Presupuesto.id == budget_id).first()
    if not presupuesto:
        raise ValueError(f"Presupuesto {budget_id} no encontrado")

    if presupuesto.estado == "Aprobado":
        raise ValueError("El presupuesto se encuentra APROBADO y CONGELADO. No se pueden alterar sus cifras.")

    items = db.query(PresupuestoItem).filter(PresupuestoItem.presupuesto_id == budget_id).all()

    costo_directo_acumulado = Decimal("0.00")
    for item in items:
        # Subtotal del ítem = cantidad * precio_unitario
        cant = Decimal(str(item.cantidad or 0))
        prec = Decimal(str(item.precio_unitario or 0))
        subtotal = round_money(cant * prec)
        item.subtotal = subtotal
        costo_directo_acumulado += subtotal

    presupuesto.costo_directo = costo_directo_acumulado

    # Cálculo de AIU e indirectos:
    # Si tiene análisis indirectos específicos asociados al presupuesto, sumarlos
    total_indirectos = Decimal("0.00")
    if presupuesto.analisis_indirectos:
        for ind in presupuesto.analisis_indirectos:
            total_indirectos += Decimal(str(ind.valor_total or 0))
    elif presupuesto.porcentaje_aiu and Decimal(str(presupuesto.porcentaje_aiu)) > 0:
        total_indirectos = round_money(costo_directo_acumulado * Decimal(str(presupuesto.porcentaje_aiu)))
    else:
        # AIU por defecto institucional de Caldas (e.g., 25% = 15% Administración, 5% Imprevistos, 5% Utilidad)
        pct_default = Decimal("0.25")
        presupuesto.porcentaje_aiu = pct_default
        total_indirectos = round_money(costo_directo_acumulado * pct_default)

    presupuesto.costo_indirecto = round_money(total_indirectos)
    presupuesto.valor_total = round_money(presupuesto.costo_directo + presupuesto.costo_indirecto)

    db.commit()
    db.refresh(presupuesto)
    return presupuesto

def freeze_budget_snapshot(budget_id: int, aprobado_por: str, db: Session) -> Presupuesto:
    """
    Aprueba y congela un presupuesto generando una instantánea JSON inmutable
    con todos los ítems, cantidades, precios vigentes, APUs y parámetros AIU.
    """
    presupuesto = recalculate_budget(budget_id, db)
    
    items_snapshot = []
    for item in presupuesto.items:
        items_snapshot.append({
            "id": item.id,
            "capitulo_codigo": item.capitulo.codigo,
            "capitulo_desc": item.capitulo.descripcion,
            "actividad_codigo": item.actividad.codigo,
            "actividad_desc": item.actividad.descripcion,
            "actividad_unidad": item.actividad.unidad,
            "cantidad": str(item.cantidad),
            "precio_unitario": str(item.precio_unitario),
            "subtotal": str(item.subtotal),
            "orden": item.orden
        })

    snapshot = {
        "version": presupuesto.version,
        "vigencia": presupuesto.vigencia,
        "fecha_aprobacion": str(presupuesto.fecha_aprobacion or ""),
        "aprobado_por": aprobado_por,
        "costo_directo": str(presupuesto.costo_directo),
        "costo_indirecto": str(presupuesto.costo_indirecto),
        "porcentaje_aiu": str(presupuesto.porcentaje_aiu),
        "valor_total": str(presupuesto.valor_total),
        "items": items_snapshot
    }

    import datetime
    presupuesto.estado = "Aprobado"
    presupuesto.aprobado_por = aprobado_por
    presupuesto.fecha_aprobacion = datetime.datetime.utcnow()
    presupuesto.snapshot_data = json.dumps(snapshot, ensure_ascii=False)

    db.commit()
    db.refresh(presupuesto)
    return presupuesto
