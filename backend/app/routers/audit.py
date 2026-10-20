from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import AuditoriaCambio
from backend.app.schemas import AuditoriaRead

router = APIRouter(prefix="/audit", tags=["Auditoría y Trazabilidad"])

@router.get("", response_model=List[AuditoriaRead])
def list_audit_logs(
    entidad: Optional[str] = Query(None),
    usuario: Optional[str] = Query(None),
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(AuditoriaCambio)
    if entidad:
        query = query.filter(AuditoriaCambio.entidad == entidad)
    if usuario:
        query = query.filter(AuditoriaCambio.usuario == usuario)

    logs = query.order_by(AuditoriaCambio.id.desc()).limit(limit).all()
    return logs
