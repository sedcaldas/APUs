from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import ImportacionLote, ImportacionFilaError
from backend.app.services.importer import (
    generate_template, validate_and_preview_import, apply_import_transaction
)

router = APIRouter(prefix="/bulk", tags=["Operaciones Masivas e Importación Excel"])

@router.get("/template/{tipo}")
def download_template(tipo: str):
    """
    Descarga una plantilla Excel estándar para edición masiva.
    Tipos disponibles: 'cantidades', 'precios_insumos', 'insumos'.
    """
    if tipo not in ("cantidades", "precios_insumos", "insumos"):
        raise HTTPException(status_code=400, detail="Tipo de plantilla no válido")

    stream = generate_template(tipo)
    filename = f"Plantilla_Caldas_{tipo.upper()}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/preview")
async def preview_bulk_upload(
    file: UploadFile = File(...),
    tipo: str = Form(..., description="'cantidades', 'precios_insumos' o 'insumos'"),
    modo: str = Form("validar", description="'crear', 'actualizar', 'sincronizar' o 'validar'"),
    db: Session = Depends(get_db)
):
    """
    Valida previamente un archivo Excel o CSV sin aplicar modificaciones en la BD.
    Retorna el resumen de filas válidas, erróneas, nuevas y actualizadas.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="El archivo recibido está vacío.")

    try:
        preview = validate_and_preview_import(contents, file.filename, tipo, modo, db)
        return preview
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error analizando archivo: {str(e)}")

@router.post("/apply")
async def apply_bulk_upload(
    file: UploadFile = File(...),
    tipo: str = Form(...),
    modo: str = Form("actualizar"),
    usuario: str = Form("Administrador"),
    db: Session = Depends(get_db)
):
    """
    Ejecuta la importación transaccional masiva garantizando atomicidad,
    registro en bitácora de auditoría y captura de reporte de errores.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="El archivo recibido está vacío.")

    try:
        result = apply_import_transaction(contents, file.filename, tipo, modo, usuario, db)
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error ejecutando importación transaccional: {str(e)}")

@router.get("/batches")
def list_import_batches(db: Session = Depends(get_db)):
    """Historial de lotes de importación masiva procesados."""
    batches = db.query(ImportacionLote).order_by(ImportacionLote.id.desc()).all()
    results = []
    for b in batches:
        results.append({
            "id": b.id,
            "archivo_nombre": b.archivo_nombre,
            "tipo": b.tipo,
            "modo": b.modo,
            "estado": b.estado,
            "total_filas": b.total_filas,
            "filas_validas": b.filas_validas,
            "filas_errores": b.filas_errores,
            "usuario_nombre": b.usuario_nombre,
            "fecha": b.fecha.isoformat()
        })
    return results

@router.get("/batches/{batch_id}/errors")
def get_batch_errors(batch_id: int, db: Session = Depends(get_db)):
    """Obtiene el detalle línea a línea de errores para un lote específico."""
    lote = db.query(ImportacionLote).filter(ImportacionLote.id == batch_id).first()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote de importación no encontrado")

    errors = db.query(ImportacionFilaError).filter(ImportacionFilaError.lote_id == batch_id).all()
    return [
        {
            "id": err.id,
            "numero_fila": err.numero_fila,
            "campo": err.campo,
            "valor_recibido": err.valor_recibido,
            "descripcion_error": err.descripcion_error
        }
        for err in errors
    ]
