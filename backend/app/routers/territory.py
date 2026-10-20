from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.database import get_db
from backend.app.models import (
    Departamento, Subregion, Municipio, InstitucionEducativa, SedeEducativa,
    ProyectoObra, ProyectoSede, Presupuesto
)
from backend.app.schemas import (
    DepartamentoRead, SubregionRead, MunicipioRead,
    InstitucionEducativaRead, SedeEducativaRead
)

router = APIRouter(prefix="/territory", tags=["Territorio e Infraestructura Educativa"])

@router.get("/departamentos", response_model=List[DepartamentoRead])
def get_departamentos(db: Session = Depends(get_db)):
    return db.query(Departamento).all()

@router.get("/subregiones", response_model=List[SubregionRead])
def get_subregiones(db: Session = Depends(get_db)):
    return db.query(Subregion).all()

@router.get("/municipios", response_model=List[MunicipioRead])
def get_municipios(
    subregion_id: Optional[int] = Query(None, description="Filtrar por subregión"),
    db: Session = Depends(get_db)
):
    query = db.query(Municipio)
    if subregion_id:
        query = query.filter(Municipio.subregion_id == subregion_id)
    return query.order_by(Municipio.nombre).all()

@router.get("/instituciones", response_model=List[InstitucionEducativaRead])
def get_instituciones(
    municipio_id: Optional[int] = Query(None, description="Filtrar por municipio"),
    db: Session = Depends(get_db)
):
    query = db.query(InstitucionEducativa)
    if municipio_id:
        query = query.filter(InstitucionEducativa.municipio_id == municipio_id)
    return query.order_by(InstitucionEducativa.nombre).all()

@router.get("/sedes", response_model=List[SedeEducativaRead])
def get_sedes(
    institucion_id: Optional[int] = Query(None, description="Filtrar por institución educativa"),
    municipio_id: Optional[int] = Query(None, description="Filtrar por municipio"),
    zona: Optional[str] = Query(None, description="Urbana o Rural"),
    db: Session = Depends(get_db)
):
    query = db.query(SedeEducativa)
    if institucion_id:
        query = query.filter(SedeEducativa.institucion_id == institucion_id)
    if municipio_id:
        query = query.filter(SedeEducativa.municipio_id == municipio_id)
    if zona:
        query = query.filter(SedeEducativa.zona == zona)
    return query.order_by(SedeEducativa.nombre).all()

@router.get("/stats")
def get_territory_stats(db: Session = Depends(get_db)):
    """Resumen cuantitativo del territorio e inversión educativa de Caldas."""
    subregiones_count = db.query(func.count(Subregion.id)).scalar() or 0
    municipios_count = db.query(func.count(Municipio.id)).scalar() or 0
    instituciones_count = db.query(func.count(InstitucionEducativa.id)).scalar() or 0
    sedes_count = db.query(func.count(SedeEducativa.id)).scalar() or 0
    proyectos_count = db.query(func.count(ProyectoObra.id)).scalar() or 0
    
    total_invertido = db.query(func.sum(Presupuesto.valor_total))\
        .filter(Presupuesto.estado.in_(["Aprobado", "En Revisión", "Borrador"])).scalar() or 0

    return {
        "departamento": "Caldas (17)",
        "subregiones_count": subregiones_count,
        "municipios_count": municipios_count,
        "instituciones_count": instituciones_count,
        "sedes_count": sedes_count,
        "proyectos_count": proyectos_count,
        "total_presupuestado": float(total_invertido)
    }
