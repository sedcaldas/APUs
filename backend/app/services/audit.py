import datetime
from typing import Optional
from sqlalchemy.orm import Session
from backend.app.models import AuditoriaCambio

def log_change(
    db: Session,
    usuario: str,
    rol: str,
    entidad: str,
    registro_id: str,
    campo: Optional[str] = None,
    valor_anterior: Optional[str] = None,
    valor_nuevo: Optional[str] = None,
    motivo: Optional[str] = None,
    lote_id: Optional[int] = None
) -> AuditoriaCambio:
    """Registra una entrada en la bitácora inmutable de auditoría."""
    entry = AuditoriaCambio(
        usuario=usuario,
        rol=rol,
        entidad=entidad,
        registro_id=str(registro_id),
        campo=campo,
        valor_anterior=str(valor_anterior) if valor_anterior is not None else None,
        valor_nuevo=str(valor_nuevo) if valor_nuevo is not None else None,
        motivo=motivo,
        fecha=datetime.datetime.utcnow(),
        lote_id=lote_id
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
