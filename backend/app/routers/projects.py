from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.database import get_db
from backend.app.models import ProyectoObra, ProyectoSede, Presupuesto, SedeEducativa
from backend.app.schemas import ProyectoCreate, ProyectoRead
from backend.app.services.audit import log_change

router = APIRouter(prefix="/projects", tags=["Proyectos de Infraestructura"])

@router.get("", response_model=List[ProyectoRead])
def get_projects(
    estado: Optional[str] = Query(None),
    tipo_intervencion: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(ProyectoObra)
    if estado:
        query = query.filter(ProyectoObra.estado == estado)
    if tipo_intervencion:
        query = query.filter(ProyectoObra.tipo_intervencion == tipo_intervencion)
    if search:
        s = f"%{search}%"
        query = query.filter((ProyectoObra.nombre.ilike(s)) | (ProyectoObra.codigo.ilike(s)))
    
    projects = query.order_by(ProyectoObra.id.desc()).all()
    results = []
    for p in projects:
        results.append(ProyectoRead(
            id=p.id,
            codigo=p.codigo,
            nombre=p.nombre,
            tipo_intervencion=p.tipo_intervencion,
            objeto=p.objeto,
            estado=p.estado,
            responsable=p.responsable,
            fuente_financiacion=p.fuente_financiacion,
            fecha_inicio=p.fecha_inicio,
            fecha_fin=p.fecha_fin,
            created_at=p.created_at,
            sedes_count=len(p.sedes_asociadas),
            presupuestos_count=len(p.presupuestos)
        ))
    return results

@router.get("/{project_id}")
def get_project_detail(project_id: int, db: Session = Depends(get_db)):
    p = db.query(ProyectoObra).filter(ProyectoObra.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    sedes_list = []
    for ps in p.sedes_asociadas:
        s = ps.sede
        sedes_list.append({
            "sede_id": s.id,
            "codigo_dane": s.codigo_dane,
            "nombre": s.nombre,
            "institucion_nombre": s.institucion.nombre,
            "municipio_nombre": s.municipio.nombre,
            "zona": s.zona,
            "alcance_sede": ps.alcance_sede
        })

    presupuestos_list = []
    for pr in sorted(p.presupuestos, key=lambda x: x.version, reverse=True):
        presupuestos_list.append({
            "id": pr.id,
            "version": pr.version,
            "vigencia": pr.vigencia,
            "estado": pr.estado,
            "costo_directo": float(pr.costo_directo),
            "costo_indirecto": float(pr.costo_indirecto),
            "valor_total": float(pr.valor_total),
            "items_count": len(pr.items),
            "fecha_aprobacion": pr.fecha_aprobacion.isoformat() if pr.fecha_aprobacion else None,
            "aprobado_por": pr.aprobado_por
        })

    return {
        "id": p.id,
        "codigo": p.codigo,
        "nombre": p.nombre,
        "tipo_intervencion": p.tipo_intervencion,
        "objeto": p.objeto,
        "estado": p.estado,
        "responsable": p.responsable,
        "fuente_financiacion": p.fuente_financiacion,
        "fecha_inicio": p.fecha_inicio,
        "fecha_fin": p.fecha_fin,
        "sedes": sedes_list,
        "presupuestos": presupuestos_list
    }

@router.post("", response_model=ProyectoRead)
def create_project(data: ProyectoCreate, db: Session = Depends(get_db)):
    existing = db.query(ProyectoObra).filter(ProyectoObra.codigo == data.codigo).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un proyecto con el código {data.codigo}")

    project = ProyectoObra(
        codigo=data.codigo,
        nombre=data.nombre,
        tipo_intervencion=data.tipo_intervencion,
        objeto=data.objeto,
        estado="Borrador",
        responsable=data.responsable,
        fuente_financiacion=data.fuente_financiacion,
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Link sedes
    if data.sedes:
        for s_link in data.sedes:
            ps = ProyectoSede(
                proyecto_id=project.id,
                sede_id=s_link.sede_id,
                alcance_sede=s_link.alcance_sede
            )
            db.add(ps)
        db.commit()

    # Create initial version 1 budget automatically
    initial_pres = Presupuesto(
        proyecto_id=project.id,
        version=1,
        vigencia=2026,
        estado="Borrador",
        porcentaje_aiu=0.25
    )
    db.add(initial_pres)
    db.commit()

    log_change(
        db, "Formulador", "Formulador", "ProyectoObra",
        str(project.id), "creacion", None, project.nombre, "Creación de proyecto con v1 inicial"
    )

    return ProyectoRead(
        id=project.id,
        codigo=project.codigo,
        nombre=project.nombre,
        tipo_intervencion=project.tipo_intervencion,
        objeto=project.objeto,
        estado=project.estado,
        responsable=project.responsable,
        fuente_financiacion=project.fuente_financiacion,
        fecha_inicio=project.fecha_inicio,
        fecha_fin=project.fecha_fin,
        created_at=project.created_at,
        sedes_count=len(data.sedes or []),
        presupuestos_count=1
    )
