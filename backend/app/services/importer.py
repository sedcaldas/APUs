import io
import hashlib
import json
from decimal import Decimal
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from sqlalchemy.orm import Session
from backend.app.models import (
    Insumo, PrecioInsumo, Presupuesto, PresupuestoItem, Actividad,
    ImportacionLote, ImportacionFilaError, AuditoriaCambio
)
from backend.app.services.audit import log_change
from backend.app.services.calculation import recalculate_budget

def generate_template(tipo: str) -> io.BytesIO:
    """Genera una plantilla Excel (.xlsx) con estilos institucionales y ejemplos."""
    wb = openpyxl.Workbook()
    ws = wb.active
    header_fill = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid") # Azul Caldas
    header_font = Font(color="FFFFFF", bold=True)
    border = Border(
        left=Side(style='thin', color='CCCCCC'),
        right=Side(style='thin', color='CCCCCC'),
        top=Side(style='thin', color='CCCCCC'),
        bottom=Side(style='thin', color='CCCCCC')
    )

    if tipo == "cantidades":
        ws.title = "Cantidades_Obra"
        headers = ["PRESUPUESTO_ID", "ACTIVIDAD_CODIGO", "CANTIDAD", "OBSERVACIONES"]
        ws.append(headers)
        # Sample rows
        ws.append([1, "00101", 150.50, "Replanteo y localización de bloque de aulas"])
        ws.append([1, "00201", 85.00, "Excavación manual en material común"])
        ws.append([1, "00501", 45.20, "Concreto 3000 PSI para zapatas y vigas"])
    elif tipo == "precios_insumos":
        ws.title = "Precios_Insumos"
        headers = ["CODIGO_INSUMO", "PRECIO_UNITARIO", "VIGENCIA", "FUENTE"]
        ws.append(headers)
        ws.append(["I1", 4750.00, 2026, "Ferretería Central Caldas Cotización 2026"])
        ws.append(["I2", 4450.00, 2026, "Distribuidora Aceros Manizales"])
        ws.append(["I3", 6200.00, 2026, "Proveedor Regional"])
    elif tipo == "insumos":
        ws.title = "Catalogo_Insumos"
        headers = ["CODIGO", "DESCRIPCION", "TIPO", "UNIDAD", "PRECIO_2026", "FUENTE", "OBSERVACIONES"]
        ws.append(headers)
        ws.append(["I9999", "CEMENTO GRIS TIPO UG SACO 50KG", "Insumos", "UND", 34500.00, "Argos Caldas", "Especificación NTC 121"])
    else:
        ws.title = "Plantilla"
        ws.append(["CAMPO_1", "CAMPO_2"])

    # Format header
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 24

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output

def validate_and_preview_import(
    file_bytes: bytes,
    filename: str,
    tipo: str,
    modo: str,
    db: Session
) -> dict:
    """
    Inspecciona y valida un archivo Excel o CSV sin persistir cambios en la BD.
    Retorna resumen numérico y desglose detallado de inconsistencias por fila.
    """
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"error": "El archivo está vacío."}

    header_row = [str(c).strip().upper() if c is not None else "" for c in rows[0]]
    data_rows = rows[1:]

    valid_count = 0
    errors = []
    nuevos = 0
    actualizados = 0
    sin_cambios = 0

    if tipo == "cantidades":
        # Required columns: PRESUPUESTO_ID, ACTIVIDAD_CODIGO, CANTIDAD
        col_presupuesto = header_row.index("PRESUPUESTO_ID") if "PRESUPUESTO_ID" in header_row else 0
        col_actividad = header_row.index("ACTIVIDAD_CODIGO") if "ACTIVIDAD_CODIGO" in header_row else 1
        col_cantidad = header_row.index("CANTIDAD") if "CANTIDAD" in header_row else 2

        for idx, row in enumerate(data_rows, start=2):
            if not any(row):
                continue
            pres_id_val = row[col_presupuesto] if len(row) > col_presupuesto else None
            act_cod_val = row[col_actividad] if len(row) > col_actividad else None
            cant_val = row[col_cantidad] if len(row) > col_cantidad else None

            # Validate presupuesto
            if pres_id_val is None or str(pres_id_val).strip() == "":
                errors.append({"fila": idx, "campo": "PRESUPUESTO_ID", "valor": str(pres_id_val), "motivo": "ID de presupuesto obligatorio"})
                continue
            try:
                pid = int(pres_id_val)
                presupuesto = db.query(Presupuesto).filter(Presupuesto.id == pid).first()
                if not presupuesto:
                    errors.append({"fila": idx, "campo": "PRESUPUESTO_ID", "valor": str(pid), "motivo": "El presupuesto no existe"})
                    continue
                if presupuesto.estado == "Aprobado":
                    errors.append({"fila": idx, "campo": "PRESUPUESTO_ID", "valor": str(pid), "motivo": "El presupuesto está Aprobado y Congelado"})
                    continue
            except ValueError:
                errors.append({"fila": idx, "campo": "PRESUPUESTO_ID", "valor": str(pres_id_val), "motivo": "ID de presupuesto debe ser un número entero"})
                continue

            # Validate actividad
            if not act_cod_val or str(act_cod_val).strip() == "":
                errors.append({"fila": idx, "campo": "ACTIVIDAD_CODIGO", "valor": "", "motivo": "Código de actividad obligatorio"})
                continue
            act_cod = str(act_cod_val).strip()
            actividad = db.query(Actividad).filter(Actividad.codigo == act_cod).first()
            if not actividad:
                errors.append({"fila": idx, "campo": "ACTIVIDAD_CODIGO", "valor": act_cod, "motivo": f"La actividad '{act_cod}' no existe en el catálogo maestro"})
                continue

            # Validate cantidad
            if cant_val is None or str(cant_val).strip() == "":
                errors.append({"fila": idx, "campo": "CANTIDAD", "valor": "", "motivo": "Cantidad es obligatoria"})
                continue
            try:
                cant_num = Decimal(str(cant_val))
                if cant_num < 0:
                    errors.append({"fila": idx, "campo": "CANTIDAD", "valor": str(cant_val), "motivo": "La cantidad no puede ser negativa"})
                    continue
            except Exception:
                errors.append({"fila": idx, "campo": "CANTIDAD", "valor": str(cant_val), "motivo": "Formato numérico no válido"})
                continue

            # Check if exists in budget
            existing_item = db.query(PresupuestoItem).filter(
                PresupuestoItem.presupuesto_id == pid,
                PresupuestoItem.actividad_id == actividad.id
            ).first()

            if existing_item:
                if existing_item.cantidad == cant_num:
                    sin_cambios += 1
                else:
                    actualizados += 1
            else:
                nuevos += 1
            valid_count += 1

    elif tipo == "precios_insumos":
        col_insumo = header_row.index("CODIGO_INSUMO") if "CODIGO_INSUMO" in header_row else 0
        col_precio = header_row.index("PRECIO_UNITARIO") if "PRECIO_UNITARIO" in header_row else 1
        col_vigencia = header_row.index("VIGENCIA") if "VIGENCIA" in header_row else 2

        for idx, row in enumerate(data_rows, start=2):
            if not any(row):
                continue
            ins_cod_val = row[col_insumo] if len(row) > col_insumo else None
            prec_val = row[col_precio] if len(row) > col_precio else None
            vig_val = row[col_vigencia] if len(row) > col_vigencia else 2026

            if not ins_cod_val or str(ins_cod_val).strip() == "":
                errors.append({"fila": idx, "campo": "CODIGO_INSUMO", "valor": "", "motivo": "Código de insumo obligatorio"})
                continue
            ins_cod = str(ins_cod_val).strip()
            insumo = db.query(Insumo).filter(Insumo.codigo == ins_cod).first()
            if not insumo:
                errors.append({"fila": idx, "campo": "CODIGO_INSUMO", "valor": ins_cod, "motivo": f"El insumo '{ins_cod}' no existe en el catálogo"})
                continue

            try:
                prec_num = Decimal(str(prec_val))
                if prec_num < 0:
                    errors.append({"fila": idx, "campo": "PRECIO_UNITARIO", "valor": str(prec_val), "motivo": "El precio no puede ser negativo"})
                    continue
            except Exception:
                errors.append({"fila": idx, "campo": "PRECIO_UNITARIO", "valor": str(prec_val), "motivo": "Precio debe ser un número válido"})
                continue

            try:
                vig_int = int(vig_val) if vig_val else 2026
            except ValueError:
                vig_int = 2026

            existing_price = db.query(PrecioInsumo).filter(
                PrecioInsumo.insumo_id == insumo.id,
                PrecioInsumo.vigencia == vig_int
            ).first()

            if existing_price:
                if existing_price.precio_unitario == prec_num:
                    sin_cambios += 1
                else:
                    actualizados += 1
            else:
                nuevos += 1
            valid_count += 1

    return {
        "archivo_nombre": filename,
        "archivo_hash": file_hash,
        "tipo": tipo,
        "modo": modo,
        "total_filas": len(data_rows),
        "validas": valid_count,
        "errores_count": len(errors),
        "nuevos": nuevos,
        "actualizados": actualizados,
        "sin_cambios": sin_cambios,
        "errores_muestra": errors[:50]
    }

def apply_import_transaction(
    file_bytes: bytes,
    filename: str,
    tipo: str,
    modo: str,
    usuario_nombre: str,
    db: Session
) -> dict:
    """Ejecuta la importación transaccional con auditoría estricta y registro de lote."""
    preview = validate_and_preview_import(file_bytes, filename, tipo, modo, db)
    if preview.get("errores_count", 0) > 0 and modo == "validar":
        return preview

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header_row = [str(c).strip().upper() if c is not None else "" for c in rows[0]]
    data_rows = rows[1:]

    lote = ImportacionLote(
        archivo_nombre=filename,
        archivo_hash=preview["archivo_hash"],
        tipo=tipo,
        modo=modo,
        estado="Aplicado",
        total_filas=preview["total_filas"],
        filas_validas=preview["validas"],
        filas_errores=preview["errores_count"],
        usuario_nombre=usuario_nombre,
        resumen_json=json.dumps(preview, ensure_ascii=False)
    )
    db.add(lote)
    db.commit()
    db.refresh(lote)

    # Save error rows if any
    for err in preview["errores_muestra"]:
        db.add(ImportacionFilaError(
            lote_id=lote.id,
            numero_fila=err["fila"],
            campo=err["campo"],
            valor_recibido=str(err["valor"]),
            descripcion_error=err["motivo"]
        ))
    db.commit()

    affected_budgets = set()

    if tipo == "cantidades":
        col_presupuesto = header_row.index("PRESUPUESTO_ID") if "PRESUPUESTO_ID" in header_row else 0
        col_actividad = header_row.index("ACTIVIDAD_CODIGO") if "ACTIVIDAD_CODIGO" in header_row else 1
        col_cantidad = header_row.index("CANTIDAD") if "CANTIDAD" in header_row else 2
        col_obs = header_row.index("OBSERVACIONES") if "OBSERVACIONES" in header_row else 3

        for row in data_rows:
            if not any(row):
                continue
            try:
                pid = int(row[col_presupuesto])
                act_cod = str(row[col_actividad]).strip()
                cant_num = Decimal(str(row[col_cantidad]))
                obs_val = str(row[col_obs]) if len(row) > col_obs and row[col_obs] else None

                actividad = db.query(Actividad).filter(Actividad.codigo == act_cod).first()
                if not actividad:
                    continue

                item = db.query(PresupuestoItem).filter(
                    PresupuestoItem.presupuesto_id == pid,
                    PresupuestoItem.actividad_id == actividad.id
                ).first()

                if item:
                    old_cant = item.cantidad
                    item.cantidad = cant_num
                    if obs_val:
                        item.observaciones = obs_val
                    log_change(
                        db, usuario_nombre, "Formulador", "PresupuestoItem",
                        str(item.id), "cantidad", str(old_cant), str(cant_num),
                        f"Actualización masiva lote {lote.id}", lote_id=lote.id
                    )
                else:
                    # Default chapter (Preliminares o el primer capitulo)
                    cap = db.query(PresupuestoItem).filter(PresupuestoItem.presupuesto_id == pid).first()
                    cap_id = cap.capitulo_id if cap else 1
                    new_item = PresupuestoItem(
                        presupuesto_id=pid,
                        capitulo_id=cap_id,
                        actividad_id=actividad.id,
                        cantidad=cant_num,
                        precio_unitario=actividad.precio_referencia or Decimal("0.00"),
                        subtotal=Decimal("0.00"),
                        orden=100,
                        observaciones=obs_val
                    )
                    db.add(new_item)
                    db.commit()
                    log_change(
                        db, usuario_nombre, "Formulador", "PresupuestoItem",
                        str(new_item.id), "creacion", None, f"Cant: {cant_num}",
                        f"Creación masiva lote {lote.id}", lote_id=lote.id
                    )

                affected_budgets.add(pid)
            except Exception:
                continue

    elif tipo == "precios_insumos":
        col_insumo = header_row.index("CODIGO_INSUMO") if "CODIGO_INSUMO" in header_row else 0
        col_precio = header_row.index("PRECIO_UNITARIO") if "PRECIO_UNITARIO" in header_row else 1
        col_vigencia = header_row.index("VIGENCIA") if "VIGENCIA" in header_row else 2
        col_fuente = header_row.index("FUENTE") if "FUENTE" in header_row else 3

        for row in data_rows:
            if not any(row):
                continue
            try:
                ins_cod = str(row[col_insumo]).strip()
                prec_num = Decimal(str(row[col_precio]))
                vig_int = int(row[col_vigencia]) if row[col_vigencia] else 2026
                fuente_val = str(row[col_fuente]) if len(row) > col_fuente and row[col_fuente] else "Importación Masiva"

                insumo = db.query(Insumo).filter(Insumo.codigo == ins_cod).first()
                if not insumo:
                    continue

                precio = db.query(PrecioInsumo).filter(
                    PrecioInsumo.insumo_id == insumo.id,
                    PrecioInsumo.vigencia == vig_int
                ).first()

                if precio:
                    old_p = precio.precio_unitario
                    precio.precio_unitario = prec_num
                    precio.fuente = fuente_val
                    log_change(
                        db, usuario_nombre, "Administrador de Costos", "PrecioInsumo",
                        str(precio.id), "precio_unitario", str(old_p), str(prec_num),
                        f"Actualización precio lote {lote.id}", lote_id=lote.id
                    )
                else:
                    precio = PrecioInsumo(
                        insumo_id=insumo.id,
                        vigencia=vig_int,
                        precio_unitario=prec_num,
                        fuente=fuente_val
                    )
                    db.add(precio)
                    db.commit()
                    log_change(
                        db, usuario_nombre, "Administrador de Costos", "PrecioInsumo",
                        str(precio.id), "creacion", None, str(prec_num),
                        f"Creación precio lote {lote.id}", lote_id=lote.id
                    )
            except Exception:
                continue

    # Recalculate affected budgets
    for pid in affected_budgets:
        recalculate_budget(pid, db)

    db.commit()
    preview["lote_id"] = lote.id
    return preview
